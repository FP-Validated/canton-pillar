package pillar.workfloworchestrator.outbox
data class OutboxClaim(val id:String,val worker:String,val leasedUntil:Long)
