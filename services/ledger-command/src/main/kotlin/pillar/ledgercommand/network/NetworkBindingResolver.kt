package pillar.ledgercommand.network

data class TenantCommandContext(val tenantId: String, val network: String, val intentType: String)
data class ValidatorRoute(val validatorId: String, val participantEndpointRef: String, val jwtIssuer: String? = null, val tlsProfile: String? = null, val fallbackUsed: Boolean = false)

class NetworkBindingResolver {
    fun choose(context: TenantCommandContext): Pair<String, String> {
        require(context.tenantId.isNotBlank()) { "tenant_id_required" }
        require(context.network in setOf("dev", "testnet", "mainnet")) { "network_unsupported" }
        return context.network to context.intentType
    }
}
