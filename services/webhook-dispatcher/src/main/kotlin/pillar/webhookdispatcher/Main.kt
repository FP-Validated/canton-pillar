package pillar.webhookdispatcher

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import pillar.webhookdispatcher.dispatch.WebhookDeliveryPoller

fun main() {
    val databaseUrl = System.getenv("DATABASE_URL") ?: error("DATABASE_URL is required")
    HikariDataSource(HikariConfig().apply { jdbcUrl = toJdbcUrl(databaseUrl) }).use { dataSource ->
        WebhookDeliveryPoller(dataSource).runForever()
    }
}

internal fun toJdbcUrl(url: String): String = when {
    url.startsWith("jdbc:") -> url
    url.startsWith("postgres://") -> url.replaceFirst("postgres://", "jdbc:postgresql://")
    url.startsWith("postgresql://") -> url.replaceFirst("postgresql://", "jdbc:postgresql://")
    else -> url
}
