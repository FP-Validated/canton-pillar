package pillar.ledgercommand.template.registry_client

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Clock
import java.time.Duration
import java.time.Instant

data class RegistryBinding(val packageVersionId:String,val packageId:String,val templateId:String,val choice:String,val registryVersion:Int,val status:String,val expiresAt:Instant)
class PackageProfileUnavailable(message:String): RuntimeException(message)
class RegistryClient(private val baseUrl:String, private val ttl:Duration=Duration.ofSeconds(30), private val clock:Clock=Clock.systemUTC(), private val http:HttpClient=HttpClient.newHttpClient()) {
    private val cache=mutableMapOf<String,RegistryBinding>(); private var failures=0; private var openedUntil=Instant.EPOCH
    fun activeBinding(key:String):RegistryBinding { val now=clock.instant(); cache[key]?.takeIf{it.expiresAt.isAfter(now)}?.let{return it}; if(openedUntil.isAfter(now)) throw PackageProfileUnavailable("registry circuit open"); return try { val req=HttpRequest.newBuilder(URI.create("$baseUrl/internal/registry/bindings/$key")).GET().build(); val body=http.send(req,HttpResponse.BodyHandlers.ofString()).body(); val parts=body.split(','); RegistryBinding(parts[0],parts[1],parts[2],parts[3],parts[4].toInt(),parts.getOrElse(5){"active"},now.plus(ttl)).also{cache[key]=it; failures=0} } catch(e:Exception){ if(++failures>=3) openedUntil=now.plus(ttl); throw PackageProfileUnavailable("registry unavailable") } }
}
