FROM node:20-alpine AS build
WORKDIR /repo
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm --filter @pillar/api build
FROM node:20-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/FP-Validated/canton-pillar" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.licenses="MIT" \
      pillar.canton.service="api" \
      pillar.canton.sbom="true"
ENV NODE_ENV=production
RUN addgroup -S pillar && adduser -S -G pillar pillar
WORKDIR /app
COPY --from=build /repo/apps/api/dist ./dist
USER pillar
EXPOSE 3000
CMD ["node", "dist/index.js"]
