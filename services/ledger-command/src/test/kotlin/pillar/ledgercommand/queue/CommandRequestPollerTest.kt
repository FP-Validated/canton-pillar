package pillar.ledgercommand.queue

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Instant

class CommandRequestPollerTest {
    @Test fun `orders by priority applies participant throttle and aging`() {
        val now = Instant.parse("2026-05-26T00:00:00Z")
        val requests = listOf(
            CommandRequest("low-old", "t", "o1", "issue", "v1", "{}", priority = 1, participantId = "p1", availableAt = now.minusSeconds(100)),
            CommandRequest("high", "t", "o2", "issue", "v1", "{}", priority = 5, participantId = "p1", availableAt = now),
            CommandRequest("throttled", "t", "o3", "issue", "v1", "{}", priority = 4, participantId = "p1", availableAt = now),
            CommandRequest("other", "t", "o4", "issue", "v1", "{}", priority = 3, participantId = "p2", availableAt = now),
        )
        val ordered = CommandRequestPoller(participantConcurrency = 2).orderForDispatch(requests, now).map { it.id }
        assertEquals(listOf("high", "throttled", "other"), ordered)
    }
}
