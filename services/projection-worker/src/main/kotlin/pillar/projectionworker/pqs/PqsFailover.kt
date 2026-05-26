package pillar.projectionworker.pqs

data class PqsEndpoint(val name:String, val schema:PqsSchema, val watermark:Long)
class PqsFailover(private val minWatermark:Long){ fun choose(endpoints:List<PqsEndpoint>, probe:PqsSchemaProbe=PqsSchemaProbe()): PqsEndpoint { return endpoints.firstOrNull { runCatching{probe.probe(it.schema); it.watermark >= minWatermark}.getOrDefault(false) } ?: error("No compatible PQS source") } }
