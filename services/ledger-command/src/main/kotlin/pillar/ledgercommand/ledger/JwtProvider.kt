package pillar.ledgercommand.ledger

import pillar.ledgercommand.config.ParticipantAuthConfig
import java.time.Clock
import java.time.Instant
import java.util.Base64

class JwtProvider(private val config: ParticipantAuthConfig, private val clock: Clock = Clock.systemUTC()) {
    private val cache = mutableMapOf<String, Token>()

    fun token(tenantId: String, userId: String, actAs: List<String>, readAs: List<String>): String {
        val key = listOf(tenantId, userId, actAs.joinToString(","), readAs.joinToString(",")).joinToString("|")
        val existing = cache[key]
        if (existing != null && existing.expiresAt.minusSeconds(30).isAfter(Instant.now(clock))) return existing.value
        val issuer = config.issuerForTenant(tenantId)
        val expiresAt = Instant.now(clock).plusSeconds(issuer.ttlSeconds)
        val payload = "iss=${issuer.issuer};sub=$userId;actAs=${actAs.joinToString(",")};readAs=${readAs.joinToString(",")};exp=${expiresAt.epochSecond}"
        val token = "mock." + Base64.getUrlEncoder().withoutPadding().encodeToString(payload.toByteArray()) + ".signature"
        cache[key] = Token(token, expiresAt)
        return token
    }

    private data class Token(val value: String, val expiresAt: Instant)
}
