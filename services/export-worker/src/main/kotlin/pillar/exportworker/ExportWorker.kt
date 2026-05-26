package pillar.exportworker

import java.security.MessageDigest
import java.time.Duration
import java.time.Instant

data class ExportJob(var id:String,val tenantId:String,val resource:String,val rows:List<Map<String,String>>,var status:String="queued",var leaseOwner:String?=null,var leaseUntil:Instant?=null)
class JobClaimer { fun claim(jobs:List<ExportJob>, owner:String, now:Instant):ExportJob? = jobs.firstOrNull{it.status=="queued" || (it.leaseUntil?.isBefore(now)==true)}?.also{it.status="claimed";it.leaseOwner=owner;it.leaseUntil=now.plusSeconds(30)}; fun heartbeat(job:ExportJob, now:Instant){ job.leaseUntil=now.plusSeconds(30) } }
class ProjectionPaginator { fun pages(rows:List<Map<String,String>>, size:Int=100)=rows.chunked(size) }
class CsvWriter { fun write(rows:List<Map<String,String>>, columns:List<String>):ByteArray = buildString { appendLine(columns.joinToString(",")); rows.forEach{ r -> appendLine(columns.joinToString(","){ r[it].orEmpty() }) } }.toByteArray() }
class JsonlWriter { fun write(rows:List<Map<String,String>>):ByteArray = rows.joinToString("\n") { r -> r.entries.joinToString(",","{","}") { "\"${it.key}\":\"${it.value}\"" } }.toByteArray() }
class ParquetWriter { fun write(rows:List<Map<String,String>>):ByteArray = JsonlWriter().write(rows) }
data class Manifest(val queryHash:String,val schemaVersion:String,val rowCount:Int,val byteCount:Int,val sha256:String,val projectionCheckpoint:String)
class ManifestBuilder { fun build(queryHash:String, bytes:ByteArray, rows:Int, checkpoint:String)=Manifest(queryHash,"2026-05-26",rows,bytes.size,sha256(bytes),checkpoint); fun sha256(bytes:ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)} }
class ObjectStorageAdapter { private val blobs=mutableMapOf<String,ByteArray>(); var outage=false; fun put(key:String, bytes:ByteArray){ if(outage) error("blob_outage"); blobs[key]=bytes }; fun get(key:String)=blobs[key] ?: error("not_found") }
class ExportAudit { val rows= mutableListOf<String>(); fun record(job:ExportJob, action:String){ rows += "${job.tenantId}:${job.id}:$action" } }
class RegulatorProfile { val allowedColumns=setOf("ledger_trace_id","operation_id","decision","created"); fun validate(scope:String, consistencyMode:String, columns:List<String>) { require(scope=="exports:regulator"); require(consistencyMode=="ledger_snapshot"); require(columns.all{it in allowedColumns}) } }
class SignedUrlService { fun create(job:ExportJob, ttl:Duration=Duration.ofMinutes(15), contentHash:String, now:Instant=Instant.EPOCH):String { require(!ttl.isNegative && !ttl.isZero); require(ttl<=Duration.ofHours(1)); return "https://storage.pillar.local/${job.tenantId}/${job.id}?expires=${now.plus(ttl).epochSecond}&hash=$contentHash" } }
