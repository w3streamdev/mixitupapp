variable "project_id" { type = string }
variable "region" { type = string }
variable "service_name" { type = string }
variable "image" { type = string }
variable "min_instances" { type = number }
variable "max_instances" { type = number }
variable "container_port" { type = number }
variable "env_vars" { type = map(string) default = {} }
