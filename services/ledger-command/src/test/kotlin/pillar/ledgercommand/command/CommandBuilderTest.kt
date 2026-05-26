package pillar.ledgercommand.command

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class CommandBuilderTest {
    private val selector = PackageProfileSelector()

    @Test fun `builder output for all types`() {
        val payload = "{\"amount\":100,\"accountId\":\"acct_1\"}"
        val cases = mapOf(
            "issue" to IssueCommandBuilder().build(payload, selector.select("issue")),
            "transfer" to TransferCommandBuilder().build(payload, selector.select("transfer")),
            "hold" to HoldCommandBuilder().build(payload, selector.select("hold")),
            "hold_release" to HoldReleaseCommandBuilder().build(payload, selector.select("hold_release")),
            "redeem" to RedeemCommandBuilder().build(payload, selector.select("redeem")),
        )
        cases.forEach { (type, command) ->
            assertEquals(type, command.commandType())
            assertEquals(100, command.arguments()["amount"])
        }
    }
}
