package pillar.workfloworchestrator.tasks
class HoldExpirer { fun enqueue(holdId:String)=mapOf("command_type" to "hold_expire", "hold_id" to holdId) }
