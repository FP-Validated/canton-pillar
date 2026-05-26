package pillar.ledgercommand.dedup

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test
import pillar.ledgercommand.ledger.FakeLedgerCommandSubmitter
import pillar.ledgertypes.LedgerCommand

class DedupStateMachineTest {
    @Test fun `same operation reuses command id and creates new submission id`() = runBlocking {
        val machine = DedupStateMachine()
        val command = LedgerCommand.of("issue", "template", "choice", emptyMap())
        val first = machine.submit("tenant", "op", "v1", command, FakeLedgerCommandSubmitter())
        val second = machine.submit("tenant", "op", "v1", command, FakeLedgerCommandSubmitter())
        assertEquals(first.commandId, second.commandId)
        assertNotEquals(first.submissionId, second.submissionId)
    }
}
