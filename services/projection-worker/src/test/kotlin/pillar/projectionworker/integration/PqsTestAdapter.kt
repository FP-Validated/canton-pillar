package pillar.projectionworker.integration
import pillar.projectionworker.pqs.*
class PqsTestAdapter(rows:List<PqsRow>): PqsClient by InMemoryPqsClient(rows)
