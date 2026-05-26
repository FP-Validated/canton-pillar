plugins { id("org.jetbrains.kotlin.jvm"); application }
kotlin { jvmToolchain(21) }
application { mainClass.set("pillar.searchindexer.MainKt") }
dependencies { implementation(libs.kotlin.stdlib); testImplementation(platform(libs.junit.bom)); testImplementation(libs.junit.jupiter); testImplementation(kotlin("test")) }
tasks.test { useJUnitPlatform() }
