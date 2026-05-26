package pillar.ledgercommand.ledger

import java.time.Clock
import java.time.Duration
import java.time.Instant

class CircuitBreaker(private val threshold: Int = 3, private val resetAfter: Duration = Duration.ofSeconds(30), private val clock: Clock = Clock.systemUTC()) {
    private var failures = 0
    private var openedAt: Instant? = null
    fun allowRequest(): Boolean = openedAt?.let { Duration.between(it, Instant.now(clock)) >= resetAfter } ?: true
    fun recordSuccess() { failures = 0; openedAt = null }
    fun recordFailure() { failures += 1; if (failures >= threshold) openedAt = Instant.now(clock) }
}
