package pillar.projectionworker.pqs

data class PqsRow(val tenantId:String, val party:String, val offset:Long, val payload:Map<String,String>)
interface PqsClient { fun query(tenantId:String, party:String, afterOffset:Long, limit:Int): List<PqsRow> }
class InMemoryPqsClient(private val rows:List<PqsRow>): PqsClient { override fun query(tenantId:String, party:String, afterOffset:Long, limit:Int)= rows.filter{it.tenantId==tenantId && it.party==party && it.offset>afterOffset}.sortedBy{it.offset}.take(limit) }
