plugins { `java-library` }

java {
    toolchain { languageVersion.set(JavaLanguageVersion.of(21)) }
}

val damlDars = listOf(
    "daml/pillar-core/.daml/dist/pillar-core-0.1.0.dar",
    "daml/pillar-assets/.daml/dist/pillar-assets-0.1.0.dar",
    "daml/pillar-intents/.daml/dist/pillar-intents-0.1.0.dar",
    "daml/pillar-ops/.daml/dist/pillar-ops-0.1.0.dar",
    "daml/pillar-token-adapter/.daml/dist/pillar-token-adapter-0.1.0.dar",
)

val generatedJava = layout.buildDirectory.dir("generated/sources/daml/java/main")

tasks.register("generateJavaBindings") {
    inputs.files(damlDars.map { rootProject.projectDir.resolve(it) })
    outputs.dir(generatedJava)
    doLast {
        val outputDir = generatedJava.get().asFile
        outputDir.deleteRecursively()
        outputDir.mkdirs()
        val dpmAvailable = providers.exec {
            isIgnoreExitValue = true
            commandLine("dpm", "--version")
        }.result.get().exitValue == 0
        if (!dpmAvailable) {
            logger.warn("dpm unavailable; using Phase 04 mock ledger type surface from src/main/java")
            return@doLast
        }
        damlDars.forEach { dar ->
            val full = rootProject.projectDir.resolve(dar)
            if (!full.exists()) {
                logger.warn("missing dar: $full")
                return@forEach
            }
            val result = exec {
                isIgnoreExitValue = true
                commandLine("dpm", "codegen-java", full.absolutePath, "--output-directory", outputDir.absolutePath)
            }
            if (result.exitValue != 0) {
                logger.warn("dpm codegen-java failed for $full; using Phase 04 mock ledger type surface from src/main/java")
            }
        }
    }
}

// Phase 04 uses the small mock surface in src/main/java until Daml Java runtime jars are available.
// The generateJavaBindings task still exercises DPM codegen and writes generated sources for inspection.
