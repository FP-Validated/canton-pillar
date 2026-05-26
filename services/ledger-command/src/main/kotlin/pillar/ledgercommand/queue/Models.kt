package pillar.ledgercommand.queue

import java.time.Instant

enum class CommandStatus { PENDING, CLAIMED, SUBMITTED, COMPLETED, FAILED, UNKNOWN, QUARANTINED }

data class CommandRequest(
    val id: String,
    val tenantId: String,
    val operationId: String,
    val commandType: String,
    val commandSemanticVersion: String,
    val payloadJson: String,
    val priority: Int = 0,
    val participantId: String = "default",
    val status: CommandStatus = CommandStatus.PENDING,
    val availableAt: Instant = Instant.EPOCH,
)

data class ClaimedCommandRequest(
    val request: CommandRequest,
    val leaseToken: String,
    val leasedUntil: Instant,
)
