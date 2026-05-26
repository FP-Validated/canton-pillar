package pillar.workfloworchestrator.runtime
import kotlinx.coroutines.*
class Scheduler(private val scope:CoroutineScope = CoroutineScope(Dispatchers.Default)) { fun start(block:suspend()->Unit)=scope.launch{block()}; fun shutdown(){scope.cancel()} }
