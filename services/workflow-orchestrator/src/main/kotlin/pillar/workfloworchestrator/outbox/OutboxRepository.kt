package pillar.workfloworchestrator.outbox
class OutboxRepository { private val claimed=mutableSetOf<String>(); fun claim(id:String,worker:String):OutboxClaim?= if(claimed.add(id)) OutboxClaim(id,worker,System.currentTimeMillis()+30000) else null; fun complete(id:String)=claimed.remove(id) }
