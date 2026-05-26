package pillar.ledgercommand.retry

import java.time.Duration

enum class RetryProfile { SANDBOX, PRODUCTION }

class RetryPolicy(private val profile: RetryProfile) {
    fun delayForAttempt(attempt: Int): Duration = when (profile) {
        RetryProfile.SANDBOX -> Duration.ofMillis(100L * attempt.coerceAtLeast(1))
        RetryProfile.PRODUCTION -> Duration.ofSeconds(1L shl attempt.coerceIn(0, 6))
    }
}
