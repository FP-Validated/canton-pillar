package pillar.webhookdispatcher.dispatch
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
class HttpDispatcherTest { @Test fun rejectsInsecureLive(){ assertTrue(HttpDispatcher().shouldRejectRedirect(true,"http://x")) } }
