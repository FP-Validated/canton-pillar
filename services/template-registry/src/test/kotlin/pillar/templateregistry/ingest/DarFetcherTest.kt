package pillar.templateregistry.ingest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
class DarFetcherTest { @Test fun checksum() { assertEquals(DarFetcher.sha256("x".toByteArray()), DarFetcher.sha256("x".toByteArray())) } }
