package pillar.workfloworchestrator.outbox
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
class OutboxClaimTest { @Test fun competing(){ val r=OutboxRepository(); assertNotNull(r.claim("t","a")); assertNull(r.claim("t","b")); r.complete("t"); assertNotNull(r.claim("t","b")) } }
