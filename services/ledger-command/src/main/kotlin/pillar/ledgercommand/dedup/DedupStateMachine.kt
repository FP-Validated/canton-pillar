package pillar.ledgercommand.dedup

import pillar.ledgercommand.ledger.LedgerCommandSubmitter
import pillar.ledgertypes.LedgerCommand

data class Attempt(val operationId: String, val commandId: String, val submissionId: String)

class DedupStateMachine {
    suspend fun submit(
        tenantId: String,
        operationId: String,
        commandSemanticVersion: String,
        command: LedgerCommand,
        submitter: LedgerCommandSubmitter,
    ): Attempt {
        val commandId = CommandIdentity.derive(tenantId, operationId, commandSemanticVersion)
        val submissionId = SubmissionIdentity.newId()
        submitter.submit(commandId, submissionId, command)
        return Attempt(operationId, commandId, submissionId)
    }
}
