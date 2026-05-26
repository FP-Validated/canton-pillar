package pillar.projectionworker.projectors
import org.junit.jupiter.api.Test
import kotlin.test.*
class BalanceProjectorTest { @Test fun `issue transfer hold release update balances idempotently`(){ val p=BalanceProjector(); val k=BalanceKey("t","a","asset"); p.apply("u1",k,available=100,settled=100); p.apply("u2",k,available=-10,pending=10); p.apply("u3",k,available=-25,reserved=25); p.apply("u4",k,available=25,reserved=-25); p.apply("u4",k,available=25,reserved=-25); assertEquals(BalanceRow(90,10,0,100,0), p.rows[k]) } }
