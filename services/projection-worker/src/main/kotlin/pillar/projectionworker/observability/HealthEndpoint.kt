package pillar.projectionworker.observability

class HealthEndpoint { fun health()=mapOf("status" to "ok"); fun readiness(ready:Boolean)=mapOf("ready" to ready.toString()) }
