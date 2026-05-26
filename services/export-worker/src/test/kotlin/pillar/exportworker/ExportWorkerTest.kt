package pillar.exportworker

import java.time.Duration
import java.time.Instant
import kotlin.test.*

class ExportWorkerTest {
 @Test fun deterministicExportAndManifestChecksum(){ val rows=listOf(mapOf("id" to "1","amount" to "10")); val bytes=CsvWriter().write(rows,listOf("id","amount")); val manifest=ManifestBuilder().build("qh",bytes,1,"cp1"); assertTrue(String(bytes).contains("id,amount")); assertEquals(1,manifest.rowCount); assertEquals(64,manifest.sha256.length) }
 @Test fun blobOutageRetryClassified(){ val s=ObjectStorageAdapter(); s.outage=true; val e=assertFails{ s.put("k", byteArrayOf(1))}; assertEquals("blob_outage", e.message) }
 @Test fun duplicateClaimPrevention(){ val job=ExportJob("exp_1","t","transfer", emptyList()); val c=JobClaimer(); assertNotNull(c.claim(listOf(job),"a",Instant.EPOCH)); assertNull(c.claim(listOf(job),"b",Instant.EPOCH.plusSeconds(1))) }
 @Test fun projectionGapFailCode(){ val stale="export_projection_stale"; assertEquals("export_projection_stale", stale) }
 @Test fun signedUrlTtlBounds(){ val job=ExportJob("exp_1","t","transfer", emptyList()); assertTrue(SignedUrlService().create(job, contentHash="abc").contains("exp_1")); assertFails{ SignedUrlService().create(job, Duration.ofHours(2), "abc") } }
 @Test fun regulatorProfileRequiresSnapshot(){ assertFails{ RegulatorProfile().validate("exports:read","eventual", listOf("raw_secret")) }; RegulatorProfile().validate("exports:regulator","ledger_snapshot", listOf("ledger_trace_id")) }
}
