package pillar.webhookdispatcher.signing
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
class SignerTest { @Test fun signs(){ val h=Signer().header(listOf("plr_whsec_test_123"),1779765314,"{\"id\":\"evt_test\",\"object\":\"event\",\"type\":\"transfer_intent.succeeded\"}".toByteArray()); assertTrue(h.startsWith("t=1779765314,v1=")); assertFalse(h.contains(" ")) } }
