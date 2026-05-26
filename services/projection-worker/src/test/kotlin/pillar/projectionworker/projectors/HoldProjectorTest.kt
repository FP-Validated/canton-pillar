package pillar.projectionworker.projectors
import org.junit.jupiter.api.Test
import pillar.projectionworker.projectors.hold.*
import kotlin.test.*
class HoldProjectorTest { @Test fun `timeline and reserved idempotent`(){ val p=HoldProjector(); p.apply("u", HoldEvent("h","active",1), 10); p.apply("u", HoldEvent("h","active",1), 10); assertEquals(1,p.timeline.size); assertEquals(10,p.reserved) } }
