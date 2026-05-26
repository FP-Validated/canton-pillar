package pillar.ledgercommand.party

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class PartyMappingResolverTest {
    @Test fun `resolves fixture party mapping`() {
        val route = RouteSnapshot("tenant", "acct", "issue", "user", listOf("Alice"), listOf("Observer"), "localhost:6865", "sync")
        val resolved = PartyMappingResolver(fixtures = listOf(route)).resolve("tenant", "acct", "issue")
        assertEquals(listOf("Alice"), resolved.actAs)
        assertEquals("localhost:6865", resolved.participantEndpoint)
    }
}
