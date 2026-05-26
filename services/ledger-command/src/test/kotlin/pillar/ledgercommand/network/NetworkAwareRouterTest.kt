package pillar.ledgercommand.network

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class NetworkAwareRouterTest {
    @Test fun `tenant binding to mainnet validator A submits to A`() {
        val client = object : ValidatorRegistryClient { override fun resolveValidatorForTenant(tenantId: String, network: String, intentType: String) = ValidatorRoute("A", "participant-a") }
        val route = NetworkAwareRouter(client).route(TenantCommandContext("tenant", "mainnet", "transfer"), 0)
        assertEquals("A", route.validatorId)
        assertEquals("participant-a", route.participantEndpointRef)
    }
    @Test fun `pause to A flips to fallback B after invalidation`() {
        var paused = false
        val client = object : ValidatorRegistryClient { override fun resolveValidatorForTenant(tenantId: String, network: String, intentType: String) = if (paused) ValidatorRoute("B", "participant-b", fallbackUsed = true) else ValidatorRoute("A", "participant-a") }
        val router = NetworkAwareRouter(client)
        assertEquals("A", router.route(TenantCommandContext("tenant", "mainnet", "transfer"), 0).validatorId)
        paused = true
        router.invalidate("tenant", "mainnet")
        val route = router.route(TenantCommandContext("tenant", "mainnet", "transfer"), 1)
        assertEquals("B", route.validatorId)
        assertTrue(route.fallbackUsed)
    }
    @Test fun `missing binding fails with network_binding_unavailable`() {
        val client = object : ValidatorRegistryClient { override fun resolveValidatorForTenant(tenantId: String, network: String, intentType: String): ValidatorRoute? = null }
        val err = assertThrows(NetworkBindingUnavailable::class.java) { NetworkAwareRouter(client).route(TenantCommandContext("tenant", "mainnet", "transfer"), 0) }
        assertEquals("network_binding_unavailable", err.message)
    }
}
