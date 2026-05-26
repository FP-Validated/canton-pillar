package pillar.ledgercommand.ledger

import pillar.ledgercommand.party.RouteSnapshot

enum class DeploymentMode { SANDBOX, ACTIVE_ACTIVE, FAILOVER }

class Router(private val mode: DeploymentMode = DeploymentMode.SANDBOX) {
    fun select(routes: List<RouteSnapshot>): RouteSnapshot {
        require(routes.isNotEmpty()) { "at least one route is required" }
        return when (mode) {
            DeploymentMode.SANDBOX, DeploymentMode.FAILOVER -> routes.first()
            DeploymentMode.ACTIVE_ACTIVE -> routes.minBy { it.participantEndpoint.hashCode() }
        }
    }
}
