plugins {
    id("org.jetbrains.kotlin.jvm")
    application
}

kotlin { jvmToolchain(21) }

dependencies {
    implementation(libs.kotlin.stdlib)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.slf4j.api)
    implementation(libs.micrometer.core)
    implementation(libs.hikari)
    implementation(libs.postgres)
    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testImplementation(libs.h2)
}

tasks.test { useJUnitPlatform() }

application { mainClass.set("pillar.webhookdispatcher.MainKt") }
