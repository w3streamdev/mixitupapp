resource "google_redis_instance" "this" {
  name           = var.name
  tier           = "STANDARD_HA"
  memory_size_gb = var.memory_size_gb
  region         = var.region
  project        = var.project_id
  redis_version  = "REDIS_7_0"
}
