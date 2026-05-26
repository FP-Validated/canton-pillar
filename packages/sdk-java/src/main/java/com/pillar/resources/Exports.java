package com.pillar.resources;
public final class Exports { private final Resource resource; public Exports(Resource resource){ this.resource=resource; } public Object create(Object body,String idempotencyKey){ return resource; } public Object list(){ return resource; } public Object get(String id){ return resource; } }
