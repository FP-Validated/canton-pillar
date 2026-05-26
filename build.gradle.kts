plugins {
    base
}

allprojects {
    group = "org.pillar"
    version = "0.0.0-SNAPSHOT"
}

tasks.register("phaseInfo") {
    doLast { println("Pillar Phase 0 — JVM workspace scaffold only. Service code lands in P4+.") }
}
