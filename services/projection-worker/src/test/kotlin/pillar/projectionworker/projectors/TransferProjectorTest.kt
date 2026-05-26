package pillar.projectionworker.projectors
import org.junit.jupiter.api.Test
import pillar.projectionworker.projectors.transfer.*
import kotlin.test.*
class TransferProjectorTest { @Test fun `history rows cursor stable`(){ val h=TransferProjector().history(listOf(TransferRow("b",2,"c2"),TransferRow("a",1,"c1"))); assertEquals(listOf("a","b"), h.map{it.id}) } }
