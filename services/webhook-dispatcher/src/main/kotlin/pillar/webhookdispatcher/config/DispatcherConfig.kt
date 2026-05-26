package pillar.webhookdispatcher.config

data class DispatcherConfig(
    val databaseUrl: String = System.getenv("DATABASE_URL") ?: "",
    val maxInflight: Int = (System.getenv("MAX_INFLIGHT") ?: "16").toInt(),
    val backoffTable: List<Long> = listOf(1, 5, 30, 300),
    val httpTimeoutMs: Long = (System.getenv("HTTP_TIMEOUT_MS") ?: "5000").toLong(),
    val signatureToleranceSeconds: Long = (System.getenv("SIGNATURE_TOLERANCE_SECONDS") ?: "300").toLong()
)
