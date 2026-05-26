package pillar.ledgercommand.dedup

import java.security.MessageDigest

object CommandIdentity {
    fun derive(tenantId: String, operationId: String, commandSemanticVersion: String): String =
        deriveCommandId(tenantId, operationId, commandSemanticVersion)

    fun deriveCommandId(tenantId: String, operationId: String, semanticVersion: String): String {
        val raw = "$tenantId|$operationId|$semanticVersion".toByteArray(Charsets.UTF_8)
        val digest = MessageDigest.getInstance("SHA-256").digest(raw)
        return "cmd_" + digest.joinToString("") { "%02x".format(it) }.take(24)
    }
}
