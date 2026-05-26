package pillar.webhookdispatcher.replay
class ReplayEnqueuer { fun replay(eventId:String)=Pair(eventId,"wd_"+eventId.removePrefix("evt_")) }
