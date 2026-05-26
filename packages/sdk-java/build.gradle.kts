plugins { `java-library` }
java { toolchain { languageVersion.set(JavaLanguageVersion.of(21)) } }
dependencies { implementation("com.fasterxml.jackson.core:jackson-databind:2.17.2"); testImplementation("org.junit.jupiter:junit-jupiter:5.10.3") }
tasks.test { useJUnitPlatform() }
tasks.register("generate") { doLast { println("sdk-java hand-curated POJOs are current") } }
