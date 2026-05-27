package pillar.webhookdispatcher.dispatch

import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.sql.Connection
import java.sql.DriverManager
import javax.sql.DataSource

class WebhookDeliveryPollerTest {
    @Test
    fun `200 marks delivery delivered`() {
        withServer(listOf(200)) { url, hits ->
            val ds = memoryDataSource()
            setup(ds, url)
            WebhookDeliveryPoller(ds).pollOnce()
            assertEquals(1, hits())
            assertEquals("delivered" to 1, status(ds))
        }
    }

    @Test
    fun `500 twice then 200 retries and delivers after 3 attempts`() {
        withServer(listOf(500, 500, 200)) { url, hits ->
            val ds = memoryDataSource()
            setup(ds, url)
            repeat(3) {
                makeDue(ds)
                WebhookDeliveryPoller(ds).pollOnce()
            }
            assertEquals(3, hits())
            assertEquals("delivered" to 3, status(ds))
        }
    }

    private fun withServer(statuses: List<Int>, block: (String, () -> Int) -> Unit) {
        var count = 0
        val server = HttpServer.create(InetSocketAddress(0), 0)
        server.createContext("/hook") { exchange ->
            count += 1
            val status = statuses[(count - 1).coerceAtMost(statuses.lastIndex)]
            exchange.requestBody.readBytes()
            exchange.sendResponseHeaders(status, 0)
            exchange.responseBody.close()
        }
        server.start()
        try { block("http://127.0.0.1:${server.address.port}/hook") { count } } finally { server.stop(0) }
    }

    private fun setup(ds: DataSource, url: String) = ds.connection.use { c ->
        c.createStatement().use { st ->
            st.execute("create table event_log(id text primary key, tenant_id text not null, payload text not null)")
            st.execute("create table webhook_endpoints(id text primary key, tenant_id text not null, url text not null, signing_secret text, enabled boolean not null)")
            st.execute("create table webhook_deliveries(id text primary key, tenant_id text not null, event_id text not null, endpoint_id text not null, status text not null, attempt integer not null default 0, response_status integer, response_body_sample text, delivered_at timestamp, next_attempt_at timestamp, next_retry_at timestamp, created_at timestamp not null, updated_at timestamp)")
        }
        c.prepareStatement("insert into event_log values('evt_1','acct_1','{\"id\":\"evt_1\"}')").executeUpdate()
        c.prepareStatement("insert into webhook_endpoints values('we_1','acct_1',?,'plr_whsec_test',true)").use { it.setString(1, url); it.executeUpdate() }
        c.prepareStatement("insert into webhook_deliveries(id,tenant_id,event_id,endpoint_id,status,attempt,created_at,next_attempt_at) values('wd_1','acct_1','evt_1','we_1','pending',0,current_timestamp,current_timestamp)").executeUpdate()
    }

    private fun makeDue(ds: DataSource) = ds.connection.use { it.createStatement().executeUpdate("update webhook_deliveries set next_attempt_at=current_timestamp where id='wd_1'") }
    private fun status(ds: DataSource): Pair<String, Int> = ds.connection.use { c -> c.createStatement().executeQuery("select status, attempt from webhook_deliveries where id='wd_1'").use { it.next(); it.getString(1) to it.getInt(2) } }
    private fun memoryDataSource(): DataSource = object : DataSource {
        private val url = "jdbc:h2:mem:${System.nanoTime()};MODE=PostgreSQL;DB_CLOSE_DELAY=-1"
        override fun getConnection(): Connection = DriverManager.getConnection(url)
        override fun getConnection(username: String?, password: String?): Connection = getConnection()
        override fun getLogWriter() = null
        override fun setLogWriter(out: java.io.PrintWriter?) {}
        override fun setLoginTimeout(seconds: Int) {}
        override fun getLoginTimeout() = 0
        override fun getParentLogger() = java.util.logging.Logger.getGlobal()
        override fun <T : Any?> unwrap(iface: Class<T>?) = throw java.sql.SQLFeatureNotSupportedException()
        override fun isWrapperFor(iface: Class<*>?) = false
    }
}
