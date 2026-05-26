package pillar.templateregistry.compatibility
import org.junit.jupiter.api.Test; import org.junit.jupiter.api.Assertions.*
class CompatibilityMatrixTest { @Test fun missingBlocksCutover(){ assertFalse(CompatibilityMatrix(listOf(CompatibilityRecord("p","a","dev",CompatibilityStatus.compatible))).cutoverAllowed("p", listOf("a","b"), "dev")) } }
