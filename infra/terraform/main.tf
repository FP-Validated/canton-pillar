terraform { required_version = ">= 1.6.0" }
resource "aws_kms_key" "pillar" { description = "Pillar customer-validator key" }
resource "aws_secretsmanager_secret" "pillar" { name = var.secret_name }
