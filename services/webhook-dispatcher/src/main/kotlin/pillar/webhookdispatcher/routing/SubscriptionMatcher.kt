package pillar.webhookdispatcher.routing
class SubscriptionMatcher(private val known:Set<String>) { fun matches(patterns:List<String>, type:String):Boolean { require(type in known) { "unknown event type" }; return patterns.any { it=="*" || it==type || (it.endsWith(".*") && type.startsWith(it.removeSuffix("*"))) } } fun expand(patterns:List<String>)=known.filter{t->matches(patterns,t)}.sorted() }
