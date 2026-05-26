package pillar.workfloworchestrator.tasks

import java.time.Instant

data class ScheduledReportTemplate(val id:String, val intervalSeconds:Long, val lastRunAt:Instant?)
data class ScheduledExportEnqueue(val templateId:String, val idempotencyKey:String, val driftSeconds:Long)
class ScheduledExportTask {
  fun due(template:ScheduledReportTemplate, now:Instant):ScheduledExportEnqueue? {
    val last = template.lastRunAt ?: Instant.EPOCH
    val next = last.plusSeconds(template.intervalSeconds)
    if (now.isBefore(next)) return null
    val bucket = now.epochSecond / template.intervalSeconds
    return ScheduledExportEnqueue(template.id, "tmpl_${template.id}:$bucket", now.epochSecond - next.epochSecond)
  }
}
