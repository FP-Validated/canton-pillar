output "kms_key_arn" { value = aws_kms_key.pillar.arn }
output "secret_arn" { value = aws_secretsmanager_secret.pillar.arn }
