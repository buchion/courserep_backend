#!/usr/bin/env bash
#
# One-time setup so GitHub Actions can deploy CR_AGENTIC via SSM without any
# long-lived AWS keys. Creates:
#   - a GitHub OIDC identity provider (if missing)
#   - an IAM role the cr-agentic branch can assume, scoped to ssm:SendCommand
#     on the one instance + reading command results.
#
# Run in AWS CloudShell. Idempotent.

set -euo pipefail

REGION="${REGION:-us-east-1}"
REPO="${REPO:-buchion/courserep_backend}"
BRANCH="${BRANCH:-cr-agentic}"
ROLE="${ROLE:-cr-agentic-gha-deploy}"
INSTANCE_ID="${INSTANCE_ID:-i-0ec63ce951829039d}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

echo "Account=$ACCOUNT_ID Repo=$REPO Branch=$BRANCH Role=$ROLE Instance=$INSTANCE_ID"

# 1. GitHub OIDC provider (idempotent)
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1; then
  echo "[oidc] provider already exists"
else
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 >/dev/null
  echo "[oidc] created provider"
fi

# 2. Trust policy: only this repo + branch may assume the role
cat > /tmp/cra-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "$OIDC_ARN" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:${REPO}:ref:refs/heads/${BRANCH}"
      }
    }
  }]
}
EOF
if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE" --policy-document file:///tmp/cra-trust.json
  echo "[iam] updated trust policy"
else
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document file:///tmp/cra-trust.json >/dev/null
  echo "[iam] created role"
fi

# 3. Permissions: send command to this instance + read results
cat > /tmp/cra-perm.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ec2:${REGION}:${ACCOUNT_ID}:instance/${INSTANCE_ID}",
        "arn:aws:ssm:${REGION}::document/AWS-RunShellScript"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["ssm:GetCommandInvocation", "ssm:ListCommands", "ssm:ListCommandInvocations"],
      "Resource": "*"
    }
  ]
}
EOF
aws iam put-role-policy --role-name "$ROLE" --policy-name ssm-deploy --policy-document file:///tmp/cra-perm.json
echo "[iam] attached ssm-deploy policy"

echo
echo "==================== DONE ===================="
echo "Role ARN: arn:aws:iam::${ACCOUNT_ID}:role/${ROLE}"
echo "Put this ARN in .github/workflows/deploy-ssm.yml (env.ROLE_ARN)."
echo "=============================================="
