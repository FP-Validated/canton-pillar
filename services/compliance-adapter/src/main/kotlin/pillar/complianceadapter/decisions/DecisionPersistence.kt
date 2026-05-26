package pillar.complianceadapter.decisions
data class ComplianceDecision(val id:String,val decision:String,val traceId:String,val ledgerWorkflowEnqueued:Boolean)
class DecisionPersistence { private val rows=mutableListOf<ComplianceDecision>(); fun persist(id:String, decision:String):ComplianceDecision { val row=ComplianceDecision(id,decision,"trace_$id",decision=="approved"); rows += row; return row }; fun all()=rows.toList() }
