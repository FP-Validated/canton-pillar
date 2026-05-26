package pillar.projectionworker.pqs
import org.junit.jupiter.api.Test
import kotlin.test.*
class PqsSchemaProbeTest { @Test fun `unsupported schema rejected`(){ assertFails{ PqsSchemaProbe().probe(PqsSchema(99,"h")) } } }
