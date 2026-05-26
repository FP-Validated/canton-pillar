package pillar.projectionworker.runtime
import org.junit.jupiter.api.Test
import pillar.projectionworker.config.TenantPartition
import kotlin.test.*
class TenantPartitionTest { @Test fun `hot tenant does not block others`(){ val p=TenantPartition(); val out=mutableListOf<String>(); repeat(3){p.enqueue("hot"){out.add("hot")}}; p.enqueue("cold"){out.add("cold")}; p.drainRoundRobin(); assertTrue(out.indexOf("cold") in 1..2) } }
