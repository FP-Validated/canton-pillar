package pillar.ledgercommand.dedup

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SubmissionUniquenessTest {
    @Test fun `retries keep command id and create fresh submission ids`() {
        val commandIds = (1..3).map { CommandIdentity.deriveCommandId("tenant", "op_1", "v1") }.toSet()
        val submissionIds = (1..3).map { SubmissionIdentity.newId() }
        assertEquals(1, commandIds.size)
        assertEquals(3, submissionIds.toSet().size)
        submissionIds.forEach { assert(it.startsWith("sub_")) }
    }
}
