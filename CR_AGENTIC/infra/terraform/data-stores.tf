# --- RDS PostgreSQL ---
resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db-subnets"
  subnet_ids = aws_subnet.data[*].id
  tags       = { Name = "${var.name_prefix}-db-subnets" }
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_instance" "this" {
  identifier                  = "${var.name_prefix}-postgres"
  engine                      = "postgres"
  engine_version              = "16"
  instance_class              = var.db_instance_class
  allocated_storage           = var.db_allocated_storage
  max_allocated_storage       = var.db_allocated_storage * 5
  storage_type                = "gp3"
  storage_encrypted           = true
  db_name                     = var.db_name
  username                    = var.db_username
  password                    = random_password.db.result
  db_subnet_group_name        = aws_db_subnet_group.this.name
  vpc_security_group_ids      = [aws_security_group.rds.id]
  multi_az                    = var.environment == "production"
  backup_retention_period     = 7
  deletion_protection         = var.environment == "production"
  skip_final_snapshot         = var.environment != "production"
  final_snapshot_identifier   = var.environment == "production" ? "${var.name_prefix}-final" : null
  performance_insights_enabled = true

  tags = { Name = "${var.name_prefix}-postgres" }
}

# --- ElastiCache Redis ---
resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.name_prefix}-redis-subnets"
  subnet_ids = aws_subnet.data[*].id
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = "${var.name_prefix}-redis"
  description                = "CR_AGENTIC BullMQ queue + locks"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  num_cache_clusters         = var.environment == "production" ? 2 : 1
  automatic_failover_enabled = var.environment == "production"
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false

  tags = { Name = "${var.name_prefix}-redis" }
}

# --- S3 (documents, sessions, screenshots, scrape exports) ---
resource "aws_s3_bucket" "documents" {
  bucket = "${var.name_prefix}-documents-${data.aws_caller_identity.current.account_id}"
  tags   = { Name = "${var.name_prefix}-documents" }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "expire-screenshots"
    status = "Enabled"
    filter {
      prefix = "screenshots/"
    }
    expiration {
      days = 30
    }
  }
}

data "aws_caller_identity" "current" {}
