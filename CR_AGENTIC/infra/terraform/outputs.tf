output "alb_dns_name" {
  value       = aws_lb.this.dns_name
  description = "Public DNS name of the agent-api load balancer."
}

output "ecr_repository_urls" {
  value       = { for k, repo in aws_ecr_repository.services : k => repo.repository_url }
  description = "ECR repository URLs per service for CI image pushes."
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "rds_endpoint" {
  value     = aws_db_instance.this.endpoint
  sensitive = true
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "documents_bucket" {
  value = aws_s3_bucket.documents.bucket
}
