package pillar.ledgercommand.workflows.complete_issue_after_compliance

data class ComplianceWorkflowCommand(val decisionId:String, val workflowId:String, val commandId:String)
class CompleteIssueAfterComplianceWorkflow {
  fun enqueue(decisionId:String, approved:Boolean): ComplianceWorkflowCommand? = if (approved) ComplianceWorkflowCommand(decisionId, "complete_issue_after_compliance_$decisionId", "cmd_compliance_$decisionId") else null
}
