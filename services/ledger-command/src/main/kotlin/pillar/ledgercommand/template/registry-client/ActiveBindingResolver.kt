package pillar.ledgercommand.template.registry_client

import pillar.ledgercommand.command.PackageProfile

data class BindingRequest(val tenant:String,val environment:String,val livemode:Boolean,val templateFamily:String,val operationType:String)
class ActiveBindingResolver(private val client:RegistryClient) { fun resolve(r:BindingRequest):RegistryBinding = client.activeBinding(listOf(r.tenant,r.environment,r.livemode,r.templateFamily,r.operationType).joinToString(":")) }
class FailClosedGuard { fun requireUsable(binding:RegistryBinding):PackageProfile { if(binding.status != "active" || binding.expiresAt.isBefore(java.time.Instant.now())) throw PackageProfileUnavailable("registry binding ${binding.status}"); return PackageProfile(binding.templateId,binding.choice,binding.packageId) } }
data class OperationTrace(val operationId:String, val registry_version:Int)
