# syntax=docker/dockerfile:1.7
# Pillar DPM sandbox image. LOCAL DEVELOPMENT ONLY. Not for production deployment.

ARG JRE_TAG=21-jre-jammy
ARG DAML_SDK_VERSION=3.4.11

FROM eclipse-temurin:${JRE_TAG} AS dpm
ARG DAML_SDK_VERSION
ENV DAML_SDK_VERSION=${DAML_SDK_VERSION} \
    DEBIAN_FRONTEND=noninteractive \
    PATH=/opt/daml/bin:$PATH

RUN apt-get update \
    && apt-get install --no-install-recommends -y curl ca-certificates xz-utils tar bash \
    && rm -rf /var/lib/apt/lists/*

# DPM install: Phase 0 placeholder. Real installation script lands in tools/scripts/ci/install-dpm.sh.
# The local sandbox image expects DPM available at /opt/daml/bin/dpm at runtime. Until install-dpm.sh
# exists, the image entrypoint prints a clear message and exits non-zero so misconfiguration is loud.
WORKDIR /workspace
CMD ["bash", "-lc", "if command -v dpm >/dev/null; then dpm sandbox --port 6865 --json-api-port 7575 --dar ${DAR_PATH:-/workspace/pillar.dar}; else echo 'dpm not installed in image; mount a DPM-bearing volume or extend this Dockerfile in P0.A22 follow-up'; exit 1; fi"]
