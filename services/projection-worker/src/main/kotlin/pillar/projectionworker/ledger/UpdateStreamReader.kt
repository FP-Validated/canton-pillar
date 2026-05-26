package pillar.projectionworker.ledger

data class LedgerUpdate(val offset:Long, val recordTimeMillis:Long, val effects:List<ProjectionEffect>)
sealed class ProjectionEffect { data class Balance(val tenantId:String,val accountId:String,val assetId:String,val availableDelta:Long=0,val pendingDelta:Long=0,val reservedDelta:Long=0,val settledDelta:Long=0): ProjectionEffect(); data class Operation(val tenantId:String,val operationId:String,val commandId:String,val updateId:String,val offset:Long,val status:String): ProjectionEffect() }
class UpdateStreamReader(private val updates:List<LedgerUpdate>){ fun resume(afterOffset:Long)=updates.filter{it.offset>afterOffset}.sortedBy{it.offset} }
