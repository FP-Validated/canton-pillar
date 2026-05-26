package pillar.projectionworker.projectors

data class BalanceKey(val tenantId:String,val accountId:String,val assetId:String)
data class BalanceRow(var available:Long=0,var pending:Long=0,var reserved:Long=0,var settled:Long=0,var offset:Long=0)
class BalanceProjector { val rows=mutableMapOf<BalanceKey,BalanceRow>(); private val seen=mutableSetOf<String>(); fun apply(updateId:String,key:BalanceKey, available:Long=0,pending:Long=0,reserved:Long=0,settled:Long=0,offset:Long=0){ if(!seen.add(updateId)) return; val r=rows.getOrPut(key){BalanceRow()}; r.available+=available; r.pending+=pending; r.reserved+=reserved; r.settled+=settled; r.offset=maxOf(r.offset,offset) } }
data class HoldingRow(val id:String,val accountId:String,val assetId:String,val quantity:Long,val status:String="active",val metadata:Map<String,String> = emptyMap())
class HoldingProjector { fun fragment(source:HoldingRow, parts:List<Long>)=parts.mapIndexed{ i,q -> HoldingRow("${source.id}-$i",source.accountId,source.assetId,q,source.status,source.metadata) } }
data class EventRow(val id:String,val type:String,val dataObject:Map<String,String>)
class EventProjector { private val rows=linkedMapOf<String,EventRow>(); fun append(e:EventRow){ require(!rows.containsKey(e.id)); require(e.id.startsWith("evt_")); rows[e.id]=e.copy(dataObject=e.dataObject.toMap()) } fun get(id:String)=rows[id] }
