package pillar.reconciler.diff
import org.junit.jupiter.api.Test
import kotlin.test.*
class DiffReporterTest { @Test fun `sample versus full bounded examples`(){ val d=listOf(Diff("a","critical"),Diff("b","warning"),Diff("c","warning")); assertEquals(2,DiffReporter().report(d).examples.size); assertEquals(3,DiffReporter().report(d,true).examples.size) } }
