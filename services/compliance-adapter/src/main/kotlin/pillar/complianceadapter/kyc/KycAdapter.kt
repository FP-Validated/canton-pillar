package pillar.complianceadapter.kyc
interface KycAdapter { fun check(subjectId: String): KycResult }
data class KycResult(val status: String, val provider: String)
class MockKycAdapter: KycAdapter { override fun check(subjectId: String)=KycResult(if(subjectId.isBlank()) "requires_action" else "verified", "mock") }
fun kycAdapter(provider: String): KycAdapter = MockKycAdapter()
