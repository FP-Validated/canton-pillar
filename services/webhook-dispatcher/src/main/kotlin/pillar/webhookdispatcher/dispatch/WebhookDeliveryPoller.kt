package pillar.webhookdispatcher.dispatch

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.sql.Connection
import java.time.Duration
import java.time.Instant
import javax.sql.DataSource

class WebhookDeliveryPoller(
    private val dataSource: DataSource,
    private val httpClient: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build(),
    private val batchSize: Int = 32,
) {
    data class Delivery(val id: String, val tenantId: String, val eventId: String, val endpointId: String, val attempt: Int, val url: String, val secret: String?, val payload: String)

    fun pollOnce(): Int {
        val deliveries = claimBatch()
        deliveries.forEach { deliver(it) }
        return deliveries.size
    }

    fun runForever(pollInterval: Duration = Duration.ofSeconds(1)) {
        while (!Thread.currentThread().isInterrupted) {
            val count = pollOnce()
            if (count == 0) Thread.sleep(pollInterval.toMillis())
        }
    }

    private fun claimBatch(): List<Delivery> = dataSource.connection.use { connection ->
        connection.autoCommit = false
        try {
            val rows = connection.prepareStatement(
                """
                select d.id, d.tenant_id, d.event_id, d.endpoint_id, d.attempt, e.payload, ep.url, ep.signing_secret
                from webhook_deliveries d
                join event_log e on e.id = d.event_id and e.tenant_id = d.tenant_id
                join webhook_endpoints ep on ep.id = d.endpoint_id and ep.tenant_id = d.tenant_id
                where d.status = 'pending' and coalesce(d.next_attempt_at, d.next_retry_at, d.created_at) <= current_timestamp and ep.enabled = true
                order by coalesce(d.next_attempt_at, d.next_retry_at, d.created_at), d.id
                limit ?
                """.trimIndent()
            ).use { statement ->
                statement.setInt(1, batchSize)
                statement.executeQuery().use { rs ->
                    buildList {
                        while (rs.next()) add(Delivery(rs.getString("id"), rs.getString("tenant_id"), rs.getString("event_id"), rs.getString("endpoint_id"), rs.getInt("attempt"), rs.getString("url"), rs.getString("signing_secret"), rs.getString("payload")))
                    }
                }
            }
            connection.commit()
            rows
        } catch (t: Throwable) {
            connection.rollback()
            throw t
        }
    }

    private fun deliver(delivery: Delivery) {
        if (delivery.secret.isNullOrBlank()) {
            updateStatus(delivery.id, "configuration_error", delivery.attempt, null, "missing signing secret")
            return
        }
        val body = delivery.payload.toByteArray(Charsets.UTF_8)
        val timestamp = Instant.now().epochSecond
        val request = HttpRequest.newBuilder(URI.create(delivery.url))
            .timeout(Duration.ofSeconds(10))
            .header("Content-Type", "application/json")
            .header("Pillar-Signature", WebhookSigner.sign(body, timestamp, delivery.secret))
            .POST(HttpRequest.BodyPublishers.ofByteArray(body))
            .build()
        try {
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            handleResponse(delivery, response.statusCode(), response.body())
        } catch (t: Exception) {
            retryOrDlq(delivery, null, t.javaClass.simpleName)
        }
    }

    private fun handleResponse(delivery: Delivery, status: Int, body: String?) {
        when {
            status in 200..299 -> markDelivered(delivery.id, delivery.attempt + 1, status, body)
            status == 429 || status >= 500 -> retryOrDlq(delivery, status, body)
            status in 400..499 -> updateStatus(delivery.id, "failed_permanent", delivery.attempt + 1, status, body)
            else -> retryOrDlq(delivery, status, body)
        }
    }

    private fun retryOrDlq(delivery: Delivery, status: Int?, body: String?) {
        val nextAttempt = delivery.attempt + 1
        if (nextAttempt >= RetrySchedule.maxAttempts) updateStatus(delivery.id, "dlq", nextAttempt, status, body)
        else dataSource.connection.use { connection ->
            connection.prepareStatement("update webhook_deliveries set attempt=?, status='pending', response_status=?, response_body_sample=?, next_attempt_at=?, next_retry_at=?, updated_at=current_timestamp where id=?").use { st ->
                val seconds = RetrySchedule.delay(nextAttempt).seconds
                st.setInt(1, nextAttempt)
                if (status == null) st.setNull(2, java.sql.Types.INTEGER) else st.setInt(2, status)
                st.setString(3, body?.take(1000))
                val next = java.sql.Timestamp.from(Instant.now().plusSeconds(seconds))
                st.setTimestamp(4, next)
                st.setTimestamp(5, next)
                st.setString(6, delivery.id)
                st.executeUpdate()
            }
        }
    }

    private fun markDelivered(id: String, attempt: Int, status: Int, body: String?) = updateStatus(id, "delivered", attempt, status, body, delivered = true)

    private fun updateStatus(id: String, status: String, attempt: Int, responseStatus: Int?, body: String?, delivered: Boolean = false) {
        dataSource.connection.use { connection ->
            connection.prepareStatement("update webhook_deliveries set status=?, attempt=?, response_status=?, response_body_sample=?, delivered_at=${if (delivered) "current_timestamp" else "delivered_at"}, updated_at=current_timestamp where id=?").use { st ->
                st.setString(1, status)
                st.setInt(2, attempt)
                if (responseStatus == null) st.setNull(3, java.sql.Types.INTEGER) else st.setInt(3, responseStatus)
                st.setString(4, body?.take(1000))
                st.setString(5, id)
                st.executeUpdate()
            }
        }
    }
}
