#!/usr/bin/env bash
#
# CR_AGENTIC — one-shot AWS provisioning for the single-VM (Option A) deploy.
# Paste/run this in AWS CloudShell (or any shell with AWS CLI + admin creds).
#
# Creates, idempotently:
#   - S3 bucket for sessions/documents
#   - IAM role + instance profile (SSM Session Manager + scoped S3 access)
#   - Security group (inbound 80/443/3100; no SSH — connect via SSM)
#   - EC2 t3.medium Ubuntu 24.04 with Docker preinstalled (user-data)
#
# After it finishes, connect with:  aws ssm start-session --target <id>
# then follow CR_AGENTIC/docker/README.deploy.md from step 3.

set -euo pipefail

# ---- Config (override by exporting before running) -----------------------
REGION="${REGION:-us-east-1}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.medium}"
VOLUME_GB="${VOLUME_GB:-30}"
NAME="${NAME:-cr-agentic}"
ROLE_NAME="${ROLE_NAME:-${NAME}-ec2-role}"
PROFILE_NAME="${PROFILE_NAME:-${NAME}-ec2-profile}"
SG_NAME="${SG_NAME:-${NAME}-sg}"
# Bucket names are globally unique; suffix with account id.
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="${BUCKET:-${NAME}-documents-${ACCOUNT_ID}}"

echo "Region=$REGION  Account=$ACCOUNT_ID"
echo "Bucket=$BUCKET  Role=$ROLE_NAME  SG=$SG_NAME  Instance=$INSTANCE_TYPE"
echo

# ---- 1. S3 bucket --------------------------------------------------------
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "[s3] bucket $BUCKET already exists"
else
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
  aws s3api put-public-access-block --bucket "$BUCKET" \
    --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-encryption --bucket "$BUCKET" \
    --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
  echo "[s3] created $BUCKET"
fi

# ---- 2. IAM role + instance profile --------------------------------------
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "[iam] role $ROLE_NAME already exists"
else
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' >/dev/null
  echo "[iam] created role $ROLE_NAME"
fi

# SSM Session Manager access (browser-based shell, no SSH key needed).
aws iam attach-role-policy --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore || true

# Scoped S3 access to just this bucket.
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name "${NAME}-s3" \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[
      {\"Effect\":\"Allow\",\"Action\":[\"s3:ListBucket\"],\"Resource\":\"arn:aws:s3:::$BUCKET\"},
      {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/*\"}
    ]
  }"

if aws iam get-instance-profile --instance-profile-name "$PROFILE_NAME" >/dev/null 2>&1; then
  echo "[iam] instance profile $PROFILE_NAME already exists"
else
  aws iam create-instance-profile --instance-profile-name "$PROFILE_NAME" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$PROFILE_NAME" --role-name "$ROLE_NAME"
  echo "[iam] created instance profile $PROFILE_NAME"
  echo "[iam] waiting 10s for instance profile to propagate..."
  sleep 10
fi

# ---- 3. Security group (in default VPC) ----------------------------------
VPC_ID="$(aws ec2 describe-vpcs --region "$REGION" \
  --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
if [ "$VPC_ID" = "None" ] || [ -z "$VPC_ID" ]; then
  echo "ERROR: no default VPC found in $REGION. Set VPC_ID manually." >&2
  exit 1
fi

SG_ID="$(aws ec2 describe-security-groups --region "$REGION" \
  --filters Name=group-name,Values="$SG_NAME" Name=vpc-id,Values="$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo None)"
if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
  SG_ID="$(aws ec2 create-security-group --region "$REGION" \
    --group-name "$SG_NAME" --description "CR_AGENTIC agent stack" \
    --vpc-id "$VPC_ID" --query GroupId --output text)"
  echo "[sg] created $SG_ID"
  for PORT in 80 443 3100; do
    aws ec2 authorize-security-group-ingress --region "$REGION" \
      --group-id "$SG_ID" --protocol tcp --port "$PORT" --cidr 0.0.0.0/0 >/dev/null || true
  done
  echo "[sg] opened inbound 80, 443, 3100"
else
  echo "[sg] security group $SG_NAME already exists ($SG_ID)"
fi

# ---- 4. Launch EC2 -------------------------------------------------------
# Latest Ubuntu 24.04 LTS AMI (amd64) via the public SSM parameter.
AMI_ID="$(aws ssm get-parameters --region "$REGION" \
  --names /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
  --query 'Parameters[0].Value' --output text)"
echo "[ec2] Ubuntu 24.04 AMI: $AMI_ID"

EXISTING="$(aws ec2 describe-instances --region "$REGION" \
  --filters Name=tag:Name,Values="$NAME" "Name=instance-state-name,Values=pending,running" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null || echo None)"
if [ "$EXISTING" != "None" ] && [ -n "$EXISTING" ]; then
  echo "[ec2] instance already running: $EXISTING"
  INSTANCE_ID="$EXISTING"
else
  USER_DATA="$(cat <<'EOF'
#!/bin/bash
set -e
apt-get update
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker ubuntu
systemctl enable --now docker
EOF
)"
  INSTANCE_ID="$(aws ec2 run-instances --region "$REGION" \
    --image-id "$AMI_ID" --instance-type "$INSTANCE_TYPE" \
    --iam-instance-profile Name="$PROFILE_NAME" \
    --security-group-ids "$SG_ID" \
    --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$VOLUME_GB,VolumeType=gp3}" \
    --metadata-options "HttpTokens=required,HttpEndpoint=enabled" \
    --user-data "$USER_DATA" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" \
    --query 'Instances[0].InstanceId' --output text)"
  echo "[ec2] launched $INSTANCE_ID"
fi

echo "[ec2] waiting for instance to enter running state..."
aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"
PUBLIC_IP="$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"

echo
echo "==================== DONE ===================="
echo "Instance ID : $INSTANCE_ID"
echo "Public IP   : $PUBLIC_IP"
echo "S3 bucket   : $BUCKET   (set AWS_S3_BUCKET to this)"
echo "Region      : $REGION"
echo
echo "Connect (no SSH key needed):"
echo "  aws ssm start-session --target $INSTANCE_ID --region $REGION"
echo
echo "Then on the instance:"
echo "  sudo su - ubuntu"
echo "  git clone -b cr-agentic https://<GITHUB_TOKEN>@github.com/buchion/courserep_backend.git"
echo "  cd courserep_backend/CR_AGENTIC"
echo "  cp .env.prod.example .env && nano .env   # set AWS_S3_BUCKET=$BUCKET, secrets, etc."
echo "  cd docker && ./deploy.sh"
echo "  curl http://localhost:3100/health"
echo "=============================================="
