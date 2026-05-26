package pillar.ledgercommand.queue

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import pillar.ledgercommand.command.CommandBuilder
import pillar.ledgercommand.command.PackageProfileSelector
import pillar.ledgercommand.dedup.CommandIdentity
import pillar.ledgercommand.dedup.SubmissionIdentity
import pillar.ledgercommand.failure.FailureClassifier
import pillar.ledgercommand.ledger.LedgerCommandSubmitter
import java.time.Clock
import java.time.Instant

class CommandRequestPoller(
    private val repository: CommandRequestRepository? = null,
    private val submitter: LedgerCommandSubmitter? = null,
    private val commandBuilder: CommandBuilder? = null,
    private val profileSelector: PackageProfileSelector = PackageProfileSelector(),
    private val pollIntervalMs: Long = 1000,
    private val participantConcurrency: Int = 8,
    private val clock: Clock = Clock.systemUTC(),
    @Suppress("unused") private val failureClassifier: FailureClassifier = FailureClassifier(),
) {
    fun start(scope: CoroutineScope): Job = scope.launch {
        while (isActive) {
            pollOnce()
            delay(pollIntervalMs)
        }
    }

    suspend fun pollOnce(): Int {
        val repo = repository ?: return 0
        val lease = CommandRequestLease.create(clock = clock)
        val claims = repo.claimPending(participantConcurrency, lease, participantConcurrency)
        for (claim in claims) processClaim(repo, claim)
        return claims.size
    }

    private suspend fun processClaim(repo: CommandRequestRepository, claim: ClaimedCommandRequest) {
        val request = claim.request
        val derivedCommandId = CommandIdentity.deriveCommandId(request.tenantId, request.operationId, request.commandSemanticVersion)
        if (!repo.ensureCommandIdentity(request.operationId, derivedCommandId)) {
            repo.failRequest(request.id, request.operationId, "command_identity_mismatch", "stored command_id does not match ADR-0011 derivation")
            return
        }
        val submissionId = SubmissionIdentity.newId()
        repo.insertAttempt(request, derivedCommandId, submissionId)
        repo.markSubmitted(request.id, request.operationId, submissionId)
        try {
            val builder = commandBuilder ?: return
            val profile = profileSelector.select(request.commandType)
            val command = builder.build(request.commandType, request.payloadJson, profile)
            submitter?.submit(derivedCommandId, submissionId, command)
        } catch (t: Throwable) {
            repo.retryRequest(request.id, request.operationId, "submission_failed", t.message ?: t.javaClass.name)
        }
    }

    fun orderForDispatch(requests: List<CommandRequest>, now: Instant = Instant.now(clock)): List<CommandRequest> =
        requests.filter { it.availableAt <= now }
            .sortedWith(compareByDescending<CommandRequest> { it.priority }.thenBy { it.availableAt })
            .groupBy { it.participantId }
            .flatMap { (_, values) -> values.take(participantConcurrency) }
            .sortedWith(compareByDescending<CommandRequest> { it.priority }.thenBy { it.availableAt })
}
