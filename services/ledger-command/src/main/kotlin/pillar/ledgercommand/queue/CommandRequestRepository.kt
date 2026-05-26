package pillar.ledgercommand.queue

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import javax.sql.DataSource

class CommandRequestRepository(private val dataSource: DataSource) {
    fun claimPending(limit: Int, lease: CommandRequestLease, participantLimit: Int): List<ClaimedCommandRequest> =
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                val claimed = claimPending(connection, limit, lease, participantLimit)
                connection.commit()
                claimed
            } catch (t: Throwable) {
                connection.rollback()
                throw t
            }
        }

    private fun claimPending(connection: Connection, limit: Int, lease: CommandRequestLease, participantLimit: Int): List<ClaimedCommandRequest> {
        val sql = """
            SELECT id, tenant_id, operation_id, command_type, command_semantic_version, command_payload, priority,
                   COALESCE(participant_id, 'default') AS participant_id, status, COALESCE(available_at, now()) AS available_at
              FROM ledger_command_requests
             WHERE status = 'pending' AND COALESCE(available_at, now()) <= now()
             ORDER BY priority DESC, created_at ASC
             FOR UPDATE SKIP LOCKED
             LIMIT ?
        """.trimIndent()
        val rows = connection.prepareStatement(sql).use { statement ->
            statement.setInt(1, limit * 4)
            statement.executeQuery().use { rs -> generateSequence { if (rs.next()) rs.toRequest() else null }.toList() }
        }
        val selected = rows.groupBy { it.participantId }.flatMap { (_, requests) -> requests.take(participantLimit) }.take(limit)
        selected.forEach { request ->
            connection.prepareStatement(
                "UPDATE ledger_command_requests SET status = 'claimed', lease_token = ?, leased_until = ? WHERE id = ?",
            ).use { update ->
                update.setString(1, lease.token)
                update.setObject(2, lease.expiresAt)
                update.setString(3, request.id)
                update.executeUpdate()
            }
        }
        return selected.map { ClaimedCommandRequest(it.copy(status = CommandStatus.CLAIMED), lease.token, lease.expiresAt) }
    }

    fun markUnknown(id: String) = updateStatus(id, CommandStatus.UNKNOWN)
    fun markCompleted(id: String) = updateStatus(id, CommandStatus.COMPLETED)

    private fun updateStatus(id: String, status: CommandStatus) {
        dataSource.connection.use { connection ->
            connection.prepareStatement("UPDATE ledger_command_requests SET status = ? WHERE id = ?").use {
                it.setString(1, status.name.lowercase())
                it.setString(2, id)
                it.executeUpdate()
            }
        }
    }

    private fun ResultSet.toRequest(): CommandRequest = CommandRequest(
        id = getString("id"),
        tenantId = getString("tenant_id"),
        operationId = getString("operation_id"),
        commandType = getString("command_type"),
        commandSemanticVersion = getString("command_semantic_version"),
        payloadJson = getString("command_payload"),
        priority = getInt("priority"),
        participantId = getString("participant_id"),
        status = CommandStatus.valueOf(getString("status").uppercase()),
        availableAt = getObject("available_at", Instant::class.java),
    )

    companion object {
        fun dataSource(jdbcUrl: String): HikariDataSource = HikariDataSource(HikariConfig().apply { this.jdbcUrl = jdbcUrl })
    }
}
