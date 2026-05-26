FROM eclipse-temurin:21-jre-alpine
LABEL org.opencontainers.image.source="https://github.com/FP-Validated/canton-pillar" org.opencontainers.image.revision="$VCS_REF" org.opencontainers.image.version="$VERSION" org.opencontainers.image.licenses="MIT" pillar.canton.service="dar-uploader" pillar.canton.sbom="true"
RUN addgroup -S pillar && adduser -S -G pillar pillar && apk add --no-cache curl bash
WORKDIR /workspace
COPY daml ./daml
USER pillar
ENTRYPOINT ["sh", "-lc", "dpm upload-dar --dar ${DAR_PATH:-daml/.daml/dist/pillar.dar}"]
