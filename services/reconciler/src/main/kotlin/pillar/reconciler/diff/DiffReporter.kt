package pillar.reconciler.diff
data class Diff(val key:String,val severity:String)
data class DiffReport(val total:Int,val examples:List<Diff>)
class DiffReporter { fun report(diffs:List<Diff>, full:Boolean=false, sampleSize:Int=2)=DiffReport(diffs.size, if(full) diffs else diffs.take(sampleSize)) }
