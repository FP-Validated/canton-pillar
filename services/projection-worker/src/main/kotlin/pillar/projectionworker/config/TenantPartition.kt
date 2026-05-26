package pillar.projectionworker.config

class TenantPartition { private val queues = linkedMapOf<String, MutableList<() -> Unit>>() ; fun enqueue(tenantId:String, work:()->Unit){ queues.getOrPut(tenantId){ mutableListOf() }.add(work) } fun drainRoundRobin(){ while(queues.values.any{it.isNotEmpty()}) for(q in queues.values) q.removeFirstOrNull()?.invoke() } }
