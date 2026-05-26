package pillar.ledgercommand.ledger

import io.grpc.ManagedChannel
import io.grpc.ManagedChannelBuilder
import io.grpc.netty.shaded.io.grpc.netty.GrpcSslContexts
import io.grpc.netty.shaded.io.grpc.netty.NettyChannelBuilder
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

data class ChannelPoolMetrics(val active: Long, val createdTotal: Long, val closedTotal: Long)

object ChannelPool : AutoCloseable {
    private const val IDLE_MILLIS = 5 * 60 * 1000L
    private data class Key(val endpoint: String, val tlsProfile: String)
    private data class Entry(val channel: ManagedChannel, @Volatile var lastUsed: Long)

    private val entries = ConcurrentHashMap<Key, Entry>()
    private val created = AtomicLong(0)
    private val closed = AtomicLong(0)

    fun get(host: String, port: Int, tls: TlsMaterial?): ManagedChannel {
        closeIdle()
        val endpoint = "$host:$port"
        val key = Key(endpoint, tls?.trustCert ?: "plaintext")
        val now = System.currentTimeMillis()
        return entries.compute(key) { _, existing ->
            if (existing != null && !existing.channel.isShutdown && !existing.channel.isTerminated) {
                existing.lastUsed = now
                existing
            } else {
                created.incrementAndGet()
                Entry(build(host, port, tls), now)
            }
        }!!.channel
    }

    private fun build(host: String, port: Int, tls: TlsMaterial?): ManagedChannel =
        if (tls == null) ManagedChannelBuilder.forAddress(host, port).usePlaintext().build()
        else NettyChannelBuilder.forAddress(host, port)
            .sslContext(GrpcSslContexts.forClient().trustManager(tls.trustCert?.let(::File)).build())
            .build()

    fun closeIdle(now: Long = System.currentTimeMillis()) {
        entries.forEach { (key, entry) ->
            if (now - entry.lastUsed >= IDLE_MILLIS && entries.remove(key, entry)) {
                entry.channel.shutdown()
                closed.incrementAndGet()
            }
        }
    }

    fun metrics(): ChannelPoolMetrics = ChannelPoolMetrics(
        active = entries.values.count { !it.channel.isShutdown && !it.channel.isTerminated }.toLong(),
        createdTotal = created.get(),
        closedTotal = closed.get(),
    )

    fun prometheusMetrics(): String {
        val m = metrics()
        return "pillar_grpc_channel_active ${m.active}\n" +
            "pillar_grpc_channel_created_total ${m.createdTotal}\n" +
            "pillar_grpc_channel_closed_total ${m.closedTotal}\n"
    }

    override fun close() {
        entries.values.forEach { it.channel.shutdown().awaitTermination(5, TimeUnit.SECONDS) }
        closed.addAndGet(entries.size.toLong())
        entries.clear()
    }
}
