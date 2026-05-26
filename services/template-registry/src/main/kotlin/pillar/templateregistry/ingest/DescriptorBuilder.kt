package pillar.templateregistry.ingest

data class TemplateDescriptor(val templateFamily:String,val operationType:String,val templateId:String,val choice:String)
class DescriptorBuilder { fun build(manifest:DarManifest):List<TemplateDescriptor> = manifest.templates.map { raw -> val p=raw.split(':'); TemplateDescriptor(p.getOrElse(0){raw}, p.getOrElse(1){"default"}, raw, p.getOrElse(2){"Archive"}) } }
