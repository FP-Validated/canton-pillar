package pillar.webhookdispatcher.dispatch
class HttpDispatcher { fun shouldRejectRedirect(livemode:Boolean, location:String)=livemode && location.startsWith("http://") }
