package pillar.ledgercommand.ledger

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import java.time.Instant

data class LedgerCompletion(
    val commandId: String,
    val submissionId: String,
    val status: String,
    val updateId: String?,
    val offset: String?,
    val ledgerTime: Instant?,
)

interface CompletionClient {
    fun completionsFrom(offset: String?): Flow<LedgerCompletion>
}

class EmptyCompletionClient : CompletionClient {
    override fun completionsFrom(offset: String?): Flow<LedgerCompletion> = emptyFlow()
}
