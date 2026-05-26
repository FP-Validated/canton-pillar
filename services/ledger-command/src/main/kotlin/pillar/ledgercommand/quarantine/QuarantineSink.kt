package pillar.ledgercommand.quarantine

import pillar.ledgercommand.queue.CommandRequest

class QuarantineSink {
    val quarantined = mutableListOf<Pair<CommandRequest, String>>()
    fun quarantine(request: CommandRequest, reason: String) { quarantined += request to reason }
}
