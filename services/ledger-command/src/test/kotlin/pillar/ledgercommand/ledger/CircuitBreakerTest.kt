package pillar.ledgercommand.ledger

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class CircuitBreakerTest {
    @Test fun `opens after threshold and closes on success`() {
        val breaker = CircuitBreaker(threshold = 2)
        assertTrue(breaker.allowRequest())
        breaker.recordFailure(); breaker.recordFailure()
        assertFalse(breaker.allowRequest())
        breaker.recordSuccess()
        assertTrue(breaker.allowRequest())
    }
}
