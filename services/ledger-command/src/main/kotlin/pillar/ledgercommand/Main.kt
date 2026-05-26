package pillar.ledgercommand

import kotlinx.coroutines.runBlocking
import org.slf4j.LoggerFactory
import pillar.ledgercommand.config.LedgerCommandConfig

private val logger = LoggerFactory.getLogger("pillar.ledgercommand.Main")

fun main() = runBlocking {
    val config = LedgerCommandConfig.fromEnv()
    logger.info("starting ledger-command host={} port={} tls={} pollIntervalMs={} participantConcurrency={}", config.ledgerHost, config.ledgerPort, config.tlsEnabled, config.pollIntervalMs, config.participantConcurrency)
}
