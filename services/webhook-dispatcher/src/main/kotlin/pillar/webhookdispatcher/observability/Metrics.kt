package pillar.webhookdispatcher.observability
object Metrics { const val FIRST_ATTEMPT_LATENCY="pillar_webhook_first_attempt_latency_ms"; const val SUCCESS_TOTAL="pillar_webhook_delivery_success_total"; const val RETRY_DEPTH="pillar_webhook_retry_depth_total"; const val DLQ_TOTAL="pillar_webhook_dlq_total"; const val BACKLOG="pillar_webhook_backlog" }
