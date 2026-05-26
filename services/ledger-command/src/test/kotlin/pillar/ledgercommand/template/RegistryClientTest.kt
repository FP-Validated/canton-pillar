package pillar.ledgercommand.template
import org.junit.jupiter.api.Test; import org.junit.jupiter.api.Assertions.*; import pillar.ledgercommand.template.registry_client.*
class RegistryClientTest { @Test fun circuitBreakerThrows(){ val c=RegistryClient("http://127.0.0.1:1"); repeat(3){ assertThrows(PackageProfileUnavailable::class.java){ c.activeBinding("k") } }; assertThrows(PackageProfileUnavailable::class.java){ c.activeBinding("k") } } }
