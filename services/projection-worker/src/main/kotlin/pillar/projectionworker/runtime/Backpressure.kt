package pillar.projectionworker.runtime

data class ProjectionPending(val status:String="projection_pending", val projectionLag:Long)
class Backpressure(private val thresholdSeconds:Long){ fun check(lagSeconds:Long): ProjectionPending? = if(lagSeconds>thresholdSeconds) ProjectionPending(projectionLag=lagSeconds) else null }
