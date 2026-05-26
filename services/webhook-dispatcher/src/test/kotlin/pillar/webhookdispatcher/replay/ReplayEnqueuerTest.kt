package pillar.webhookdispatcher.replay
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
class ReplayEnqueuerTest { @Test fun preservesEvent(){ assertEquals("evt_1", ReplayEnqueuer().replay("evt_1").first) } }
