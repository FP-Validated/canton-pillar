package pillar.templateregistry.security
import java.security.*
import java.time.Instant
data class TrustedKey(val keyId:String,val kmsKeyId:String,val publicKey:PublicKey,val notBefore:Instant,val notAfter:Instant)
class DarSignatureVerifier(private val trusted:List<TrustedKey>) { fun verify(payload:ByteArray, signature:ByteArray, keyId:String, kmsKeyId:String, now:Instant=Instant.now()):Boolean { val key=trusted.find{it.keyId==keyId && it.kmsKeyId==kmsKeyId && !now.isBefore(it.notBefore) && !now.isAfter(it.notAfter)} ?: return false; val alg= when(key.publicKey.algorithm){"RSA"->"SHA256withRSA"; "EC"->"SHA256withECDSA"; else->return false}; return try { Signature.getInstance(alg).run { initVerify(key.publicKey); update(payload); verify(signature) } } catch (_: GeneralSecurityException) { false } } }
