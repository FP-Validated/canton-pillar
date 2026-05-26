package pillar.ledgercommand.template
import org.junit.jupiter.api.Test; import org.junit.jupiter.api.Assertions.*; import pillar.ledgercommand.template.registry_client.*; import java.time.Instant
class FailClosedGuardTest { @Test fun missingNoSubmission(){ assertThrows(PackageProfileUnavailable::class.java){ FailClosedGuard().requireUsable(RegistryBinding("pv","pkg","tmpl","choice",1,"retired",Instant.now().plusSeconds(60))) } } }
