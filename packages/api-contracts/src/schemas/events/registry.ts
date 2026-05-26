import { z } from 'zod';

export const EVENT_TYPE_REGISTRY = [
  {
    "type": "account.created",
    "family": "account",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Account`"
  },
  {
    "type": "account.updated",
    "family": "account",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Account`"
  },
  {
    "type": "asset.created",
    "family": "asset",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Asset`"
  },
  {
    "type": "asset.updated",
    "family": "asset",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Asset`"
  },
  {
    "type": "asset.suspended",
    "family": "asset",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Asset`"
  },
  {
    "type": "issue_intent.requires_action",
    "family": "issue_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`IssueIntent`"
  },
  {
    "type": "issue_intent.processing",
    "family": "issue_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`IssueIntent`"
  },
  {
    "type": "issue_intent.succeeded",
    "family": "issue_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`IssueIntent`"
  },
  {
    "type": "issue_intent.failed",
    "family": "issue_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`IssueIntent`"
  },
  {
    "type": "issue_intent.canceled",
    "family": "issue_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`IssueIntent`"
  },
  {
    "type": "redeem_intent.requires_action",
    "family": "redeem_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`RedeemIntent`"
  },
  {
    "type": "redeem_intent.processing",
    "family": "redeem_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`RedeemIntent`"
  },
  {
    "type": "redeem_intent.succeeded",
    "family": "redeem_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`RedeemIntent`"
  },
  {
    "type": "redeem_intent.failed",
    "family": "redeem_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`RedeemIntent`"
  },
  {
    "type": "redeem_intent.canceled",
    "family": "redeem_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`RedeemIntent`"
  },
  {
    "type": "transfer_intent.requires_action",
    "family": "transfer_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`TransferIntent`"
  },
  {
    "type": "transfer_intent.processing",
    "family": "transfer_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`TransferIntent`"
  },
  {
    "type": "transfer_intent.succeeded",
    "family": "transfer_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`TransferIntent`"
  },
  {
    "type": "transfer_intent.failed",
    "family": "transfer_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`TransferIntent`"
  },
  {
    "type": "transfer_intent.canceled",
    "family": "transfer_intent",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`TransferIntent`"
  },
  {
    "type": "hold.created",
    "family": "hold",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Hold`"
  },
  {
    "type": "hold.released",
    "family": "hold",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Hold`"
  },
  {
    "type": "hold.consumed",
    "family": "hold",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Hold`"
  },
  {
    "type": "hold.expired",
    "family": "hold",
    "owner": "P6.H07",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Hold`"
  },
  {
    "type": "webhook_endpoint.created",
    "family": "webhook_endpoint",
    "owner": "P6.H01",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`WebhookEndpoint`"
  },
  {
    "type": "webhook_endpoint.secret_rotated",
    "family": "webhook_endpoint",
    "owner": "P6.H01",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`WebhookEndpoint`"
  },
  {
    "type": "webhook_endpoint.disabled",
    "family": "webhook_endpoint",
    "owner": "P6.H01",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`WebhookEndpoint`"
  },
  {
    "type": "api_key.created",
    "family": "api_key",
    "owner": "P8.K01",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`ApiKey`"
  },
  {
    "type": "api_key.revoked",
    "family": "api_key",
    "owner": "P8.K01",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`ApiKey`"
  },
  {
    "type": "api_key.rotated",
    "family": "api_key",
    "owner": "P8.K06",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`ApiKey`"
  },
  {
    "type": "export_job.queued",
    "family": "export_job",
    "owner": "P11.M04",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`ExportJob`"
  },
  {
    "type": "export_job.succeeded",
    "family": "export_job",
    "owner": "P11.M04",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`ExportJob`"
  },
  {
    "type": "export_job.failed",
    "family": "export_job",
    "owner": "P11.M04",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`ExportJob`"
  },
  {
    "type": "file.uploaded",
    "family": "file",
    "owner": "P13.O06",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`File`"
  },
  {
    "type": "file.scanned",
    "family": "file",
    "owner": "P13.O06",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`File`"
  },
  {
    "type": "file.deleted",
    "family": "file",
    "owner": "P13.O06",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`File`"
  },
  {
    "type": "evidence_file.linked",
    "family": "evidence_file",
    "owner": "P8.K05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`EvidenceFile`"
  },
  {
    "type": "evidence_file.verified",
    "family": "evidence_file",
    "owner": "P8.K05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`EvidenceFile`"
  },
  {
    "type": "compliance_decision.approved",
    "family": "compliance_decision",
    "owner": "P8.K04",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`ComplianceDecision`"
  },
  {
    "type": "compliance_decision.rejected",
    "family": "compliance_decision",
    "owner": "P8.K04",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`ComplianceDecision`"
  },
  {
    "type": "compliance_decision.requires_action",
    "family": "compliance_decision",
    "owner": "P8.K04",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`ComplianceDecision`"
  },
  {
    "type": "onboarding.completed",
    "family": "onboarding",
    "owner": "P13.O03",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Onboarding`"
  },
  {
    "type": "onboarding.failed",
    "family": "onboarding",
    "owner": "P13.O03",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Onboarding`"
  },
  {
    "type": "invoice.created",
    "family": "invoice",
    "owner": "P14.Q05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Invoice`"
  },
  {
    "type": "invoice.paid",
    "family": "invoice",
    "owner": "P14.Q05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Invoice`"
  },
  {
    "type": "invoice.uncollectible",
    "family": "invoice",
    "owner": "P14.Q05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Invoice`"
  },
  {
    "type": "usage.threshold_reached",
    "family": "usage",
    "owner": "P14.Q03",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`UsageThreshold`"
  },
  {
    "type": "balance.updated",
    "family": "balance",
    "owner": "P5.G03",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Balance`"
  },
  {
    "type": "holding.created",
    "family": "holding",
    "owner": "P5.G04",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Holding`"
  },
  {
    "type": "holding.updated",
    "family": "holding",
    "owner": "P5.G04",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Holding`"
  },
  {
    "type": "holding.closed",
    "family": "holding",
    "owner": "P5.G04",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Holding`"
  },
  {
    "type": "transfer.created",
    "family": "transfer",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Transfer`"
  },
  {
    "type": "transfer.succeeded",
    "family": "transfer",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Transfer`"
  },
  {
    "type": "transfer.failed",
    "family": "transfer",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Transfer`"
  },
  {
    "type": "transfer.canceled",
    "family": "transfer",
    "owner": "P5.G05",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`Transfer`"
  },
  {
    "type": "request.rate_limit_hit",
    "family": "request",
    "owner": "P8.K02",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`RequestLog`"
  },
  {
    "type": "webhook_delivery.failed",
    "family": "webhook_delivery",
    "owner": "P6.H04",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`WebhookDelivery`"
  },
  {
    "type": "webhook_delivery.succeeded",
    "family": "webhook_delivery",
    "owner": "P6.H03",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`WebhookDelivery`"
  },
  {
    "type": "template_version.activated",
    "family": "template_version",
    "owner": "P11.M01",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`TemplateVersion`"
  },
  {
    "type": "search_index.rebuilt",
    "family": "search_index",
    "owner": "P11.M02",
    "version": "v1",
    "emitter": "pillar",
    "shape": "`SearchIndex`"
  }
] as const;

export const EventTypeName = z.enum(EVENT_TYPE_REGISTRY.map(e => e.type) as [string, ...string[]]);
export type EventTypeName = z.infer<typeof EventTypeName>;
