terraform {
  required_version = ">= 1.7.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "artifact_registry" {
  source     = "../../modules/artifact_registry"
  project_id = var.project_id
  region     = var.region
  repo_name  = "mixitup-services"
}

module "cloud_sql" {
  source              = "../../modules/cloud_sql_postgres"
  project_id          = var.project_id
  region              = var.region
  instance_name       = "mixitup-pg-dev"
  database_name       = "mixitup"
  db_tier             = "db-custom-2-7680"
  deletion_protection = false
}

module "redis" {
  source         = "../../modules/memorystore_redis"
  project_id     = var.project_id
  region         = var.region
  name           = "mixitup-redis-dev"
  memory_size_gb = 1
}
