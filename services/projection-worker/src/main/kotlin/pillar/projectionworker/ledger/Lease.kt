package pillar.projectionworker.ledger

data class Lease(val projector:String,val fencingToken:Long)
class LeaseManager(private val repo:CheckpointRepository){ fun acquire(projector:String)=Lease(projector, repo.acquire(projector)); fun renew(lease:Lease)=lease; fun takeover(projector:String)=acquire(projector) }
