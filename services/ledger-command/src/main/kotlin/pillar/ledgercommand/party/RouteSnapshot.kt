package pillar.ledgercommand.party

data class RouteSnapshot(
    val tenantId: String,
    val accountId: String?,
    val commandType: String,
    val userId: String,
    val actAs: List<String>,
    val readAs: List<String>,
    val participantEndpoint: String,
    val synchronizer: String,
)
