package pillar.reconciler.alerts
import org.junit.jupiter.api.Test
import kotlin.test.*
class AlertEmitterTest { @Test fun `metrics names match invariants`(){ val n=AlertEmitter().names; assertTrue(n.contains("pillar_balance_reconciliation_mismatch_total")); assertTrue(n.contains("pillar_projection_offset_gap_total")) } }
