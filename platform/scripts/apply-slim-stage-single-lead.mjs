import fs from 'node:fs';import ts from 'typescript';
const url=new URL('../src/lib/saude-slim-funnel-client.ts',import.meta.url),mark='// SLIM_STAGE_SINGLE_LEAD_V1';
let source=fs.readFileSync(url,'utf8');
if(source.includes(mark))console.log('[Slim stage single lead] Already integrated.');
else if(source.includes('moveSlimLeadWithAutomations'))console.log('[Slim stage single lead] Transactional RPC path supersedes legacy movement.');
else {
 const start='  const {data:lead,error:leadErr}=await sb.from("leads").select("id,company_id")';
 const end='  return {\n    ok:true,automations:[] as Array<{actionId:string;title:string;ok:boolean}>,';
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 if(a<0||b<0||source.split(start).length!==2)throw new Error('[Slim stage single lead] Old legacy movement contract changed.');
 const block=`  const {data:lead,error:leadErr}=await sb.from("leads").select("id,stage_id,pipeline_id")
    .eq("workspace_id",ws).eq("id",data.leadId).is("merged_into_id",null).maybeSingle();
  if(leadErr||!lead)throw new Error("Cliente indisponível nesta empresa.");
  if(lead.stage_id===data.toStageId&&lead.pipeline_id===stage.pipeline_id)return {
    ok:true,automations:[] as Array<{actionId:string;title:string;ok:boolean}>,backendPending:false,moved:false,
  };
  // A stage transition never stands in for a human or bot reply.
  // Updating company_id here previously moved unrelated customer cards too.
  const {data:updated,error}=await sb.from("leads").update({
    stage_id:data.toStageId,pipeline_id:stage.pipeline_id,
    updated_at:new Date().toISOString(),
  }).eq("workspace_id",ws).eq("id",data.leadId).is("merged_into_id",null).select("id").maybeSingle();
  if(error||!updated)throw new Error("A etapa não foi confirmada. Atualize o funil antes de repetir.");
`;
 source=source.slice(0,a)+block+source.slice(b);
 const parsed=ts.createSourceFile('saude-slim-funnel-client.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 if(parsed.parseDiagnostics.length)throw new Error('[Slim stage single lead] '+parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
 fs.writeFileSync(url,source+'\n'+mark+'\n');
 console.log('[Slim stage single lead] Scoped one-contact movement; original message state preserved.');
}
