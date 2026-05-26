package pillar.webhookdispatcher.health
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
class HealthMonitorTest { @Test fun counts(){ val h=HealthMonitor(); h.fail("http"); assertEquals(1,h.failures["http"]) } }
