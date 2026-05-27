package pillar.webhookdispatcher.dispatch

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class WebhookSignerTest {
    @Test
    fun `sign returns timestamp and hmac sha256 hex`() {
        val body = "{\"id\":\"evt_test\"}".toByteArray()
        val expected = expectedHex("plr_whsec_test", "1779765314.${String(body)}")
        assertEquals("t=1779765314,v1=$expected", WebhookSigner.sign(body, 1779765314, "plr_whsec_test"))
    }

    private fun expectedHex(secret: String, payload: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(), "HmacSHA256"))
        return mac.doFinal(payload.toByteArray()).joinToString("") { "%02x".format(it) }
    }
}
