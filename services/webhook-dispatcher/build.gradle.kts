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
    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
}

tasks.test { useJUnitPlatform() }

application { mainClass.set("pillar.webhookdispatcher.MainKt") }
