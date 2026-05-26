package pillar.ledgercommand.dedup

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class CommandIdentityTest {
    @Test fun `same inputs produce same command id`() {
        val a = CommandIdentity.derive("tenant_1", "op_1", "v1")
        val b = CommandIdentity.derive("tenant_1", "op_1", "v1")
        assertEquals(a, b)
        assertTrue(a.startsWith("cmd_"))
        assertEquals(28, a.length)
        assertEquals("cmd_c9c104cd86eb2713722f293c", a)
    }

    @Test fun `semantic version changes id`() {
        assertNotEquals(CommandIdentity.derive("tenant_1", "op_1", "v1"), CommandIdentity.derive("tenant_1", "op_1", "v2"))
    }
}
