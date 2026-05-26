package pillar.ledgercommand.command

import com.fasterxml.jackson.databind.ObjectMapper
import pillar.ledgertypes.LedgerCommand

interface CommandBuilder {
    fun build(commandType: String, payloadJson: String, profile: PackageProfile): LedgerCommand
}

data class PackageProfile(val templateId: String, val choice: String, val semanticVersion: String)

class JsonCommandBuilder(private val mapper: ObjectMapper = ObjectMapper()) : CommandBuilder {
    override fun build(commandType: String, payloadJson: String, profile: PackageProfile): LedgerCommand {
        val payload = mapper.readValue(payloadJson, Map::class.java).mapKeys { it.key.toString() }
        return LedgerCommand.of(commandType, profile.templateId, profile.choice, payload)
    }
}

class IssueCommandBuilder : TypedCommandBuilder("issue")
class TransferCommandBuilder : TypedCommandBuilder("transfer")
class HoldCommandBuilder : TypedCommandBuilder("hold")
class HoldReleaseCommandBuilder : TypedCommandBuilder("hold_release")
class RedeemCommandBuilder : TypedCommandBuilder("redeem")

open class TypedCommandBuilder(private val expectedType: String, private val delegate: CommandBuilder = JsonCommandBuilder()) {
    fun build(payloadJson: String, profile: PackageProfile): LedgerCommand = delegate.build(expectedType, payloadJson, profile)
}
