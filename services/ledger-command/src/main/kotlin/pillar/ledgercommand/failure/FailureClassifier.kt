package pillar.ledgercommand.failure

class FailureClassifier {
    fun classify(error: LedgerCommandError): FailureDisposition = when (error) {
        is LedgerCommandError.ParticipantUnavailable -> FailureDisposition.RETRYABLE
        is LedgerCommandError.CommandOutcomeUnknown -> FailureDisposition.UNKNOWN
        is LedgerCommandError.DamlInterpretationFailed -> FailureDisposition.FINAL
        is LedgerCommandError.PartyAuthorizationFailed -> FailureDisposition.FINAL
        is LedgerCommandError.PackageProfileMismatch -> FailureDisposition.FINAL
        is LedgerCommandError.DuplicateCommand -> FailureDisposition.FINAL
    }
}
