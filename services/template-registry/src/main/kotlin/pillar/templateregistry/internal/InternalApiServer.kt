package pillar.templateregistry.internal

import com.sun.net.httpserver.HttpServer
import pillar.templateregistry.config.RegistryConfig
import java.net.InetSocketAddress

class InternalApiServer(private val config: RegistryConfig) { fun start() { val server = HttpServer.create(InetSocketAddress(config.port), 0); server.createContext("/internal/registry/health") { ex -> val b = "ok".toByteArray(); ex.sendResponseHeaders(200, b.size.toLong()); ex.responseBody.use { it.write(b) } }; server.start() } }
