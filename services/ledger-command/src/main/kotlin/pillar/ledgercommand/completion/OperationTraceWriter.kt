package pillar.ledgercommand.completion

import javax.sql.DataSource

class OperationTraceWriter(private val dataSource: DataSource? = null) {
    val inMemory = mutableListOf<CompletionRecord>()
    fun write(record: CompletionRecord) {
        inMemory += record
        val ds = dataSource ?: return
        ds.connection.use { connection ->
            connection.prepareStatement(
                "UPDATE operations SET update_id = ?, ledger_update_reference = ?, ledger_offset = ?, ledger_recorded_at = ?, status = 'ledger_committed' WHERE id = ? OR operation_id = ?",
            ).use {
                it.setString(1, record.updateId)
                it.setString(2, record.updateId)
                it.setString(3, record.offset)
                it.setObject(4, record.ledgerTime)
                it.setString(5, record.operationId)
                it.setString(6, record.operationId)
                try { it.executeUpdate() } catch (_: Exception) {
                    connection.prepareStatement("UPDATE operations SET ledger_offset = ?, status = 'ledger_committed' WHERE id = ? OR operation_id = ?").use { fallback ->
                        fallback.setString(1, record.offset)
                        fallback.setString(2, record.operationId)
                        fallback.setString(3, record.operationId)
                        fallback.executeUpdate()
                    }
                }
            }
        }
    }
}
