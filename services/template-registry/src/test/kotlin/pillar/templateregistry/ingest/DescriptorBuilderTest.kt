package pillar.templateregistry.ingest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
class DescriptorBuilderTest { @Test fun builds() { assertEquals("issue", DescriptorBuilder().build(DarManifest("p","1", listOf("asset:issue:Create"))).first().operationType) } }
