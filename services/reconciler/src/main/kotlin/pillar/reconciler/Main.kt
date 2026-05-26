package pillar.reconciler
import pillar.reconciler.scheduler.RebuildScheduler
fun main(){ RebuildScheduler(mapOf("balances" to 60)).due("balances",61) }
