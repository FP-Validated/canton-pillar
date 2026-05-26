package pillar.projectionworker.pqs
import org.junit.jupiter.api.Test
import kotlin.test.*
class PqsFailoverTest { @Test fun `stale replica rejected`(){ val e=PqsEndpoint("primary",PqsSchema(1,"h"),10); assertEquals("primary", PqsFailover(5).choose(listOf(PqsEndpoint("replica",PqsSchema(1,"h"),1),e)).name) } }
