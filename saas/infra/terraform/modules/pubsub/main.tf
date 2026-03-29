resource "google_pubsub_topic" "topics" {
  for_each = toset(var.topics)
  project  = var.project_id
  name     = each.value
}
