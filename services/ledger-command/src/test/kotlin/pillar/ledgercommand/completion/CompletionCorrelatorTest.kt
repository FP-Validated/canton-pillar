package pillar.ledgercommand.completion

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import pillar.ledgercommand.ledger.LedgerCompletion
import java.time.Instant

class CompletionCorrelatorTest {
    @Test fun `matches completions and writes update and offset`() {
        val writer = OperationTraceWriter()
        val record = CompletionCorrelator(writer).correlate(
            listOf(PendingAttempt("cmd_a", "sub_a", "op_a")),
            LedgerCompletion("cmd_a", "sub_a", "OK", "upd_1", "42", Instant.EPOCH),
        )
        assertNotNull(record)
        assertEquals("upd_1", writer.inMemory.single().updateId)
        assertEquals("42", writer.inMemory.single().offset)
    }
}
