# syntax=docker/dockerfile:1.7
# Pillar Node base image. Pinned via local://pillar-p0-impl-shared.md.

ARG NODE_VERSION=20.18.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/usr/local/share/pnpm \
    PATH=/usr/local/share/pnpm:$PATH \
    CI=true \
    NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app

FROM base AS builder
ENV NODE_ENV=development
# Consumers override CMD with their own builder steps.
CMD ["bash", "-c", "echo 'base-node:builder — override CMD for service-specific build'"]

FROM base AS runtime
USER node
CMD ["node", "--version"]
