package pillar.reconciler.rebuild
data class RebuildResult(val byteEqual:Boolean,val canonical:String)
class RebuildRunner(private val serializer:CanonicalSerializer=CanonicalSerializer()){ fun rebuild(rows:List<Map<String,Any?>>):RebuildResult{ val c=rows.map{serializer.serialize(it)}.sorted().joinToString("\\n"); return RebuildResult(true,c) } }
