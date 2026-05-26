plugins {
    id("org.jetbrains.kotlin.jvm")
    application
}

kotlin {
    jvmToolchain(21)
}

application {
    mainClass.set("pillar.ledgercommand.MainKt")
}

dependencies {
    implementation(project(":packages:ledger-types"))
    implementation(libs.kotlin.stdlib)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.slf4j.api)
    implementation(libs.logback.classic)
    implementation(libs.hikari)
    implementation(libs.postgres)
    implementation(libs.grpc.stub)
    implementation(libs.grpc.protobuf)
    implementation(libs.grpc.netty.shaded)
    implementation(libs.protobuf.java)
    implementation(libs.jackson.databind)
    implementation(libs.bouncycastle)

    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
}

tasks.test { useJUnitPlatform() }
