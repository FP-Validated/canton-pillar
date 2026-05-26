FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /repo
COPY . .
RUN ./gradlew :services:webhook-dispatcher:installDist --no-daemon
FROM eclipse-temurin:21-jre-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/FP-Validated/canton-pillar" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.licenses="MIT" \
      pillar.canton.service="webhook-dispatcher" \
      pillar.canton.sbom="true"
RUN addgroup -S pillar && adduser -S -G pillar pillar
WORKDIR /app
COPY --from=build /repo/services/webhook-dispatcher/build/install/webhook-dispatcher ./
USER pillar
EXPOSE 8080
ENTRYPOINT ["/app/bin/webhook-dispatcher"]
