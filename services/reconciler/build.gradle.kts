plugins {
    id("org.jetbrains.kotlin.jvm")
    application
}
kotlin { jvmToolchain(21) }
application { mainClass.set("pillar.reconciler.MainKt") }
dependencies {
    implementation(libs.kotlin.stdlib)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.slf4j.api)
    implementation(libs.logback.classic)
    implementation(libs.hikari)
    implementation(libs.postgres)
    implementation(libs.jackson.databind)
    implementation(libs.micrometer.core)
    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testImplementation(kotlin("test"))
}
tasks.test { useJUnitPlatform() }
