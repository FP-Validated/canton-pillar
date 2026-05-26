package pillar.webhookdispatcher.retry
class RetryPolicy(private val table:List<Long> = listOf(1,5,30,300)) { fun delay(attempt:Int)=table.getOrElse(attempt-1){table.last()} }
