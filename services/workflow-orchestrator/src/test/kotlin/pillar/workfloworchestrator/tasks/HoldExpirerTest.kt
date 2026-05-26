package pillar.workfloworchestrator.tasks
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
class HoldExpirerTest { @Test fun command(){ assertEquals("hold_expire", HoldExpirer().enqueue("h")["command_type"]) } }
