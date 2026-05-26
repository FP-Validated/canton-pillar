package pillar.ledgercommand.ledger

import io.grpc.ManagedChannel
import io.grpc.ManagedChannelBuilder
import io.grpc.Metadata
import io.grpc.netty.shaded.io.grpc.netty.GrpcSslContexts
import io.grpc.netty.shaded.io.grpc.netty.NettyChannelBuilder
import java.io.File
import java.util.concurrent.TimeUnit

class LedgerApiClient(private val host: String, private val port: Int, private val tls: TlsMaterial? = null) : AutoCloseable {
    private var opened = false
    val channel: ManagedChannel by lazy {
        opened = true
        if (tls == null) ManagedChannelBuilder.forAddress(host, port).usePlaintext().build()
        else NettyChannelBuilder.forAddress(host, port).sslContext(GrpcSslContexts.forClient().trustManager(tls.trustCert?.let(::File)).build()).build()
    }

    fun authMetadata(token: String): Metadata = Metadata().apply {
        put(Metadata.Key.of("authorization", Metadata.ASCII_STRING_MARSHALLER), "Bearer $token")
    }

    override fun close() {
        if (opened) channel.shutdown().awaitTermination(5, TimeUnit.SECONDS)
    }
}
