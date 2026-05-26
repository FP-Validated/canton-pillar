package pillar.ledgercommand.config

data class LedgerCommandConfig(
    val ledgerHost: String = env("LEDGER_HOST", "localhost"),
    val ledgerPort: Int = env("LEDGER_PORT", "6865").toInt(),
    val jwtIssuer: String = env("JWT_ISSUER", "sandbox"),
    val tlsEnabled: Boolean = env("TLS_ENABLED", "false").toBoolean(),
    val mtlsCertPath: String? = System.getenv("MTLS_CERT_PATH"),
    val mtlsKeyPath: String? = System.getenv("MTLS_KEY_PATH"),
    val databaseUrl: String? = System.getenv("DATABASE_URL"),
    val pollIntervalMs: Long = env("POLL_INTERVAL_MS", "1000").toLong(),
    val participantConcurrency: Int = env("PARTICIPANT_CONCURRENCY", "8").toInt(),
) {
    companion object {
        fun fromEnv(): LedgerCommandConfig = LedgerCommandConfig()
        private fun env(name: String, default: String): String = System.getenv(name) ?: default
    }
}
