package pillar.searchindexer

import kotlin.test.*

class SearchIndexerTest {
  @Test fun deterministicProjectorIndexesDocs() { val b=PostgresFtsBackend(); val r=SearchIndexCheckpointRepo(); CheckpointConsumer(b,r).replay(listOf(ProjectionRow("tenant_a","transfer","trint_1", mapOf("id" to "trint_1","amount" to "10"),"42"))); assertEquals("tenant_a:transfer:trint_1", b.all().single().id); assertEquals("42", r.get("tenant_a","transfer")) }
  @Test fun idempotentReplayReplacesDocument() { val b=PostgresFtsBackend(); val c=CheckpointConsumer(b, SearchIndexCheckpointRepo()); val row=ProjectionRow("t","holding","hldg_1", mapOf("id" to "hldg_1","asset" to "asset_1"),"1"); c.replay(listOf(row,row)); assertEquals(1,b.all().size) }
  @Test fun redactionEnforced() { val doc=DocumentTransformer.transform(ProjectionRow("t","transfer","trint_1", mapOf("id" to "trint_1","counterparty" to "secret","amount" to "1"),"1")); assertFalse(doc.fields.containsKey("counterparty")) }
}
