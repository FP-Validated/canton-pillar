package pillar.ledgercommand.completion

import javax.sql.DataSource

class OperationTraceWriter(private val dataSource: DataSource? = null) {
    val inMemory = mutableListOf<CompletionRecord>()
    fun write(record: CompletionRecord) {
        inMemory += record
        val ds = dataSource ?: return
        ds.connection.use { connection ->
            connection.prepareStatement("UPDATE operations SET ledger_update_reference = ?, ledger_offset = ? WHERE id = ?").use {
                it.setString(1, record.updateId)
                it.setString(2, record.offset)
                it.setString(3, record.operationId)
                it.executeUpdate()
            }
        }
    }
}
