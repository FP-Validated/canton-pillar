package pillar.ledgercommand.completion

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class UnknownReconcilerTest {
    @Test fun `unknown reconciles without changing command id`() {
        val unknown = UnknownOutcome("op", "cmd_same", "sub_1")
        val reconciled = UnknownReconciler().reconcile(unknown, listOf(CompletionRecord("op", "cmd_same", "sub_2", "upd", "off", null)))
        assertTrue(reconciled.resolved)
        assertEquals("cmd_same", reconciled.commandId)
    }
}
