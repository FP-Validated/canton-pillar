package pillar.projectionworker.projectors
import org.junit.jupiter.api.Test
import pillar.projectionworker.projectors.operation.*
import kotlin.test.*
class OperationProjectorTest { @Test fun `maps command update offset`(){ val p=OperationProjector(); p.apply(OperationProjection("op","cmd","upd",7,"committed")); assertEquals("upd", p.rows["op"]!!.updateId) } }
