package pillar.templateregistry.compatibility
enum class CompatibilityStatus{missing,uploaded,vetted,compatible,stale,incompatible,side_channel_detected}
data class CompatibilityRecord(val packageVersionId:String,val participantId:String,val environment:String,val status:CompatibilityStatus)
class CompatibilityMatrix(private val records:List<CompatibilityRecord>) { fun status(packageVersionId:String, participantId:String, environment:String)=records.find{it.packageVersionId==packageVersionId&&it.participantId==participantId&&it.environment==environment}?.status ?: CompatibilityStatus.missing; fun cutoverAllowed(packageVersionId:String, participants:List<String>, environment:String)=participants.all{status(packageVersionId,it,environment)==CompatibilityStatus.compatible} }
