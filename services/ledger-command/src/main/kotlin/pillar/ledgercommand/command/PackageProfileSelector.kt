package pillar.ledgercommand.command

class PackageProfileSelector(private val profiles: Map<String, PackageProfile> = defaultProfiles()) {
    fun select(commandType: String, assetType: String? = null): PackageProfile =
        profiles[assetType?.let { "$commandType:$it" }] ?: profiles[commandType] ?: error("no package profile for $commandType")

    companion object {
        fun defaultProfiles(): Map<String, PackageProfile> = mapOf(
            "issue" to PackageProfile("Pillar.Intents:IssueIntent", "Create", "v1"),
            "transfer" to PackageProfile("Pillar.Intents:TransferIntent", "ExerciseTransfer", "v1"),
            "hold" to PackageProfile("Pillar.Intents:HoldIntent", "CreateHold", "v1"),
            "hold_release" to PackageProfile("Pillar.Intents:HoldIntent", "ReleaseHold", "v1"),
            "redeem" to PackageProfile("Pillar.Intents:RedeemIntent", "ExerciseRedeem", "v1"),
        )
    }
}
