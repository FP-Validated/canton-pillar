package pillar.reconciler.scheduler
import org.junit.jupiter.api.Test
import kotlin.test.*
class RebuildSchedulerTest { @Test fun `per projector cadence`(){ val s=RebuildScheduler(mapOf("balances" to 10)); assertFalse(s.due("balances",9)); assertTrue(s.due("balances",10)); assertEquals("balances", s.scope("balances")["projector_name"]) } }
