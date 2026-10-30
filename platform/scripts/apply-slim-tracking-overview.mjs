import fs from 'node:fs';
const root=new URL('../',import.meta.url);const mark='// SLIM_TRACKING_OVERVIEW_V1';
const path=new URL('src/lib/tracking-live.functions.ts',root);let code=fs.readFileSync(path,'utf8');
if(!code.includes(mark)){
 const start=code.indexOf('export const getTrackingOverview =');const end=code.indexOf('// ============ EVENTS LIST ============',start);
 if(start<0||end<0)throw new Error('Tracking overview source anchors changed.');
 const previous=code.slice(start,end);
 if(!previous.includes('await assertMember(supabase, data.workspaceId, userId);'))throw new Error('Tracking membership guard is missing.');
 code=code.slice(0,start)+`export const getTrackingOverview = createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((d:unknown)=>WorkspaceOnly.parse(d))
 .handler(async({data,context})=>{
   await assertMember(context.supabase,data.workspaceId,context.userId);
   const {loadSlimTrackingOverview}=await import("@/lib/slim-tracking-overview.server");
   return loadSlimTrackingOverview(context.supabase as never,data.workspaceId);
 });

`+code.slice(end)+'\n'+mark+'\n';
 fs.writeFileSync(path,code);
}
console.log('[Slim tracking] Overview uses complete database aggregates; other tracking routes preserved.');
