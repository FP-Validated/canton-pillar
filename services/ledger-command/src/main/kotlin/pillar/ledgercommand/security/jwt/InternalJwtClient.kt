package pillar.ledgercommand.security.jwt

import java.util.Base64

class InternalJwtClient(private val issuer:String = "pillar-ledger-command") {
  fun mintParticipantToken(subject:String, audience:String, ttlSeconds:Long = 300): String {
    val payload = "{\"iss\":\"$issuer\",\"sub\":\"$subject\",\"aud\":\"$audience\",\"ttl\":$ttlSeconds}"
    return Base64.getUrlEncoder().withoutPadding().encodeToString(payload.toByteArray())
  }
}
