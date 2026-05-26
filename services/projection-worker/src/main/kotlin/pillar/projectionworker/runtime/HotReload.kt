package pillar.projectionworker.runtime

class HotReload { fun restart(lastOffset:Long, drain:()->Long):Long { val drained=drain(); return maxOf(lastOffset, drained) } }
