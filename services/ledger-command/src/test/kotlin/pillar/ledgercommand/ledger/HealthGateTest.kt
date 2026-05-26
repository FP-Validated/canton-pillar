package pillar.ledgercommand.ledger

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HealthGateTest {
    @Test fun `ready only when all checks pass`() {
        assertTrue(HealthGate(listOf({ true }, { true })).ready())
        assertFalse(HealthGate(listOf({ true }, { false })).ready())
    }
}
