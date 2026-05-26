package pillar.projectionworker.observability

import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Tags
import java.util.concurrent.atomic.AtomicLong
class LagMetric(registry: MeterRegistry, projectorName:String, streamId:String, participantId:String, environment:String, tenantId:String, synchronizerId:String){ val lag=AtomicLong(0); init { registry.gauge("pillar_projection_lag_seconds", Tags.of("projector_name",projectorName,"stream_id",streamId,"participant_id",participantId,"environment",environment,"tenant_id",tenantId,"synchronizer_id",synchronizerId), lag) } fun set(seconds:Long){ lag.set(seconds) } }
