package pillar.ledgercommand.dedup

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SubmissionIdentityTest {
    @Test fun `attempts get distinct submission ids`() {
        val ids = (1..100).map { SubmissionIdentity.newId() }
        assertEquals(ids.size, ids.toSet().size)
        assertTrue(ids.all { it.startsWith("sub_") })
    }
}
