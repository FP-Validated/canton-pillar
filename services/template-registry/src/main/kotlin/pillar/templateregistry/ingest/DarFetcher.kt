package pillar.templateregistry.ingest
import java.net.URI
class DarFetcher { fun fetch(uri:String, expectedSha256:String?=null):ByteArray { val bytes=URI(uri).toURL().readBytes(); if(expectedSha256!=null && sha256(bytes)!=expectedSha256) error("DAR checksum mismatch"); return bytes } companion object { fun sha256(bytes:ByteArray)=java.security.MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)} } }
