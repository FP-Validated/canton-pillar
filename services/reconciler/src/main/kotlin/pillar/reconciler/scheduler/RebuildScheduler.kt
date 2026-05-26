package pillar.reconciler.scheduler
class RebuildScheduler(private val cadenceSeconds:Map<String,Long>){ fun due(projectorName:String, elapsedSeconds:Long)= elapsedSeconds >= (cadenceSeconds[projectorName] ?: Long.MAX_VALUE); fun scope(projectorName:String)=mapOf("projector_name" to projectorName) }
