package pillar.ledgercommand.dedup

import java.security.MessageDigest

object CommandIdentity {
    fun derive(tenantId: String, operationId: String, commandSemanticVersion: String): String {
        val canonical = "$tenantId|$operationId|$commandSemanticVersion"
        val hex = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        return "cmd_" + hex.take(24)
    }
}
