package pillar.templateregistry.replay
data class RegistryEvent(val action:String,val packageVersionId:String)
class RegistryReplayer { fun active(events:List<RegistryEvent>):Set<String> { val s=linkedSetOf<String>(); events.forEach { when(it.action){"publish","cutover"->s.add(it.packageVersionId); "retire","revoke"->s.remove(it.packageVersionId)} }; return s } }
