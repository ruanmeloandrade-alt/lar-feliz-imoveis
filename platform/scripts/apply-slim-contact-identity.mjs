import fs from 'node:fs';import ts from 'typescript';
const root=new URL('../',import.meta.url),MARK='// SLIM_CONTACT_IDENTITY_V1',plans=[];
function edit(path,fn){let code=fs.readFileSync(new URL(path,root),'utf8');if(code.includes(MARK))return;
 const once=(a,b)=>{const n=code.split(a).length-1;if(n!==1)throw new Error(`[Contact identity] ${path}: ${n} anchors: ${a.slice(0,110)}`);code=code.replace(a,()=>b);};
 const block=(a,b,value)=>{const start=code.indexOf(a),end=code.indexOf(b,start+a.length);if(start<0||end<0||code.split(a).length!==2)throw new Error(`[Contact identity] ${path}: ambiguous/missing block ${a}`);code=code.slice(0,start)+value+code.slice(end);};
 fn({once,block,get:()=>code});plans.push([path,code+'\n'+MARK+'\n']);
}
edit('src/lib/saude-slim-orders-client.ts',({once,block})=>{
 once('import { supabase } from "@/integrations/supabase/client";','import { supabase } from "@/integrations/supabase/client";\nimport {createSlimUiContact} from "./slim-contact-route.functions";');
 block('  const {data:created,error}=await sb.from("leads").insert({','  return {id:created.id};',`  const created=await createSlimUiContact({data:{workspaceId:ws,payload:{
    crm_source_id:data.crmSourceId,pipeline_id:data.pipelineId,stage_id:data.stageId,
    name:data.name.trim(),email:data.email||null,phone:data.phone||null,value:data.value,
    source:'cadastro_manual_saude_slim',custom_data:data.address?{endereco:data.address}:{}
  }}});
  if(!created.created)throw new Error('Este telefone já possui um contato. Use o cadastro existente; nenhuma duplicata foi criada.');
`);
});
edit('src/lib/saude-slim-funnel-client.ts',({once,block,get})=>{
 once('import { supabase } from "@/integrations/supabase/client";','import { supabase } from "@/integrations/supabase/client";\nimport {createSlimUiContact} from "./slim-contact-route.functions";\nimport {loadContactIdentityIndex,resolveSlimContactId} from "./slim-contact-identity.core";');
 once('.eq("workspace_id",ws).eq("crm_source_id",data.crmSourceId).eq("status","active").limit(5000)','.eq("workspace_id",ws).eq("crm_source_id",data.crmSourceId).eq("status","active").is("merged_into_id",null).limit(5000)');
 once('  const pipes=rows(p),stages=rows(st),leads=rows(lr);','  const identity=await loadContactIdentityIndex(sb,ws);\n  const pipes=rows(p),stages=rows(st),leads=rows(lr).filter(lead=>identity.resolve(lead.id)===lead.id);');
 // The new authenticated funnel RPC preserves this contact guard inside its
 // transaction. Keep the legacy adapter only for a source still using INSERT.
 if(!get().includes('createSlimLeadWithAutomations'))block('  const {data:created,error}=await sb.from("leads").insert({','  return {id:created.id,leadId:created.id};',`  const created=await createSlimUiContact({data:{workspaceId:ws,payload:{
    crm_source_id:data.crmSourceId,pipeline_id:data.pipelineId,stage_id:data.stageId,
    name,email:data.email?.trim()||null,phone:data.phone?.trim()||null,
    value:Number.isFinite(Number(data.value))?Number(data.value):0,source:'cadastro_manual_saude_slim'
  }}});
  if(!created.created)throw new Error('Este telefone já possui um contato. Use o cadastro existente; a etapa e os dados dele foram preservados.');
`);
 once('  if(stageErr||!stage)throw new Error("Etapa inválida.");','  if(stageErr||!stage)throw new Error("Etapa inválida.");\n  data={...data,leadId:await resolveSlimContactId(sb,ws,data.leadId)};');
 once('  }).eq("workspace_id",ws);\n  if(lead.company_id)','  }).eq("workspace_id",ws).is("merged_into_id",null);\n  if(lead.company_id)');
});
edit('src/lib/saude-slim-leads-client.ts',({once})=>{
 once('const sb = supabase as any;','import {loadContactIdentityIndex,resolveSlimContactId} from "./slim-contact-identity.core";\nconst sb = supabase as any;');
 once('.eq("workspace_id",ws).eq("status","active")','.eq("workspace_id",ws).eq("status","active").is("merged_into_id",null)');
 once('  return {leads:(data??[]).map(rowToList)};','  const identity=await loadContactIdentityIndex(sb,ws);\n  return {leads:(data??[]).filter(row=>identity.resolve(row.id)===row.id).map(rowToList)};');
 once('  const ws=await workspace();\n  const r=check','  const ws=await workspace();\n  data={leadId:await resolveSlimContactId(sb,ws,data.leadId)};\n  const r=check');
});
edit('src/routes/crm.leads.tsx',({once})=>{
 once('onOpenConversation={() => detailLeadId && navigate({ to: "/inbox/leads/$leadId", params: { leadId: detailLeadId } })}','onOpenConversation={() => detailQuery.data?.lead.id && navigate({ to: "/inbox/leads/$leadId", params: { leadId: detailQuery.data.lead.id } })}');
});
edit('src/routes/inbox.leads.$leadId.tsx',({once})=>{
 once('import { InboxPage } from "@/components/inbox/InboxPage";','import { InboxPage } from "@/components/inbox/InboxPage";\nimport {SlimContactRouteGate} from "@/components/inbox/SlimContactRouteGate";');
 once('<div className="relative w-full min-w-0">','<SlimContactRouteGate leadId={leadId}><div className="relative w-full min-w-0">');
 once('    </div>','    </div></SlimContactRouteGate>');
});
edit('src/lib/inbox-cache.ts',({once})=>once('export const INBOX_CACHE_SCHEMA_VERSION = 1;','export const INBOX_CACHE_SCHEMA_VERSION = 2;'));
edit('src/lib/leads.functions.legacy.ts',({once,block})=>{
 once('import { z } from "zod";','import { z } from "zod";\nimport {prepareSlimInboxContactMap,loadContactIdentityIndex} from "./slim-contact-identity.core";\nimport {readSlimContactHistory} from "./slim-contact-history.core";');
 once('.eq("status", "active")\n      .order("updated_at", { ascending: false })','.eq("status", "active").is("merged_into_id",null)\n      .order("updated_at", { ascending: false })');
 once('  const pageLeadIds = orderedPage.map((row) => row.lead_id);\n  const conversationAtByLead = new Map(\n    orderedPage.map((row) => [row.lead_id, row.conversation_at] as const),\n  );',`  const identity=await loadContactIdentityIndex(sb,wsId);
  const pageLeadIds=[...new Set(orderedPage.map(row=>{try{return identity.resolve(row.lead_id);}catch{return null;}}).filter((id):id is string=>!!id))];
  const conversationAtByLead=new Map<string,string>();
  for(const row of orderedPage){try{const id=identity.resolve(row.lead_id);if(!conversationAtByLead.has(id))conversationAtByLead.set(id,row.conversation_at);}catch{/* Archived/unavailable records are not contacts. */}}
`);
 once('        .in("id", pageLeadIds)','        .in("id", pageLeadIds).is("merged_into_id",null)');
 block('    // Match de identidade é EXATO.','    // Dedupe: mensagens já viradas em lead_activities',`    // Shared contact identity: Clients, Funnel, webhook and backfill never choose different order clones.
    const {leadByPhone,customDataByLead,leadsCreated}=await prepareSlimInboxContactMap(sb,wsId,byPhone);

`);
 once('    let q = sb\n      .from("lead_activities")',`    const identity=await loadContactIdentityIndex(sb,wsId);
    const canonicalId=identity.resolve(data.leadId),family=identity.family(canonicalId);
    if(family.length>1)return readSlimContactHistory(sb,wsId,canonicalId,family,data);
    data={...data,leadId:canonicalId};
    let q = sb
      .from("lead_activities")`);
});
edit('src/routes/api/public/evolution/webhook.$secret.ts',({once,block})=>{
 once('              let resolvedLeadId: string | null = null;',`              const {findSlimContact,createSlimCanonicalContact}=await import('@/lib/slim-contact-identity.core');
              let resolvedLeadId: string | null = null;`);
 block('                let { data: leadMatch } = await supabaseAdmin','                const match = leadMatch as {',`                const leadMatch=await findSlimContact(supabaseAdmin as never,sess.workspace_id,phone);
`);
 block('                    const { data: created, error: createErr } = await supabaseAdmin','                  } else {\n                    console.warn("[evolution-webhook] no crm_source',`                    const created=await createSlimCanonicalContact(supabaseAdmin as never,sess.workspace_id,{
                      crm_source_id:sourceId,pipeline_id:pipelineId,stage_id:stageId,name:displayName,phone:'+'+phone,source:'whatsapp',
                      custom_data:{whatsapp_session_id:sess.session_id,crm_created_dispatched:false,whatsapp_name_source:inboundPushName?'inbound_push_name':'phone_fallback'},last_message_from:'lead'
                    });
                    resolvedLeadId=created.id;
                    if(created.created){
                      const {dispatchCrmLeadCreated}=await import('@/lib/crm-event-dispatch.server');
                      await dispatchCrmLeadCreated(supabaseAdmin as never,{workspaceId:sess.workspace_id,leadId:created.id,pipelineId,stageId});
                      await supabaseAdmin.from('leads').update({custom_data:{whatsapp_session_id:sess.session_id,crm_created_dispatched:true,whatsapp_name_source:inboundPushName?'inbound_push_name':'phone_fallback'}}).eq('id',created.id).eq('workspace_id',sess.workspace_id);
                    }
`);
});
for(const [path,code] of plans){const source=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);if(source.parseDiagnostics.length)throw new Error(`[Contact identity] Invalid syntax ${path}: ${source.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; ')}`);}
for(const [path,code]of plans)fs.writeFileSync(new URL(path,root),code);
console.log(`[Contact identity] ${plans.length} source consumers patched and parsed. No business data changed in build.`);
