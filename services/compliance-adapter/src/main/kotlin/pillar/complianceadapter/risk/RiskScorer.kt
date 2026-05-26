package pillar.complianceadapter.risk
data class RiskScore(val score:Int,val band:String,val reasonCodes:List<String>,val inputFactsHash:String)
class RiskScorer { fun score(facts:Map<String,String>, matches:Int):RiskScore { val raw=(facts.toSortedMap().toString().hashCode() and 0x7fffffff)%50 + matches*25; val band=if(raw>=75) "high" else if(raw>=40) "medium" else "low"; return RiskScore(raw,band,listOf("MATCHES_$matches"),facts.toSortedMap().toString().hashCode().toString()) } }
