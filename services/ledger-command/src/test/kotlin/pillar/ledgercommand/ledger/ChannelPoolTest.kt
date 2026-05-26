package pillar.ledgercommand.ledger

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class ChannelPoolTest {
    @Test fun `reuses channel for same endpoint and tls profile`() {
        ChannelPool.close()
        val first = ChannelPool.get("localhost", 6865, null)
        val second = ChannelPool.get("localhost", 6865, null)
        assertSame(first, second)
        val metrics = ChannelPool.metrics()
        assertEquals(1, metrics.active)
        assertEquals(1, metrics.createdTotal)
        assertTrue(ChannelPool.prometheusMetrics().contains("pillar_grpc_channel_active 1"))
        ChannelPool.close()
    }
}
