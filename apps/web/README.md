# Canton Pillar web prototype

Run the prototype from the repository root:

```bash
pnpm --filter @pillar/web dev
```

The app is a static Next.js 14 App Router prototype for the Canton Pillar landing page, dashboard, API reference, and documentation shell.

Mocked data includes intent activity, KPI totals, webhook deliveries, and an operation trace. The mock objects use Pillar API IDs only and intentionally avoid Canton internals.

Not implemented: authentication, API calls, persistence, webhook delivery, account management, and production deployment wiring.
