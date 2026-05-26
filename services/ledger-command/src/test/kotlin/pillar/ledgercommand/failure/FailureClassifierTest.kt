package pillar.ledgercommand.failure

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class FailureClassifierTest {
    @Test fun `classifies participant and command failures`() {
        val c = FailureClassifier()
        assertEquals(FailureDisposition.RETRYABLE, c.classify(LedgerCommandError.ParticipantUnavailable()))
        assertEquals(FailureDisposition.UNKNOWN, c.classify(LedgerCommandError.CommandOutcomeUnknown()))
        assertEquals(FailureDisposition.FINAL, c.classify(LedgerCommandError.DamlInterpretationFailed()))
        assertEquals(FailureDisposition.FINAL, c.classify(LedgerCommandError.PartyAuthorizationFailed()))
        assertEquals(FailureDisposition.FINAL, c.classify(LedgerCommandError.PackageProfileMismatch()))
        assertEquals(FailureDisposition.FINAL, c.classify(LedgerCommandError.DuplicateCommand()))
    }
}
