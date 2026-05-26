package pillar.projectionworker.ledger

data class Checkpoint(var appliedOffset:Long=0, var fencingToken:Long=0, var lastRecordTime:Long=0)
class CheckpointRepository { private val checkpoints=mutableMapOf<String,Checkpoint>(); @Synchronized fun acquire(projector:String)=checkpoints.getOrPut(projector){Checkpoint()}.let{ it.fencingToken += 1; it.fencingToken }; @Synchronized fun advanceInTransaction(projector:String, token:Long, offset:Long, recordTime:Long, write:()->Unit){ val c=checkpoints.getOrPut(projector){Checkpoint()}; require(c.fencingToken==token){"stale fencing token"}; write(); c.appliedOffset=maxOf(c.appliedOffset, offset); c.lastRecordTime=recordTime } fun get(projector:String)=checkpoints[projector]?.copy() ?: Checkpoint() }
