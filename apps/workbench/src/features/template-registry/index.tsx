export type TemplateRegistryView='list'|'inspect'|'transition';
export function TemplateRegistryFeature({view='list'}:{view?:TemplateRegistryView}){return <section data-feature="template-registry"><h1>Template Registry</h1><p>{view}</p></section>}
