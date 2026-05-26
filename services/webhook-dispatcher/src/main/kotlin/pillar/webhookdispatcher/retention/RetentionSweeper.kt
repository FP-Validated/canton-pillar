package pillar.webhookdispatcher.retention
class RetentionSweeper { fun redact(payload:String)=payload.sha256(); private fun String.sha256()=java.security.MessageDigest.getInstance("SHA-256").digest(toByteArray()).joinToString("") { "%02x".format(it) } }
