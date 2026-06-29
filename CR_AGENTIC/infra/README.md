# CR_AGENTIC Infrastructure

Terraform that provisions CR_AGENTIC as a **standalone** stack, fully separate
from the main Course Rep MySQL deployment. It creates a dedicated VPC, RDS
PostgreSQL, ElastiCache Redis, an S3 bucket, four ECS Fargate services behind an
ALB, Secrets Manager entries, and the IAM roles that tie them together.

## Components

| File | Provisions |
|------|------------|
| `network.tf` | VPC, public/app/data subnets, NAT, security groups |
| `data-stores.tf` | RDS PostgreSQL 16, ElastiCache Redis 7, S3 bucket |
| `secrets.tf` | Secrets Manager entries + derived `AGENT_DATABASE_URL` |
| `iam.tf` | ECS execution + task roles (secret read, S3 access) |
| `ecs.tf` | ECR repos, cluster, task defs/services, migrate task |
| `alb.tf` | ALB, target group, HTTP/HTTPS listeners |

## Services

`agent-api` (public via ALB), `browser-worker`, `ai-worker`, and
`discovery-worker` (private). Each runs from its own ECR image and reads
configuration from `common_env` plus Secrets Manager.

## Usage

```bash
cd CR_AGENTIC/infra/terraform
cp terraform.tfvars.example terraform.tfvars   # edit values
terraform init
terraform plan
terraform apply
```

After the first apply, set the real secret values (Terraform only creates
placeholders and then ignores changes to them):

```bash
aws secretsmanager put-secret-value --secret-id cr-agentic/jwt_secret --secret-string "<value>"
# repeat for session_encryption_key, internal_api_secret, openai_api_key, portal_search_api_key
```

> The `JWT_SECRET` and `JWT_ISSUER` must match the main Course Rep API.
> `JWT_ISSUER` is set to `COURSE_REP` in `ecs.tf` to align with the main `.env`.

## Deploys & migrations

CI (`.github/workflows/deploy.yml`) builds and pushes one image per service to
ECR, runs `prisma migrate deploy` as a one-off ECS task (`cr-agentic-migrate`),
and then forces a new deployment on each service. Containers do **not**
auto-migrate on boot — the migration step gates the rollout.

Required GitHub repository secrets:

- `AWS_DEPLOY_ROLE_ARN` — OIDC role assumed by the workflow
- `ECS_APP_SUBNETS` — comma-separated private app subnet IDs
- `ECS_SECURITY_GROUP` — ECS security group ID
