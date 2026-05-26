package pillar.projectionworker.projectors.hold

data class HoldEvent(val holdId:String,val status:String,val offset:Long)
class HoldProjector { private val seen=mutableSetOf<String>(); val timeline=mutableListOf<HoldEvent>(); var reserved:Long=0; fun apply(updateId:String,event:HoldEvent,deltaReserved:Long){ if(seen.add(updateId)){ timeline.add(event); reserved+=deltaReserved } } }
