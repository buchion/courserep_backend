terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Configure remote state in your own bucket before first apply.
  # backend "s3" {
  #   bucket         = "cr-agentic-tfstate"
  #   key            = "cr-agentic/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "cr-agentic-tflock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "cr-agentic"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
