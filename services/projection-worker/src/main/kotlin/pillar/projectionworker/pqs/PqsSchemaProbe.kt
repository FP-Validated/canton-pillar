package pillar.projectionworker.pqs

data class PqsSchema(val version:Int, val queryHash:String)
class PqsSchemaProbe(private val supported:Set<Int> = setOf(1)){ fun probe(schema:PqsSchema): PqsSchema { require(schema.version in supported){"Unsupported PQS schema ${schema.version}"}; require(schema.queryHash.isNotBlank()); return schema } }
