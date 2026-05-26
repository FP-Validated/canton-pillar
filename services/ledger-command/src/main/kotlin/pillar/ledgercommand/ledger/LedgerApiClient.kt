package pillar.ledgercommand.ledger

import io.grpc.ManagedChannel
import io.grpc.Metadata

class LedgerApiClient(private val host: String, private val port: Int, private val tls: TlsMaterial? = null) : AutoCloseable {
    val channel: ManagedChannel by lazy { ChannelPool.get(host, port, tls) }

    fun authMetadata(token: String): Metadata = Metadata().apply {
        put(Metadata.Key.of("authorization", Metadata.ASCII_STRING_MARSHALLER), "Bearer $token")
    }

    override fun close() {
        // Channels are shared process-wide and reclaimed by ChannelPool after the idle timeout.
    }
}
