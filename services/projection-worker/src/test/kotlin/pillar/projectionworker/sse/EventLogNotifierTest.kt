package pillar.projectionworker.sse

import kotlin.test.Test
import kotlin.test.assertEquals

class EventLogNotifierTest {
    @Test
    fun `emits tenant livemode event id payload`() {
        var sql = ""
        val notifier = EventLogNotifier(object : SqlNotifierConnection { override fun execute(sqlStatement: String) { sql = sqlStatement } })
        notifier.notifyEventLog("acct_demo", false, "evt_1234")
        assertEquals("NOTIFY \"pillar.event_log\", 'acct_demo:test:evt_1234'", sql)
    }
}
