package pillar.complianceadapter
import kotlin.test.*
import pillar.complianceadapter.kyc.*
import pillar.complianceadapter.sanctions.*
import pillar.complianceadapter.risk.*
import pillar.complianceadapter.decisions.*
class ComplianceAdapterTest { @Test fun deterministicDecision(){ assertEquals("verified", MockKycAdapter().check("subj").status); val list=SanctionsIngestor().ingest("mock","ofac","v1",setOf("bad")); assertTrue(SanctionsIngestor().match(list,"Bad Actor")); val a=RiskScorer().score(mapOf("x" to "y"),1); val b=RiskScorer().score(mapOf("x" to "y"),1); assertEquals(a,b); assertTrue(DecisionPersistence().persist("1","approved").ledgerWorkflowEnqueued) } }
