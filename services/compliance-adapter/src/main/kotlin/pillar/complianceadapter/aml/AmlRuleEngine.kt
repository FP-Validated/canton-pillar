package pillar.complianceadapter.aml
data class AmlRulePack(val tenantId:String,val version:String,val hash:String,val blocked:Set<String>)
data class AmlDecision(val matchedRules:List<String>,val explain:String)
class AmlRuleEngine(private val pack:AmlRulePack){ fun evaluate(facts:Map<String,String>):AmlDecision { val matches=pack.blocked.filter{ facts.values.any { v -> v.contains(it, true) } }; return AmlDecision(matches, "pack=${pack.version};hash=${pack.hash};matches=${matches.joinToString()}") } }
