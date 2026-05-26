package pillar.ledgercommand.ledger

class HealthGate(private val checks: List<() -> Boolean>) {
    fun ready(): Boolean = checks.all { it() }
}
