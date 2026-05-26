package pillar.templateregistry.ingest
import java.util.jar.JarInputStream
data class DarManifest(val packageId:String,val packageVersion:String,val templates:List<String>)
class ManifestExtractor { fun extract(dar:ByteArray):DarManifest { JarInputStream(dar.inputStream()).use { jar -> val mf=jar.manifest?.mainAttributes; return DarManifest(mf?.getValue("Package-Id") ?: "unknown", mf?.getValue("Package-Version") ?: "0.0.0", mf?.getValue("Templates")?.split(',')?.filter{it.isNotBlank()} ?: emptyList()) } } }
