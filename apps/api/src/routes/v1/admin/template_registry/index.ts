export const templateRegistryAdminScopes = ['admin:template_registry:write','admin:template_registry:approve'] as const;
export function registerTemplateRegistryAdminRoutes(app:any){
  app.get('/v1/admin/template_registry/dar_uploads', async()=>({object:'list',data:[]}));
  app.post('/v1/admin/template_registry/dar_uploads', async({body}:any)=>({object:'dar_upload',...body}));
  app.get('/v1/admin/template_registry/package_versions', async()=>({object:'list',data:[]}));
  app.get('/v1/admin/template_registry/package_versions/:id', async({params}:any)=>({object:'package_version',id:params.id}));
  for (const action of ['publish','retire','revoke']) app.post(`/v1/admin/template_registry/package_versions/:id/${action}`, async({params,body}:any)=>({id:params.id,action,approval_required:true,...body}));
  app.post('/v1/admin/template_registry/upgrade_plans', async({body}:any)=>({object:'upgrade_plan',...body}));
  for (const action of ['stage','dual_publish','cutover','retire','pause','rollback']) app.post(`/v1/admin/template_registry/upgrade_plans/:id/${action}`, async({params,body}:any)=>({id:params.id,action,approval_required:true,...body}));
  app.get('/v1/admin/template_registry/compatibility', async({query}:any)=>({object:'list',environment:query.environment,data:[]}));
}
