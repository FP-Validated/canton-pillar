FROM node:20-alpine AS build
WORKDIR /repo
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm --filter @pillar/migrator build
FROM node:20-alpine
LABEL org.opencontainers.image.source="https://github.com/FP-Validated/canton-pillar" org.opencontainers.image.revision="$VCS_REF" org.opencontainers.image.version="$VERSION" org.opencontainers.image.licenses="MIT" pillar.canton.service="migrator" pillar.canton.sbom="true"
RUN addgroup -S pillar && adduser -S -G pillar pillar
WORKDIR /app
COPY --from=build /repo/tools/migrator ./tools/migrator
USER pillar
CMD ["node", "tools/migrator/dist/cli.js", "verify"]
