plugins { alias(libs.plugins.kotlin.jvm); application }

application { mainClass.set("pillar.templateregistry.MainKt") }

dependencies {
    implementation(libs.kotlin.stdlib)
    implementation(libs.hikari)
    implementation(libs.postgres)
    implementation(libs.jackson.databind)
    implementation(libs.bouncycastle)
    implementation(libs.micrometer.core)
    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
}
