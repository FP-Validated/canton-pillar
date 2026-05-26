# syntax=docker/dockerfile:1.7
# Pillar migrator stub image. Replaced in Phase 3.

ARG NODE_VERSION=20.18.0

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
USER node
CMD ["node", "-e", "console.log('migrator stub — no migrations in P0. See docs/Dev/Phase_03_DB_Idempotency.md.');"]
