package pillar.templateregistry.observability
import io.micrometer.core.instrument.MeterRegistry
import java.util.concurrent.atomic.AtomicLong
class Metrics(registry:MeterRegistry) { val staleSeconds=AtomicLong(0); init { registry.gauge("pillar_registry_stale_seconds", staleSeconds); registry.counter("pillar_registry_package_mismatch_total"); registry.counter("pillar_registry_signature_failure_total"); registry.counter("pillar_registry_side_channel_total") } }
