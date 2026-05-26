package pillar.projectionworker.runtime
import org.junit.jupiter.api.Test
import kotlin.test.*
class BackpressureTest { @Test fun `slow projector returns bounded pending`(){ assertEquals("projection_pending", Backpressure(3).check(4)!!.status) } }
