package pillar.ledgercommand.queue

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID

data class CommandRequestLease(val token: String, val expiresAt: Instant) {
    companion object {
        fun create(ttl: Duration = Duration.ofSeconds(30), clock: Clock = Clock.systemUTC()): CommandRequestLease =
            CommandRequestLease(UUID.randomUUID().toString(), Instant.now(clock).plus(ttl))
    }
}
