package pillar.ledgercommand.command

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class CommandBuilderRoundtripTest {
    @Test fun `all command types produce expected command shape`() {
        val builder = JsonCommandBuilder()
        val selector = PackageProfileSelector()
        for (type in listOf("issue", "transfer", "hold", "hold_release", "redeem")) {
            val command = builder.build(type, "{\"amount\":\"1.000000\"}", selector.select(type))
            assertEquals(type, command.commandType())
            assertEquals(selector.select(type).templateId, command.templateId())
            assertEquals(selector.select(type).choice, command.choice())
            assertEquals("1.000000", command.arguments()["amount"])
        }
    }
}
