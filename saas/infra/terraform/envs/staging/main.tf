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
  instance_name       = "mixitup-pg-staging"
  database_name       = "mixitup"
  db_tier             = "db-custom-2-7680"
  deletion_protection = true
}

module "redis" {
  source         = "../../modules/memorystore_redis"
  project_id     = var.project_id
  region         = var.region
  name           = "mixitup-redis-staging"
  memory_size_gb = 2
}

module "pubsub" {
  source     = "../../modules/pubsub"
  project_id = var.project_id
  topics     = ["command-runs", "webhook-deliveries", "audit-events"]
}

module "secrets" {
  source     = "../../modules/secret_manager"
  project_id = var.project_id
  secrets = [
    "database-url",
    "redis-url",
    "oidc-issuer",
    "oidc-audience",
    "oidc-jwks-uri",
    "twitch-client-id",
    "twitch-client-secret",
    "youtube-client-id",
    "youtube-client-secret",
    "trovo-client-id",
    "trovo-client-secret",
  ]
}

module "api_service" {
  source         = "../../modules/cloud_run_service"
  project_id     = var.project_id
  region         = var.region
  service_name   = "mixitup-api-staging"
  image          = "${var.region}-docker.pkg.dev/${var.project_id}/mixitup-services/api:staging"
  min_instances  = 1
  max_instances  = 8
  container_port = 8080
  env_vars = {
    NODE_ENV              = "staging"
    LOG_LEVEL             = "info"
    APP_REGION            = var.region
    GOOGLE_CLOUD_PROJECT  = var.project_id
    GOOGLE_CLOUD_LOCATION = var.region
  }
  depends_on = [module.artifact_registry]
}

module "worker_service" {
  source         = "../../modules/cloud_run_service"
  project_id     = var.project_id
  region         = var.region
  service_name   = "mixitup-worker-staging"
  image          = "${var.region}-docker.pkg.dev/${var.project_id}/mixitup-services/worker:staging"
  min_instances  = 1
  max_instances  = 4
  container_port = 8080
  env_vars = {
    NODE_ENV              = "staging"
    LOG_LEVEL             = "info"
    GOOGLE_CLOUD_PROJECT  = var.project_id
    GOOGLE_CLOUD_LOCATION = var.region
  }
  depends_on = [module.artifact_registry]
}
