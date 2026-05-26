package pillar.templateregistry.config

data class RegistryConfig(val port: Int, val databaseUrl: String, val staleSecondsThreshold: Long = 300) { companion object { fun fromEnv() = RegistryConfig(System.getenv("PORT")?.toInt() ?: 8087, System.getenv("DATABASE_URL") ?: "jdbc:postgresql://localhost:5432/postgres") } }
