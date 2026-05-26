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
            SELECT id, tenant_id, operation_id,
                   COALESCE(command_type, payload->>'command_type', 'issue') AS command_type,
                   COALESCE(command_semantic_version, payload->>'command_semantic_version', 'v1') AS command_semantic_version,
                   COALESCE(command_payload, payload, '{}'::jsonb)::text AS command_payload,
                   COALESCE(priority, 0) AS priority,
                   COALESCE(participant_id, 'default') AS participant_id,
                   status,
                   COALESCE(available_at, now()) AS available_at
              FROM ledger_command_requests
             WHERE status IN ('received', 'queued', 'pending') AND COALESCE(available_at, now()) <= now()
             ORDER BY created_at ASC
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
                "UPDATE ledger_command_requests SET status = 'claimed', lease_token = ?, leased_until = ?, locked_until = ? WHERE id = ?",
            ).use { update ->
                update.setString(1, lease.token)
                update.setObject(2, lease.expiresAt)
                update.setObject(3, lease.expiresAt)
                update.setString(4, request.id)
                try { update.executeUpdate() } catch (_: Exception) {
                    connection.prepareStatement("UPDATE ledger_command_requests SET status = 'claimed' WHERE id = ?").use { fallback ->
                        fallback.setString(1, request.id)
                        fallback.executeUpdate()
                    }
                }
            }
        }
        return selected.map { ClaimedCommandRequest(it.copy(status = CommandStatus.CLAIMED), lease.token, lease.expiresAt) }
    }

    fun ensureCommandIdentity(operationId: String, derivedCommandId: String): Boolean = dataSource.connection.use { connection ->
        connection.prepareStatement("SELECT command_id FROM operations WHERE id = ? OR operation_id = ?").use { select ->
            select.setString(1, operationId)
            select.setString(2, operationId)
            select.executeQuery().use { rs ->
                if (!rs.next()) return@use true
                val stored = rs.getString(1)
                if (stored == null) {
                    connection.prepareStatement("UPDATE operations SET command_id = ? WHERE id = ? OR operation_id = ?").use { update ->
                        update.setString(1, derivedCommandId)
                        update.setString(2, operationId)
                        update.setString(3, operationId)
                        update.executeUpdate()
                    }
                    true
                } else stored == derivedCommandId
            }
        }
    }

    fun insertAttempt(request: CommandRequest, commandId: String, submissionId: String) {
        dataSource.connection.use { connection ->
            val attempt = connection.prepareStatement("SELECT COALESCE(MAX(attempt), 0) + 1 FROM ledger_command_attempts WHERE operation_id = ?").use {
                it.setString(1, request.operationId)
                it.executeQuery().use { rs -> rs.next(); rs.getInt(1) }
            }
            connection.prepareStatement(
                "INSERT INTO ledger_command_attempts (id, tenant_id, operation_id, submission_id, command_id, attempt, status) VALUES (?, ?, ?, ?, ?, ?, 'submitted')",
            ).use {
                it.setString(1, "lca_${submissionId.removePrefix("sub_")}")
                it.setString(2, request.tenantId)
                it.setString(3, request.operationId)
                it.setString(4, submissionId)
                it.setString(5, commandId)
                it.setInt(6, attempt)
                it.executeUpdate()
            }
        }
    }

    fun markSubmitted(id: String, operationId: String, submissionId: String) {
        dataSource.connection.use { connection ->
            connection.prepareStatement("UPDATE operations SET status = 'submitted', submission_id = ? WHERE id = ? OR operation_id = ?").use {
                it.setString(1, submissionId)
                it.setString(2, operationId)
                it.setString(3, operationId)
                try { it.executeUpdate() } catch (_: Exception) {}
            }
            connection.prepareStatement("UPDATE ledger_command_requests SET status = 'submitted' WHERE id = ?").use {
                it.setString(1, id)
                it.executeUpdate()
            }
        }
    }

    fun retryRequest(id: String, operationId: String, code: String, message: String) {
        dataSource.connection.use { connection ->
            connection.prepareStatement("UPDATE ledger_command_requests SET status = 'received', available_at = now() + interval '1 second' WHERE id = ?").use {
                it.setString(1, id)
                try { it.executeUpdate() } catch (_: Exception) { updateStatus(id, CommandStatus.UNKNOWN) }
            }
            connection.prepareStatement("UPDATE operations SET status = 'unknown' WHERE id = ? OR operation_id = ?").use {
                it.setString(1, operationId)
                it.setString(2, operationId)
                try { it.executeUpdate() } catch (_: Exception) {}
            }
        }
    }

    fun failRequest(id: String, operationId: String, code: String, message: String) {
        dataSource.connection.use { connection ->
            connection.prepareStatement("UPDATE ledger_command_requests SET status = 'failed' WHERE id = ?").use {
                it.setString(1, id)
                it.executeUpdate()
            }
            connection.prepareStatement("UPDATE operations SET status = 'failed' WHERE id = ? OR operation_id = ?").use {
                it.setString(1, operationId)
                it.setString(2, operationId)
                try { it.executeUpdate() } catch (_: Exception) {}
            }
        }
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
        status = CommandStatus.valueOf(getString("status").uppercase().replace("QUEUED", "PENDING").replace("RECEIVED", "PENDING")),
        availableAt = getObject("available_at", Instant::class.java),
    )

    companion object {
        fun dataSource(jdbcUrl: String): HikariDataSource = HikariDataSource(HikariConfig().apply { this.jdbcUrl = jdbcUrl })
    }
}
