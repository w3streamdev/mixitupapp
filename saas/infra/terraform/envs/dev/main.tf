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

# ─── Artifact Registry ───────────────────────────────────────────────────────

module "artifact_registry" {
  source     = "../../modules/artifact_registry"
  project_id = var.project_id
  region     = var.region
  repo_name  = "mixitup-services"
}

# ─── Cloud SQL (PostgreSQL 16) ───────────────────────────────────────────────

module "cloud_sql" {
  source              = "../../modules/cloud_sql_postgres"
  project_id          = var.project_id
  region              = var.region
  instance_name       = "mixitup-pg-dev"
  database_name       = "mixitup"
  db_tier             = "db-custom-2-7680"
  deletion_protection = false
}

# ─── Memorystore Redis ───────────────────────────────────────────────────────

module "redis" {
  source         = "../../modules/memorystore_redis"
  project_id     = var.project_id
  region         = var.region
  name           = "mixitup-redis-dev"
  memory_size_gb = 1
}

# ─── Pub/Sub Topics ──────────────────────────────────────────────────────────

module "pubsub" {
  source     = "../../modules/pubsub"
  project_id = var.project_id
  topics = [
    "command-runs",
    "webhook-deliveries",
    "audit-events",
  ]
}

# ─── Secret Manager ──────────────────────────────────────────────────────────

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

# ─── Cloud Run: API ──────────────────────────────────────────────────────────

module "api_service" {
  source        = "../../modules/cloud_run_service"
  project_id    = var.project_id
  region        = var.region
  service_name  = "mixitup-api-dev"
  image         = "${var.region}-docker.pkg.dev/${var.project_id}/mixitup-services/api:latest"
  min_instances = 0
  max_instances = 4
  container_port = 8080
  env_vars = {
    NODE_ENV               = "development"
    LOG_LEVEL              = "debug"
    APP_REGION             = var.region
    GOOGLE_CLOUD_PROJECT   = var.project_id
    GOOGLE_CLOUD_LOCATION  = var.region
  }

  depends_on = [module.artifact_registry]
}

# ─── Cloud Run: Worker ───────────────────────────────────────────────────────

module "worker_service" {
  source        = "../../modules/cloud_run_service"
  project_id    = var.project_id
  region        = var.region
  service_name  = "mixitup-worker-dev"
  image         = "${var.region}-docker.pkg.dev/${var.project_id}/mixitup-services/worker:latest"
  min_instances = 0
  max_instances = 2
  container_port = 8080
  env_vars = {
    NODE_ENV               = "development"
    LOG_LEVEL              = "debug"
    GOOGLE_CLOUD_PROJECT   = var.project_id
    GOOGLE_CLOUD_LOCATION  = var.region
  }

  depends_on = [module.artifact_registry]
}

# ─── IAM: Service Account for API ────────────────────────────────────────────

resource "google_service_account" "api_sa" {
  account_id   = "mixitup-api-dev"
  display_name = "MixItUp API (dev)"
  project      = var.project_id
}

resource "google_project_iam_member" "api_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api_sa.email}"
}

resource "google_project_iam_member" "api_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.api_sa.email}"
}

resource "google_project_iam_member" "api_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.api_sa.email}"
}

resource "google_project_iam_member" "api_tasks" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.api_sa.email}"
}

resource "google_project_iam_member" "api_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.api_sa.email}"
}

resource "google_project_iam_member" "api_trace" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.api_sa.email}"
}

resource "google_project_iam_member" "api_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.api_sa.email}"
}

# ─── IAM: Service Account for Worker ─────────────────────────────────────────

resource "google_service_account" "worker_sa" {
  account_id   = "mixitup-worker-dev"
  display_name = "MixItUp Worker (dev)"
  project      = var.project_id
}

resource "google_project_iam_member" "worker_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.worker_sa.email}"
}

resource "google_project_iam_member" "worker_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${google_service_account.worker_sa.email}"
}

resource "google_project_iam_member" "worker_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.worker_sa.email}"
}

resource "google_project_iam_member" "worker_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.worker_sa.email}"
}

resource "google_project_iam_member" "worker_trace" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.worker_sa.email}"
}

resource "google_project_iam_member" "worker_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.worker_sa.email}"
}

# ─── Cloud Tasks Queues ──────────────────────────────────────────────────────

resource "google_cloud_tasks_queue" "command_runs" {
  name     = "command-runs"
  location = var.region
  project  = var.project_id

  rate_limits {
    max_dispatches_per_second = 50
    max_concurrent_dispatches = 10
  }

  retry_config {
    max_attempts       = 5
    max_retry_duration = "3600s"
    min_backoff        = "1s"
    max_backoff        = "60s"
    max_doublings      = 4
  }
}

resource "google_cloud_tasks_queue" "webhook_deliveries" {
  name     = "webhook-deliveries"
  location = var.region
  project  = var.project_id

  rate_limits {
    max_dispatches_per_second = 100
    max_concurrent_dispatches = 20
  }

  retry_config {
    max_attempts       = 3
    max_retry_duration = "1800s"
    min_backoff        = "2s"
    max_backoff        = "120s"
    max_doublings      = 3
  }
}

# ─── Pub/Sub Subscriptions ───────────────────────────────────────────────────

resource "google_pubsub_subscription" "command_runs_sub" {
  name    = "command-runs-sub"
  topic   = "command-runs"
  project = var.project_id

  ack_deadline_seconds = 30

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  depends_on = [module.pubsub]
}

resource "google_pubsub_subscription" "webhook_deliveries_sub" {
  name    = "webhook-deliveries-sub"
  topic   = "webhook-deliveries"
  project = var.project_id

  ack_deadline_seconds = 30

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  depends_on = [module.pubsub]
}

resource "google_pubsub_subscription" "audit_events_sub" {
  name    = "audit-events-sub"
  topic   = "audit-events"
  project = var.project_id

  ack_deadline_seconds = 20

  retry_policy {
    minimum_backoff = "5s"
    maximum_backoff = "300s"
  }

  depends_on = [module.pubsub]
}

# ─── Outputs ─────────────────────────────────────────────────────────────────

output "api_service_url" {
  value = module.api_service
}

output "worker_service_url" {
  value = module.worker_service
}

output "cloud_sql_instance" {
  value = module.cloud_sql
}

output "redis_host" {
  value = module.redis
}
