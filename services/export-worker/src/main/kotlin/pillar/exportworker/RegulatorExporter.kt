package pillar.exportworker

data class ExportDecision(val id:String,val traceId:String,val subject:String,val decision:String,val evidenceHashes:List<String>)
class RegulatorExporter {
  private fun mask(value:String)=if(value.length<=4) "****" else "****" + value.takeLast(4)
  fun csv(rows:List<ExportDecision>):String = buildString {
    appendLine("decision_id,trace_id,subject_masked,decision,evidence_hashes")
    rows.forEach { appendLine(listOf(it.id,it.traceId,mask(it.subject),it.decision,it.evidenceHashes.joinToString("|")).joinToString(",")) }
  }
  fun jsonl(rows:List<ExportDecision>):String = rows.joinToString("\n") { "{\"decision_id\":\"${it.id}\",\"trace_id\":\"${it.traceId}\",\"subject_masked\":\"${mask(it.subject)}\",\"decision\":\"${it.decision}\",\"evidence_hashes\":[${it.evidenceHashes.joinToString(",") { h -> "\"$h\"" }}]}" }
}
fun main() { println(RegulatorExporter().csv(emptyList())) }
