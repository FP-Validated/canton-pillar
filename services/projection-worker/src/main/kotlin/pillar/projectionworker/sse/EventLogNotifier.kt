package pillar.projectionworker.sse

interface SqlNotifierConnection { fun execute(sql: String) }

class EventLogNotifier(private val connection: SqlNotifierConnection) {
    fun notifyEventLog(tenantId: String, livemode: Boolean, eventId: String) {
        require(eventId.startsWith("evt_")) { "event id must start with evt_" }
        val mode = if (livemode) "live" else "test"
        val payload = "${tenantId}:${mode}:${eventId}"
        connection.execute("NOTIFY \"pillar.event_log\", '${payload.replace("'", "''")}'")
    }
}
