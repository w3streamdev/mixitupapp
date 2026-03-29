resource "google_sql_database_instance" "this" {
  name                = var.instance_name
  database_version    = "POSTGRES_16"
  region              = var.region
  project             = var.project_id
  deletion_protection = var.deletion_protection

  settings {
    tier = var.db_tier
    ip_configuration { ipv4_enabled = true }
    backup_configuration {
      enabled = true
      point_in_time_recovery_enabled = true
    }
  }
}

resource "google_sql_database" "db" {
  name     = var.database_name
  instance = google_sql_database_instance.this.name
  project  = var.project_id
}
