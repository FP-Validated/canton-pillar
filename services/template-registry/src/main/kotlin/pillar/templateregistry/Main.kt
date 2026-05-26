package pillar.templateregistry

import pillar.templateregistry.config.RegistryConfig
import pillar.templateregistry.internal.InternalApiServer

fun main() { InternalApiServer(RegistryConfig.fromEnv()).start() }
