package pillar.ledgercommand.config

enum class ParticipantProfile { SANDBOX, STAGING, PRODUCTION }

data class TenantJwtIssuerConfig(
    val tenantId: String,
    val issuer: String,
    val audience: String,
    val keyId: String? = null,
    val ttlSeconds: Long = 300,
)

data class ParticipantAuthConfig(
    val profile: ParticipantProfile,
    val tenants: Map<String, TenantJwtIssuerConfig>,
) {
    fun issuerForTenant(tenantId: String): TenantJwtIssuerConfig = tenants[tenantId]
        ?: TenantJwtIssuerConfig(tenantId, profile.name.lowercase(), "daml-ledger-api")

    companion object {
        fun fromEnv(): ParticipantAuthConfig {
            val profile = runCatching { ParticipantProfile.valueOf((System.getenv("PARTICIPANT_PROFILE") ?: "SANDBOX").uppercase()) }
                .getOrDefault(ParticipantProfile.SANDBOX)
            return ParticipantAuthConfig(profile, emptyMap())
        }
    }
}
