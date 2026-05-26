package pillar.webhookdispatcher.routing
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
class SubscriptionMatcherTest { @Test fun wildcard(){ assertTrue(SubscriptionMatcher(setOf("transfer_intent.succeeded")).matches(listOf("transfer_intent.*"),"transfer_intent.succeeded")) } }
