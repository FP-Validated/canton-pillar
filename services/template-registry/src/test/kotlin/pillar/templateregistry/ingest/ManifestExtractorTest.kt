package pillar.templateregistry.ingest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import java.io.*; import java.util.jar.*
class ManifestExtractorTest { @Test fun extracts() { val out=ByteArrayOutputStream(); val mf=Manifest(); mf.mainAttributes[Attributes.Name.MANIFEST_VERSION]="1.0"; mf.mainAttributes.putValue("Package-Id","pkg"); mf.mainAttributes.putValue("Package-Version","1"); JarOutputStream(out,mf).close(); assertEquals("pkg", ManifestExtractor().extract(out.toByteArray()).packageId) } }
