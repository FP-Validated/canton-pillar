package pillar.webhookdispatcher.retry
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
class RetryPolicyTest { @Test fun caps(){ assertEquals(300, RetryPolicy().delay(99)) } }
