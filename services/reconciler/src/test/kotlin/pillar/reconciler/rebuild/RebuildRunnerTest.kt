package pillar.reconciler.rebuild
import org.junit.jupiter.api.Test
import kotlin.test.*
class RebuildRunnerTest { @Test fun `byte equal canonical balances after replay`(){ val r=RebuildRunner().rebuild(listOf(mapOf("asset" to "a","updated_at" to "ignored"))); assertTrue(r.byteEqual); assertFalse(r.canonical.contains("updated_at")) } }
