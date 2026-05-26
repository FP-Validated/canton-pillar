package pillar.projectionworker.runtime
import org.junit.jupiter.api.Test
import kotlin.test.*
class HotReloadTest { @Test fun `resume without loss`(){ assertEquals(8, HotReload().restart(5){8}) } }
