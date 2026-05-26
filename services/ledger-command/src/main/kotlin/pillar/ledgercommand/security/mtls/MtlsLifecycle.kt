package pillar.ledgercommand.security.mtls

import java.time.Instant

data class CertificateState(val subject:String, val expiresAt:Instant)
class MtlsLifecycle { fun needsRotation(cert: CertificateState, now: Instant = Instant.now(), windowSeconds: Long = 604800): Boolean = cert.expiresAt.minusSeconds(windowSeconds).isBefore(now); fun provision(subject:String, ttlSeconds:Long)=CertificateState(subject, Instant.now().plusSeconds(ttlSeconds)) }
