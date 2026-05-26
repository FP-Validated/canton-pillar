package pillar.projectionworker.observability
import org.junit.jupiter.api.Test
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import kotlin.test.*
class LagMetricTest { @Test fun `metric name and labels`(){ val r=SimpleMeterRegistry(); LagMetric(r,"p","s","part","test","tenant","sync").set(7); assertEquals(7.0, r.find("pillar_projection_lag_seconds").tag("tenant_id","tenant").gauge()!!.value()) } }
