package pillar.ledgercommand.queue

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.Clock
import java.time.Duration
import java.time.Instant

class CommandRequestPoller(
    private val repository: CommandRequestRepository? = null,
    private val pollIntervalMs: Long = 1000,
    private val participantConcurrency: Int = 8,
    private val clock: Clock = Clock.systemUTC(),
) {
    fun orderForDispatch(requests: List<CommandRequest>, now: Instant = Instant.now(clock)): List<CommandRequest> =
        requests.sortedWith(compareByDescending<CommandRequest> { agedPriority(it, now) }.thenBy { it.availableAt })
            .groupBy { it.participantId }
            .flatMap { (_, participantRequests) -> participantRequests.take(participantConcurrency) }
            .sortedByDescending { agedPriority(it, now) }

    fun start(scope: CoroutineScope, handler: suspend (ClaimedCommandRequest) -> Unit) = scope.launch {
        requireNotNull(repository) { "repository is required for polling" }
        while (isActive) {
            val claimed = repository.claimPending(participantConcurrency * 4, CommandRequestLease.create(), participantConcurrency)
            orderForDispatch(claimed.map { it.request }).forEach { request ->
                val leased = claimed.first { it.request.id == request.id }
                launch { handler(leased) }
            }
            delay(pollIntervalMs)
        }
    }

    private fun agedPriority(request: CommandRequest, now: Instant): Long =
        request.priority.toLong() * 1_000_000L + Duration.between(request.availableAt, now).toSeconds().coerceAtLeast(0)
}
