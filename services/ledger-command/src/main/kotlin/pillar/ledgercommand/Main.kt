package pillar.ledgercommand

import com.fasterxml.jackson.databind.ObjectMapper
import kotlinx.coroutines.runBlocking
import org.slf4j.LoggerFactory
import pillar.ledgercommand.command.JsonCommandBuilder
import pillar.ledgercommand.config.LedgerCommandConfig
import pillar.ledgercommand.failure.FailureClassifier
import pillar.ledgercommand.ledger.FakeLedgerCommandSubmitter
import pillar.ledgercommand.queue.CommandRequestPoller
import pillar.ledgercommand.queue.CommandRequestRepository

private val logger = LoggerFactory.getLogger("pillar.ledgercommand.Main")

fun main() = runBlocking {
    val config = LedgerCommandConfig.fromEnv()
    logger.info("starting ledger-command host={} port={} tls={} pollIntervalMs={} participantConcurrency={}", config.ledgerHost, config.ledgerPort, config.tlsEnabled, config.pollIntervalMs, config.participantConcurrency)
    val databaseUrl = config.databaseUrl ?: error("DATABASE_URL is required")
    val repository = CommandRequestRepository(CommandRequestRepository.dataSource(toJdbcUrl(databaseUrl)))
    val poller = CommandRequestPoller(
        repository = repository,
        submitter = FakeLedgerCommandSubmitter(),
        commandBuilder = JsonCommandBuilder(ObjectMapper()),
        pollIntervalMs = config.pollIntervalMs,
        participantConcurrency = config.participantConcurrency,
        failureClassifier = FailureClassifier(),
    )
    poller.start(this).join()
}

internal fun toJdbcUrl(url: String): String = when {
    url.startsWith("jdbc:") -> url
    url.startsWith("postgres://") -> url.replaceFirst("postgres://", "jdbc:postgresql://")
    url.startsWith("postgresql://") -> url.replaceFirst("postgresql://", "jdbc:postgresql://")
    else -> url
}
