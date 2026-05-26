package pillar.webhookdispatcher.diagnostics
class FirewallProbe { fun classify(url:String)= if(url.startsWith("http://")) "tls" else "http" }
