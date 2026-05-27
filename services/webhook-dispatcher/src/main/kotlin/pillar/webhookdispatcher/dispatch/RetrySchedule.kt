package pillar.webhookdispatcher.dispatch

import java.time.Duration

object RetrySchedule {
    val delays: List<Duration> = listOf(
        Duration.ofSeconds(1),
        Duration.ofSeconds(2),
        Duration.ofSeconds(5),
        Duration.ofSeconds(15),
        Duration.ofMinutes(1),
        Duration.ofMinutes(5),
        Duration.ofMinutes(15),
        Duration.ofHours(1),
        Duration.ofHours(3),
        Duration.ofHours(6),
    )
    const val maxAttempts: Int = 10
    fun delay(attempt: Int): Duration = delays[(attempt - 1).coerceIn(0, delays.lastIndex)]
}
