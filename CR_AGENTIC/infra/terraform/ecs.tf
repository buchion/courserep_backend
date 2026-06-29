locals {
  services = ["agent-api", "browser-worker", "ai-worker", "discovery-worker"]

  # Secrets injected into every container from Secrets Manager.
  common_secrets = [
    { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.app["JWT_SECRET"].arn },
    { name = "SESSION_ENCRYPTION_KEY", valueFrom = aws_secretsmanager_secret.app["SESSION_ENCRYPTION_KEY"].arn },
    { name = "INTERNAL_API_SECRET", valueFrom = aws_secretsmanager_secret.app["INTERNAL_API_SECRET"].arn },
    { name = "OPENAI_API_KEY", valueFrom = aws_secretsmanager_secret.app["OPENAI_API_KEY"].arn },
    { name = "PORTAL_SEARCH_API_KEY", valueFrom = aws_secretsmanager_secret.app["PORTAL_SEARCH_API_KEY"].arn },
    { name = "AGENT_DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
  ]

  common_env = [
    { name = "AWS_REGION", value = var.aws_region },
    { name = "AWS_S3_BUCKET", value = aws_s3_bucket.documents.bucket },
    { name = "REDIS_HOST", value = aws_elasticache_replication_group.this.primary_endpoint_address },
    { name = "REDIS_PORT", value = "6379" },
    { name = "COURSE_REP_API_URL", value = var.course_rep_api_url },
    { name = "JWT_ISSUER", value = "COURSE_REP" },
    { name = "JWT_AUDIENCE", value = "course-rep-users" },
    { name = "AGENT_API_PORT", value = "3100" },
    { name = "BROWSER_HEADLESS", value = "true" },
  ]
}

resource "aws_ecr_repository" "services" {
  for_each             = toset(local.services)
  name                 = "${var.name_prefix}/${each.value}"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  tags = { Name = "${var.name_prefix}-${each.value}" }
}

resource "aws_ecs_cluster" "this" {
  name = "${var.name_prefix}-cluster"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "services" {
  for_each          = toset(local.services)
  name              = "/ecs/${var.name_prefix}/${each.value}"
  retention_in_days = 30
}

locals {
  service_sizing = {
    "agent-api"        = { cpu = var.agent_api_cpu, memory = var.agent_api_memory, command = ["node", "dist/main.js"], desired = var.agent_api_desired_count }
    "browser-worker"   = { cpu = var.browser_worker_cpu, memory = var.browser_worker_memory, command = ["node", "dist/worker.js"], desired = var.worker_desired_count }
    "ai-worker"        = { cpu = var.ai_worker_cpu, memory = var.ai_worker_memory, command = ["node", "dist/worker.js"], desired = var.worker_desired_count }
    "discovery-worker" = { cpu = var.discovery_worker_cpu, memory = var.discovery_worker_memory, command = ["node", "dist/worker.js"], desired = var.worker_desired_count }
  }
}

resource "aws_ecs_task_definition" "services" {
  for_each                 = local.service_sizing
  family                   = "${var.name_prefix}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name         = each.key
      image        = "${aws_ecr_repository.services[each.key].repository_url}:${var.image_tag}"
      essential    = true
      command      = each.value.command
      environment  = local.common_env
      secrets      = local.common_secrets
      portMappings = each.key == "agent-api" ? [{ containerPort = 3100, protocol = "tcp" }] : []
      # browser-worker needs a larger /dev/shm for Chromium.
      linuxParameters = each.key == "browser-worker" ? { sharedMemorySize = 1024 } : null
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services[each.key].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = each.key
        }
      }
    }
  ])
}

resource "aws_ecs_service" "agent_api" {
  name            = "agent-api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.services["agent-api"].arn
  desired_count   = local.service_sizing["agent-api"].desired
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.app[*].id
    security_groups = [aws_security_group.ecs.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.agent_api.arn
    container_name   = "agent-api"
    container_port   = 3100
  }

  depends_on = [aws_lb_listener.http]
}

# One-off task definition used by CI to run `prisma migrate deploy` before
# rolling out new service revisions. Invoked via `aws ecs run-task`.
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${var.name_prefix}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name        = "migrate"
      image       = "${aws_ecr_repository.services["agent-api"].repository_url}:${var.image_tag}"
      essential   = true
      command     = ["yarn", "workspace", "@cr-agentic/database", "prisma:migrate:deploy"]
      environment = local.common_env
      secrets     = local.common_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["agent-api"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "migrate"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "workers" {
  for_each        = toset(["browser-worker", "ai-worker", "discovery-worker"])
  name            = each.value
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.services[each.value].arn
  desired_count   = local.service_sizing[each.value].desired
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.app[*].id
    security_groups = [aws_security_group.ecs.id]
  }
}
