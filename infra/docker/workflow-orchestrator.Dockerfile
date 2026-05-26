# syntax=docker/dockerfile:1.7
# Pillar workflow-orchestrator stub image. Real service lands in P6.H07.

ARG JRE_TAG=21-jre-jammy

FROM eclipse-temurin:${JRE_TAG} AS runtime
WORKDIR /app
RUN useradd --system --uid 10002 --no-create-home pillar-orch
USER 10002
CMD ["bash", "-c", "echo 'workflow-orchestrator stub — P0 placeholder. See docs/Dev/Phase_06_Webhook_Event_System.md P6.H07.'; sleep infinity"]
