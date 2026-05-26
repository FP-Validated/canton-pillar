package pillar.ledgercommand.completion

import pillar.ledgercommand.ledger.LedgerCompletion
import java.time.Instant

data class PendingAttempt(val commandId: String, val submissionId: String, val operationId: String)
data class CompletionRecord(val operationId: String, val commandId: String, val submissionId: String, val updateId: String?, val offset: String?, val ledgerTime: Instant?)

class CompletionCorrelator(private val traceWriter: OperationTraceWriter? = null) {
    fun correlate(attempts: List<PendingAttempt>, completion: LedgerCompletion): CompletionRecord? {
        val attempt = attempts.firstOrNull { it.commandId == completion.commandId && it.submissionId == completion.submissionId } ?: return null
        val record = CompletionRecord(attempt.operationId, attempt.commandId, attempt.submissionId, completion.updateId, completion.offset, completion.ledgerTime)
        traceWriter?.write(record)
        return record
    }
}
