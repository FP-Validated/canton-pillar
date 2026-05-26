# syntax=docker/dockerfile:1.7
# Pillar JVM base image. Pinned to JDK 21 Temurin.

ARG JDK_TAG=21-jdk-jammy
ARG JRE_TAG=21-jre-jammy

FROM eclipse-temurin:${JDK_TAG} AS builder
ENV GRADLE_USER_HOME=/var/cache/gradle \
    JAVA_TOOL_OPTIONS="-Dfile.encoding=UTF-8 -Duser.timezone=UTC"
WORKDIR /workspace
CMD ["bash", "-c", "echo 'base-jvm:builder — override CMD for service-specific build'"]

FROM eclipse-temurin:${JRE_TAG} AS runtime
ENV JAVA_TOOL_OPTIONS="-Dfile.encoding=UTF-8 -Duser.timezone=UTC"
RUN useradd --system --uid 10001 --no-create-home pillar
USER 10001
WORKDIR /app
CMD ["java", "-version"]
