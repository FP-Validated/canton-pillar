package pillar.webhookdispatcher.queue
class DeliveryClaimer { fun claim(max:Int)= (1..max).map { "delivery_$it" } }
