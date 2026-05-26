package pillar.ledgercommand.integration

import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test

class SandboxIntegrationTest {
    @Disabled("sandbox unavailable")
    @Test fun `submit command and observe completion when sandbox is reachable`() {
        // Real Canton sandbox assertion is enabled by replacing this disabled smoke with env-backed LedgerApiClient wiring.
    }
}
