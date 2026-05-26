package pillar.projectionworker.projectors
import org.junit.jupiter.api.Test
import kotlin.test.*
class HoldingProjectorTest { @Test fun `fragmentation has no contract ids`(){ val parts=HoldingProjector().fragment(HoldingRow("hldg_1","acct","asset",100), listOf(60,40)); assertEquals(listOf(60L,40L), parts.map{it.quantity}); assertFalse(parts.toString().contains("ContractId")) } }
