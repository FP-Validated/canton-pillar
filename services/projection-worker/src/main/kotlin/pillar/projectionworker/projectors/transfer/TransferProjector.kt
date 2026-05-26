package pillar.projectionworker.projectors.transfer

data class TransferRow(val id:String,val offset:Long,val cursor:String)
class TransferProjector { fun history(rows:List<TransferRow>)=rows.sortedWith(compareBy<TransferRow>{it.offset}.thenBy{it.id}) }
