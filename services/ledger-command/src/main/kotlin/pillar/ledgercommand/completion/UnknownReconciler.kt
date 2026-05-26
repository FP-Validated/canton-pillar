package pillar.ledgercommand.completion

data class UnknownOutcome(val operationId: String, val commandId: String, val submissionId: String)

data class ReconciledOutcome(val operationId: String, val commandId: String, val resolved: Boolean)

class UnknownReconciler {
    fun reconcile(unknown: UnknownOutcome, completions: List<CompletionRecord>): ReconciledOutcome {
        val matched = completions.any { it.commandId == unknown.commandId }
        return ReconciledOutcome(unknown.operationId, unknown.commandId, matched)
    }
}
