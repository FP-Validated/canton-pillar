package pillar.ledgercommand.ledger

import pillar.ledgertypes.LedgerCommand

interface LedgerCommandSubmitter {
    suspend fun submit(commandId: String, submissionId: String, command: LedgerCommand): SubmissionAck
}

data class SubmissionAck(val commandId: String, val submissionId: String, val accepted: Boolean)

class FakeLedgerCommandSubmitter : LedgerCommandSubmitter {
    override suspend fun submit(commandId: String, submissionId: String, command: LedgerCommand): SubmissionAck = SubmissionAck(commandId, submissionId, true)
}
