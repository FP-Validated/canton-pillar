package pillar.webhookdispatcher.sse

interface WebhookNotifyConnection { fun execute(sql: String) }

class EventLogNotifierTap(private val connection: WebhookNotifyConnection) {
    fun notifyWebhookDelivery(tenantId: String, livemode: Boolean, deliveryId: String) {
        val mode = if (livemode) "live" else "test"
        val payload = "${tenantId}:${mode}:${deliveryId}"
        connection.execute("NOTIFY \"pillar.webhook_delivery\", '${payload.replace("'", "''")}'")
    }
}
