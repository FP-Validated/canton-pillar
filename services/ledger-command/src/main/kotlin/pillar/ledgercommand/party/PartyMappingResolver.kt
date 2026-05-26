package pillar.ledgercommand.party

import javax.sql.DataSource

class PartyMappingResolver(private val dataSource: DataSource? = null, private val fixtures: List<RouteSnapshot> = emptyList()) {
    fun resolve(tenantId: String, accountId: String?, commandType: String): RouteSnapshot {
        fixtures.firstOrNull { it.tenantId == tenantId && it.accountId == accountId && it.commandType == commandType }?.let { return it }
        val ds = dataSource ?: error("party mapping not found and no dataSource configured")
        ds.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT user_id, act_as, read_as, participant_endpoint, synchronizer
                  FROM party_mappings
                 WHERE tenant_id = ? AND (account_id = ? OR account_id IS NULL) AND command_type = ?
                 ORDER BY account_id NULLS LAST
                 LIMIT 1
                """.trimIndent(),
            ).use { statement ->
                statement.setString(1, tenantId)
                statement.setString(2, accountId)
                statement.setString(3, commandType)
                statement.executeQuery().use { rs ->
                    if (!rs.next()) error("party mapping not found for tenant=$tenantId commandType=$commandType")
                    return RouteSnapshot(
                        tenantId = tenantId,
                        accountId = accountId,
                        commandType = commandType,
                        userId = rs.getString("user_id"),
                        actAs = rs.getString("act_as").split(',').filter { it.isNotBlank() },
                        readAs = rs.getString("read_as").split(',').filter { it.isNotBlank() },
                        participantEndpoint = rs.getString("participant_endpoint"),
                        synchronizer = rs.getString("synchronizer"),
                    )
                }
            }
        }
    }
}
