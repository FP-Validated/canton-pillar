package pillar.projectionworker.ledger
import org.junit.jupiter.api.Test
import kotlin.test.*
class CheckpointRepositoryTest { @Test fun `advance only in tx and fencing rejects stale`(){ val r=CheckpointRepository(); val t=r.acquire("p"); var wrote=false; r.advanceInTransaction("p",t,5,9){wrote=true}; assertTrue(wrote); assertEquals(5,r.get("p").appliedOffset); assertFails{ r.advanceInTransaction("p",t-1,6,10){} } } }
