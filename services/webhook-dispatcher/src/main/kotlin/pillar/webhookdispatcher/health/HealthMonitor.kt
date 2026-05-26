package pillar.webhookdispatcher.health
class HealthMonitor { var lastSuccessAt:String?=null; val failures=mutableMapOf<String,Int>(); fun success(ts:String){lastSuccessAt=ts}; fun fail(k:String){failures[k]=(failures[k]?:0)+1} }
