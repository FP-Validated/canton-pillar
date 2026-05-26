package pillar.searchindexer

import java.time.Instant

data class SearchIndexerConfig(val databaseUrl:String=System.getenv("DATABASE_URL")?:"", val backend:String=System.getenv("BACKEND")?:"postgres_fts", val openSearchUrl:String?=System.getenv("OPENSEARCH_URL"))
data class ProjectionRow(val tenantId:String,val resource:String,val publicId:String,val fields:Map<String,String>,val watermark:String,val updatedAt:Instant=Instant.EPOCH)
data class IndexedDocument(val id:String,val tenantId:String,val resource:String,val publicId:String,val fields:Map<String,String>,val watermark:String)
data class FieldSpec(val name:String,val redacted:Boolean=false)
object FieldCatalog { val fields = mapOf("transfer" to listOf(FieldSpec("id"),FieldSpec("account"),FieldSpec("counterparty",true),FieldSpec("amount")),"holding" to listOf(FieldSpec("id"),FieldSpec("account"),FieldSpec("asset"),FieldSpec("quantity")),"balance" to listOf(FieldSpec("id"),FieldSpec("account"),FieldSpec("asset")),"event" to listOf(FieldSpec("id"),FieldSpec("type"),FieldSpec("payload",true)),"operation" to listOf(FieldSpec("id"),FieldSpec("status"),FieldSpec("ledger_trace_id"))) }
object DocumentTransformer { fun transform(row:ProjectionRow):IndexedDocument { val allowed=FieldCatalog.fields[row.resource]?: emptyList(); val out=allowed.filterNot{it.redacted}.mapNotNull{ spec -> row.fields[spec.name]?.let{spec.name to it} }.toMap(); return IndexedDocument("${row.tenantId}:${row.resource}:${row.publicId}",row.tenantId,row.resource,row.publicId,out,row.watermark) } }
interface SearchBackend { fun upsert(doc:IndexedDocument); fun all():List<IndexedDocument> }
class PostgresFtsBackend:SearchBackend { private val docs=linkedMapOf<String,IndexedDocument>(); override fun upsert(doc:IndexedDocument){docs[doc.id]=doc}; override fun all()=docs.values.toList() }
class OpenSearchBackend:SearchBackend { private val delegate=PostgresFtsBackend(); override fun upsert(doc:IndexedDocument)=delegate.upsert(doc); override fun all()=delegate.all() }
class SearchIndexCheckpointRepo { private val checkpoints=mutableMapOf<String,String>(); fun save(tenant:String, resource:String, watermark:String){checkpoints["$tenant:$resource"]=watermark}; fun get(tenant:String, resource:String)=checkpoints["$tenant:$resource"] }
class CheckpointConsumer(private val backend:SearchBackend, private val repo:SearchIndexCheckpointRepo) { fun replay(rows:List<ProjectionRow>) { rows.forEach { val doc=DocumentTransformer.transform(it); backend.upsert(doc); repo.save(it.tenantId,it.resource,it.watermark) } } }
fun main() { val config=SearchIndexerConfig(); println("search-indexer backend=${config.backend}") }
