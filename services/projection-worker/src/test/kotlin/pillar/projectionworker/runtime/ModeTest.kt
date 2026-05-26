package pillar.projectionworker.runtime
import org.junit.jupiter.api.Test
import kotlin.test.*
class ModeTest { @Test fun `catchup to steady after watermark`(){ val m=ModeMachine(10); assertEquals(ProjectionMode.CATCH_UP,m.observe(9)); assertEquals(ProjectionMode.STEADY_STATE,m.observe(10)) } }
