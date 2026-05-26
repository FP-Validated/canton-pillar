# syntax=docker/dockerfile:1.7
# Pillar webhook-receiver local harness. NOT production webhook-dispatcher.

ARG NODE_VERSION=20.18.0

FROM node:${NODE_VERSION}-bookworm-slim AS builder
ENV PNPM_HOME=/usr/local/share/pnpm \
    PATH=/usr/local/share/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json /app/
COPY apps/webhook-receiver/package.json /app/apps/webhook-receiver/
COPY apps/webhook-receiver/tsconfig.json /app/apps/webhook-receiver/
COPY apps/webhook-receiver/src /app/apps/webhook-receiver/src
RUN pnpm install --filter @pillar/webhook-receiver... --frozen-lockfile=false
RUN pnpm --filter @pillar/webhook-receiver build

FROM node:${NODE_VERSION}-bookworm-slim AS local
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --system --uid 10003 --no-create-home pillar-webhook
COPY --from=builder /app/apps/webhook-receiver/dist ./dist
COPY --from=builder /app/apps/webhook-receiver/package.json ./package.json
COPY --from=builder /app/apps/webhook-receiver/node_modules ./node_modules
USER 10003
EXPOSE 9090
CMD ["node", "dist/index.js"]
