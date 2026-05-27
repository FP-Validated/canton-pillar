package pillar.ledgercommand

import com.fasterxml.jackson.databind.ObjectMapper
import kotlinx.coroutines.runBlocking
import org.slf4j.LoggerFactory
import pillar.ledgercommand.command.JsonCommandBuilder
import pillar.ledgercommand.config.LedgerCommandConfig
import pillar.ledgercommand.failure.FailureClassifier
import pillar.ledgercommand.ledger.CantonGrpcLedgerCommandSubmitter
import pillar.ledgercommand.ledger.EmptyCompletionClient
import pillar.ledgercommand.ledger.LedgerApiClient
import pillar.ledgercommand.queue.CommandRequestPoller
import pillar.ledgercommand.queue.CommandRequestRepository

private val logger = LoggerFactory.getLogger("pillar.ledgercommand.Main")

fun main() = runBlocking {
    val config = LedgerCommandConfig.fromEnv()
    logger.info("starting ledger-command host={} port={} tls={} pollIntervalMs={} participantConcurrency={}", config.ledgerHost, config.ledgerPort, config.tlsEnabled, config.pollIntervalMs, config.participantConcurrency)
    val databaseUrl = config.databaseUrl ?: error("DATABASE_URL is required")
    val repository = CommandRequestRepository(CommandRequestRepository.dataSource(toJdbcUrl(databaseUrl)))
    val submitter = resolveSubmitter()
    val poller = CommandRequestPoller(
        repository = repository,
        submitter = submitter,
        commandBuilder = JsonCommandBuilder(ObjectMapper()),
        pollIntervalMs = config.pollIntervalMs,
        participantConcurrency = config.participantConcurrency,
        failureClassifier = FailureClassifier(),
    )
    poller.start(this).join()
}

internal fun resolveSubmitter(): pillar.ledgercommand.ledger.LedgerCommandSubmitter {
    // ADR: Canton-backed runtime. The fake submitter is only valid in test mode.
    // The default is `grpc`; production/testnet/mainnet refuse to boot under `fake`.
    val mode = (System.getenv("PILLAR_LEDGER_SUBMITTER") ?: "grpc").lowercase()
    val deployment = (System.getenv("PILLAR_DEPLOYMENT_MODE") ?: "dev").lowercase()
    return when (mode) {
        "fake" -> {
            if (deployment in setOf("production", "mainnet", "testnet")) {
                error("PILLAR_LEDGER_SUBMITTER=fake is not allowed when PILLAR_DEPLOYMENT_MODE=$deployment")
            }
            logger.warn("ledger-command booting with FakeLedgerCommandSubmitter (deployment={})", deployment)
            pillar.ledgercommand.ledger.FakeLedgerCommandSubmitter()
        }
        "grpc" -> {
            val host = requiredEnv("PILLAR_LEDGER_HOST")
            val port = requiredEnv("PILLAR_LEDGER_PORT").toIntOrNull() ?: error("PILLAR_LEDGER_PORT must be an integer")
            requiredEnv("PILLAR_LEDGER_TLS").toBooleanStrictOrNull() ?: error("PILLAR_LEDGER_TLS must be true or false")
            val actAs = requiredEnv("PILLAR_LEDGER_ACT_AS")
            val applicationId = System.getenv("PILLAR_LEDGER_APPLICATION_ID") ?: "pillar-runtime"
            CantonGrpcLedgerCommandSubmitter(
                ledgerApiClient = LedgerApiClient(host, port),
                completionClient = EmptyCompletionClient(),
                actAs = actAs,
                applicationId = applicationId,
            )
        }
        else -> error("unsupported PILLAR_LEDGER_SUBMITTER=$mode")
    }
}

private fun requiredEnv(name: String): String =
    System.getenv(name)?.takeIf { it.isNotBlank() } ?: error("$name is required when PILLAR_LEDGER_SUBMITTER=grpc")

internal fun toJdbcUrl(url: String): String = when {
    url.startsWith("jdbc:") -> url
    url.startsWith("postgres://") -> url.replaceFirst("postgres://", "jdbc:postgresql://")
    url.startsWith("postgresql://") -> url.replaceFirst("postgresql://", "jdbc:postgresql://")
    else -> url
}
