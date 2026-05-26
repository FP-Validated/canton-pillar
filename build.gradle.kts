plugins {
    base
    alias(libs.plugins.kotlin.jvm) apply false
}

allprojects {
    group = "org.pillar"
    version = "0.0.0-SNAPSHOT"
}

subprojects {
    plugins.withId("java") {
        extensions.configure<JavaPluginExtension> {
            toolchain { languageVersion.set(JavaLanguageVersion.of(21)) }
        }

        tasks.withType<Test>().configureEach {
            useJUnitPlatform()
        }
    }

    plugins.withId("org.jetbrains.kotlin.jvm") {
        extensions.configure<org.jetbrains.kotlin.gradle.dsl.KotlinJvmProjectExtension> {
            jvmToolchain(21)
        }

        tasks.withType<Test>().configureEach {
            useJUnitPlatform()
        }
    }
}

tasks.register("phaseInfo") {
    doLast { println("Pillar Phase 04 — Ledger command runtime workspace.") }
}
