package pillar.ledgercommand.ledger

import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant

data class TlsMaterial(val certChain: String?, val privateKey: String?, val trustCert: String?) {
    fun exists(): Boolean = listOfNotNull(certChain, privateKey, trustCert).all { Files.exists(Path.of(it)) }
}

class TlsMaterialReloader(private val load: () -> TlsMaterial) {
    @Volatile private var current: Pair<TlsMaterial, Instant> = load() to Instant.now()
    fun current(): TlsMaterial = current.first
    fun reload(): TlsMaterial = load().also { current = it to Instant.now() }
}
