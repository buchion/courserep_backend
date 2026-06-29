# Application secrets are stored individually so ECS task definitions can
# reference each value via `secrets` (injected as env vars at container start).
# Populate the placeholder values out-of-band (console, CLI, or CI) — Terraform
# only creates the containers, not the sensitive payloads.

locals {
  app_secrets = {
    JWT_SECRET             = "replace-me"
    SESSION_ENCRYPTION_KEY = "replace-me-32-byte-hex"
    INTERNAL_API_SECRET    = "replace-me"
    OPENAI_API_KEY         = "replace-me"
    PORTAL_SEARCH_API_KEY  = "replace-me"
  }
}

resource "aws_secretsmanager_secret" "app" {
  for_each = local.app_secrets
  name     = "${var.name_prefix}/${lower(each.key)}"
  tags     = { Name = "${var.name_prefix}-${lower(each.key)}" }
}

resource "aws_secretsmanager_secret_version" "app" {
  for_each      = local.app_secrets
  secret_id     = aws_secretsmanager_secret.app[each.key].id
  secret_string = each.value

  lifecycle {
    # Real values are managed outside Terraform; do not overwrite on apply.
    ignore_changes = [secret_string]
  }
}

# Database URL is derived from the RDS instance and stored as a managed secret.
resource "aws_secretsmanager_secret" "database_url" {
  name = "${var.name_prefix}/agent_database_url"
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.this.endpoint}/${var.db_name}?schema=public"
}
