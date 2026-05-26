pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
    }
}

rootProject.name = "pillar"

include(":packages:ledger-types")
project(":packages:ledger-types").projectDir = file("packages/ledger-types")
include(":packages:sdk-java")
project(":packages:sdk-java").projectDir = file("packages/sdk-java")

val kotlinServices = listOf(
    "ledger-command",
    "projection-worker",
    "workflow-orchestrator",
    "reconciler",
    "compliance-adapter",
    "export-worker",
    "token-standard-adapter",
    "template-registry",
    "webhook-dispatcher",
)

kotlinServices.forEach { serviceName ->
    include("services:$serviceName")
    project(":services:$serviceName").projectDir = file("services/$serviceName")
}
