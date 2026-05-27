package pillar.webhookdispatcher.dispatch

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object WebhookSigner {
    fun sign(rawBody: ByteArray, timestamp: Long, secret: String): String {
        val payload = timestamp.toString().toByteArray(Charsets.UTF_8) + byteArrayOf('.'.code.toByte()) + rawBody
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val hex = mac.doFinal(payload).joinToString("") { "%02x".format(it) }
        return "t=$timestamp,v1=$hex"
    }
}
