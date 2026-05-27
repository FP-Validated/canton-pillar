# Local observability

Start the local observability plane with:

```bash
docker compose -f infra/compose/local.yml up -d prometheus grafana otel-collector
```

URLs:

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (`admin` / `admin`; anonymous Viewer is enabled)
- OTEL collector OTLP: `localhost:4317` (gRPC), `localhost:4318` (HTTP)
- OTEL collector Prometheus exporter: `localhost:8889`

Grafana provisions the Prometheus datasource with uid `pillar-prometheus` and loads dashboards from `/var/lib/grafana/dashboards`.

Prometheus labels local service scrape targets with `network=devnet`. File service discovery registers the supported Pillar networks (`devnet`, `testnet`, `mainnet`) and validator providers with `network`, `provider_id`, and `validator_id` labels. OTEL-emitted metrics include `pillar.network` via `OTEL_RESOURCE_ATTRIBUTES`; the collector converts resource attributes into Prometheus labels.

Validator readiness follows the tiers in `docs/Dev/REMEDIATION.md#validator-readiness-gate`.
