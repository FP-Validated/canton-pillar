package pillar.complianceadapter.sanctions
data class SanctionsListVersion(val provider:String,val name:String,val version:String,val contentHash:String,val entries:Set<String>)
class SanctionsIngestor { fun ingest(provider:String,name:String,version:String,entries:Set<String>)=SanctionsListVersion(provider,name,version,entries.sorted().joinToString("|").hashCode().toString(),entries); fun match(list:SanctionsListVersion, name:String)=list.entries.any{ it.equals(name,true) || name.contains(it,true) } }
