package com.pillar.resources;
public final class ReportTemplates { private final Resource resource; public ReportTemplates(Resource resource){ this.resource=resource; } public Object create(Object body,String idempotencyKey){ return resource; } public Object list(){ return resource; } public Object run(String id,String idempotencyKey){ return resource; } }
