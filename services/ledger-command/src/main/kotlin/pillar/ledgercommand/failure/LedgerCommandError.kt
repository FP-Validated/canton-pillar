package pillar.ledgercommand.failure

sealed class LedgerCommandError(message: String) : RuntimeException(message) {
    class ParticipantUnavailable : LedgerCommandError("participant_unavailable")
    class CommandOutcomeUnknown : LedgerCommandError("command_outcome_unknown")
    class DamlInterpretationFailed : LedgerCommandError("daml_interpretation_failed")
    class PartyAuthorizationFailed : LedgerCommandError("party_authorization_failed")
    class PackageProfileMismatch : LedgerCommandError("package_profile_mismatch")
    class DuplicateCommand : LedgerCommandError("duplicate_command")
}

enum class FailureDisposition { RETRYABLE, FINAL, UNKNOWN }
