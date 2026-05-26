package pillar.ledgercommand.harness

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import pillar.ledgercommand.ledger.CompletionClient
import pillar.ledgercommand.ledger.LedgerCommandSubmitter
import pillar.ledgercommand.ledger.LedgerCompletion
import pillar.ledgercommand.ledger.SubmissionAck
import pillar.ledgertypes.LedgerCommand
import java.time.Instant

data class RecordedSubmit(val commandId: String, val submissionId: String, val command: LedgerCommand)

class InProcessLedgerHarness : LedgerCommandSubmitter, CompletionClient, AutoCloseable {
    val submissions = mutableListOf<RecordedSubmit>()
    private val completions = Channel<LedgerCompletion>(Channel.UNLIMITED)

    override suspend fun submit(commandId: String, submissionId: String, command: LedgerCommand): SubmissionAck {
        submissions += RecordedSubmit(commandId, submissionId, command)
        return SubmissionAck(commandId, submissionId, true)
    }

    fun completeUpdate(commandId: String, submissionId: String, updateId: String, offset: String) {
        completions.trySend(LedgerCompletion(commandId, submissionId, "OK", updateId, offset, Instant.now()))
    }

    override fun completionsFrom(offset: String?): Flow<LedgerCompletion> = completions.receiveAsFlow()
    override fun close() { completions.close() }
}
