package pillar.projectionworker.projectors
import org.junit.jupiter.api.Test
import kotlin.test.*
class EventProjectorTest { @Test fun `evt rows immutable`(){ val p=EventProjector(); p.append(EventRow("evt_1","balance.updated", mapOf("id" to "bal"))); assertFails{ p.append(EventRow("evt_1","balance.updated", emptyMap())) } } }
