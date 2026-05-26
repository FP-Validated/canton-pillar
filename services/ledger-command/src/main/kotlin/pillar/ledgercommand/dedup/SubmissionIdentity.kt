package pillar.ledgercommand.dedup

import java.util.UUID

object SubmissionIdentity {
    fun newId(): String = "sub_${UUID.randomUUID()}"
}
