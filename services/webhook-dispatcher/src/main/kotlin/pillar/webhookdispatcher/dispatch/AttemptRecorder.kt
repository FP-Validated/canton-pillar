package pillar.webhookdispatcher.dispatch
class AttemptRecorder { val attempts=mutableListOf<String>(); fun record(id:String, bodySha256:String){ attempts += "$id:$bodySha256" } }
