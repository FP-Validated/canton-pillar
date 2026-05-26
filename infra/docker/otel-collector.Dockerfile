# syntax=docker/dockerfile:1.7
# Pillar local OpenTelemetry collector image. Pinned to upstream 0.116.0.

ARG OTEL_VERSION=0.116.0

FROM otel/opentelemetry-collector-contrib:${OTEL_VERSION} AS local
COPY infra/observability/otel-collector.yaml /etc/otelcol-contrib/config.yaml
CMD ["--config=/etc/otelcol-contrib/config.yaml"]
