package pillar.webhookdispatcher.signing
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
data class Signature(val timestamp:Long,val value:String)
class Signer { fun sign(secret:String,timestamp:Long,rawBody:ByteArray):String { val mac=Mac.getInstance("HmacSHA256"); mac.init(SecretKeySpec(secret.toByteArray(),"HmacSHA256")); mac.update(timestamp.toString().toByteArray()); mac.update('.'.code.toByte()); mac.update(rawBody); return mac.doFinal().joinToString("") { "%02x".format(it) } } fun header(secrets:List<String>,timestamp:Long,rawBody:ByteArray)= "t=$timestamp," + secrets.joinToString(",") { "v1=${sign(it,timestamp,rawBody)}" } }
