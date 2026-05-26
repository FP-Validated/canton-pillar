package pillar.webhookdispatcher.rendering
class PayloadRenderer { fun render(id:String,type:String,mode:String)=mapOf("id" to id,"object" to "event","type" to type,"mode" to mode) }
