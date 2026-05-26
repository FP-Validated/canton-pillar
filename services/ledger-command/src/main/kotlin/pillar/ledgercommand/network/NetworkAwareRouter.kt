package pillar.ledgercommand.network

class NetworkBindingUnavailable(message: String = "network_binding_unavailable") : RuntimeException(message)

interface ValidatorRegistryClient {
    fun resolveValidatorForTenant(tenantId: String, network: String, intentType: String): ValidatorRoute?
}

class NetworkAwareRouter(private val client: ValidatorRegistryClient, private val ttlMillis: Long = 30_000) {
    private data class Entry(val route: ValidatorRoute, val expiresAt: Long)
    private val cache = mutableMapOf<String, Entry>()
    fun route(context: TenantCommandContext, nowMillis: Long = System.currentTimeMillis()): ValidatorRoute {
        NetworkBindingResolver().choose(context)
        val key = "${context.tenantId}:${context.network}:${context.intentType}"
        val cached = cache[key]
        if (cached != null && cached.expiresAt > nowMillis) return cached.route
        val route = client.resolveValidatorForTenant(context.tenantId, context.network, context.intentType) ?: throw NetworkBindingUnavailable()
        cache[key] = Entry(route, nowMillis + ttlMillis)
        return route
    }
    fun invalidate(tenantId: String, network: String) { cache.keys.filter { it.startsWith("$tenantId:$network:") }.forEach { cache.remove(it) } }
}
