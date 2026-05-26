package pillar.projectionworker.projectors.operation

data class OperationProjection(val operationId:String,val commandId:String,val updateId:String,val ledgerOffset:Long,val status:String)
class OperationProjector { val rows=mutableMapOf<String,OperationProjection>(); fun apply(row:OperationProjection){ rows[row.operationId]=row } }
