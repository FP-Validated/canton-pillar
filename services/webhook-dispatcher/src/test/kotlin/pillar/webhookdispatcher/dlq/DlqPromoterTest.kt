package pillar.webhookdispatcher.dlq
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
class DlqPromoterTest { @Test fun promotes(){ assertTrue(DlqPromoter().promote(3,3)) } }
