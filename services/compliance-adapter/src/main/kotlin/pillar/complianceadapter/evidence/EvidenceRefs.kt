package pillar.complianceadapter.evidence
data class EvidenceRef(val id:String,val exists:Boolean,val hashOk:Boolean,val scanState:String,val retained:Boolean)
class EvidenceRefs { fun verify(ref:EvidenceRef):Boolean = ref.exists && ref.hashOk && ref.scanState == "clean" && ref.retained }
