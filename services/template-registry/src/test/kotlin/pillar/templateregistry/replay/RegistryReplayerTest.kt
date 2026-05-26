package pillar.templateregistry.replay
import org.junit.jupiter.api.Test; import org.junit.jupiter.api.Assertions.*
class RegistryReplayerTest { @Test fun reconstructs(){ assertEquals(setOf("b"), RegistryReplayer().active(listOf(RegistryEvent("publish","a"),RegistryEvent("retire","a"),RegistryEvent("cutover","b")))) } }
