package pillar.projectionworker.runtime

enum class ProjectionMode { CATCH_UP, STEADY_STATE }
class ModeMachine(private val watermark:Long){ var mode=ProjectionMode.CATCH_UP; private set; fun observe(offset:Long):ProjectionMode { if(offset>=watermark) mode=ProjectionMode.STEADY_STATE; return mode } }
