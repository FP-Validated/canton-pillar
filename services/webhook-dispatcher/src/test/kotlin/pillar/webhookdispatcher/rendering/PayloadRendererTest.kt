package pillar.webhookdispatcher.rendering
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
class PayloadRendererTest { @Test fun renders(){ assertEquals("event", PayloadRenderer().render("evt_1","transfer_intent.succeeded","thin")["object"]) } }
