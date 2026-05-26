package pillar.ledgercommand.template
import org.junit.jupiter.api.Test; import org.junit.jupiter.api.Assertions.*; import pillar.ledgercommand.template.registry_client.*
class ActiveBindingResolverTest { @Test fun requestKeyFailsClosed(){ assertThrows(PackageProfileUnavailable::class.java){ ActiveBindingResolver(RegistryClient("http://127.0.0.1:1")).resolve(BindingRequest("t","e",false,"f","op")) } } }
