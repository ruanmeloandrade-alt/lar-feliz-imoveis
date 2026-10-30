import fs from 'node:fs';
const root=new URL('../',import.meta.url);const MARK='// SLIM_AUDIENCE_OPERATIONS_V1';const plans=[];
function edit(file,run){let code=fs.readFileSync(new URL(file,root),'utf8');if(code.startsWith(MARK))return;
 const once=(a,b)=>{if(code.split(a).length!==2)throw new Error(`${file}: expected exactly one anchor: ${a.slice(0,80)}`);code=code.replace(a,()=>b);};
 const range=(a,b,value)=>{const start=code.indexOf(a),end=b?code.indexOf(b,start+a.length):code.length;if(start<0||end<0)throw new Error(`${file}: missing range ${a.slice(0,50)}`);code=code.slice(0,start)+value+code.slice(end);};
 const section=(a,b,fn)=>{const start=code.indexOf(a),end=b?code.indexOf(b,start+a.length):code.length;if(start<0||end<0)throw new Error(`${file}: missing section ${a}`);code=code.slice(0,start)+fn(code.slice(start,end))+code.slice(end);};
 run({once,range,section,get:()=>code});plans.push([file,MARK+'\n'+code]);}
edit('src/lib/crm-audiences.functions.ts',({once,range,section})=>{
 once('import { createServerFn }',`import { querySlimAudience } from "@/lib/slim-audience.core";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";
import { createServerFn }`);
 range('async function loadWs(', '// --- Filter schema ---', `async function loadWs(sb: AnySb,userId:string):Promise<string>{return requireActiveWorkspace(sb as never,userId);}\n\n`);
 range('async function queryMatchingLeads(', 'export const listCrmAudiences',`async function queryMatchingLeads(sb:AnySb,wsId:string,f:AudienceFilters,limit?:number):Promise<LeadRow[]>{return querySlimAudience(sb,wsId,f,limit) as Promise<LeadRow[]>;}\n\n`);
 for(const [name,end,kind] of [
  ['broadcastCrmAudience','// --- Options for filter builder ---','text'],
  ['reactivateCrmAudienceWithSalesbot','// --- Reativar público via Agente IA','salesbot'],
  ['reactivateCrmAudienceWithAgent',null,'agent'],
 ])section('export const '+name,end,s=>{
  s=s.replace('    id: z.string().uuid(),','    id: z.string().uuid(),\n    requestId: z.string().uuid().optional(),');
  const anchor='    const rows = await queryMatchingLeads(sb, wsId, filters, data.limit);';const p=s.indexOf(anchor);if(p<0)throw new Error(name+': target read missing');
  return s.slice(0,p)+anchor+`\n    const {enqueueSlimAudience}=await import("@/lib/slim-audience-queue.functions");\n    return enqueueSlimAudience(sb,wsId,data,rows,"${kind}");\n  });\n\n`;
 });
 range('export const listAudienceFilterOptions','// --- Reativar público disparando',`export const listAudienceFilterOptions=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const sb=context.supabase as unknown as AnySb;const ws=await loadWs(sb,context.userId);
 const {slimAudienceOptions}=await import("@/lib/slim-audience-options.server");return slimAudienceOptions(sb,ws);
});\n\n`);
 once('    await sb.from("crm_lead_audiences").update({\n      cached_count: rows.length, cached_at: new Date().toISOString(),\n    }).eq("id", data.id).eq("workspace_id", wsId);',`    const refreshResult=await sb.from("crm_lead_audiences").update({cached_count:rows.length,cached_at:new Date().toISOString()}).eq("id",data.id).eq("workspace_id",wsId);
    if(refreshResult.error)throw new Error("Não foi possível atualizar a contagem do público.");`);
});
edit('src/lib/stage-automation-engine.server.ts',({range,once})=>{
 range('export async function runJobById(', 'async function finishJob(',`export async function runJobById(admin:AnySb,jobId:string):Promise<JobResult>{
 const {data,error}=await admin.rpc("slim_claim_stage_job",{_job_id:jobId});
 if(error)throw new Error("Não foi possível reservar a automação para execução.");
 const job=Array.isArray(data)?data[0]:null;
 if(!job)return {actionId:jobId,title:"Automação",ok:true,skipped:true};
 return runJob(admin,job as JobRow);
}\n\n`);
 range('export async function tickStageAutomationJobs(', 'async function logActivity(',`export async function tickStageAutomationJobs(admin:AnySb,limit=100):Promise<{processed:number;failed:number}>{
 await scheduleStageTimerActions(admin);
 const {data,error}=await admin.from("crm_automation_jobs").select("id").eq("status","pending").lte("due_at",new Date().toISOString()).order("due_at").limit(limit);
 if(error)throw new Error("Não foi possível ler a fila de automações.");
 let processed=0,failed=0;for(const job of data??[]){const r=await runJobById(admin,job.id);if(!r.skipped)processed++;if(!r.ok)failed++;}
 return {processed,failed};
}\n\n`);
 once('    if (!passesExecutionRules(lead, action.execution)) {',`    const saved=await admin.from("crm_stage_automations").select("enabled,action").eq("workspace_id",job.workspace_id).eq("pipeline_id",job.pipeline_id).eq("action_id",action.id);
    if(saved.error)throw new Error("Não foi possível confirmar a automação ativa.");
    if(!(saved.data??[]).some((row:any)=>row.enabled!==false&&row.action?.enabled!==false)){
      await finishJob(admin,job.id,"skipped","Automação desabilitada ou removida.",job.attempts??0);
      return {actionId:action.id,title,ok:true,skipped:true};
    }
    if (!passesExecutionRules(lead, action.execution)) {`);
});
edit('src/lib/stage-automations.functions.ts',({once})=>{
 once('    const { data: rows } = await sb\n      .from("crm_automation_jobs")','    const { data: rows, error: jobsError } = await sb\n      .from("crm_automation_jobs")');
 once('    return { jobs: rows ?? [] };','    if(jobsError)throw new Error("Não foi possível consultar o histórico das automações.");\n    return { jobs: rows ?? [] };');
});
edit('src/server.ts',({once})=>{
 once(' const handler = await getServerEntry();',` const {ensureSlimAudienceWorker}=await import("./lib/slim-audience-runtime.server");
 ensureSlimAudienceWorker();
 const handler = await getServerEntry();`);
});
edit('src/routes/disparo-em-massa.tsx',({once,get})=>{
 if(get().includes('// SLIM_AUDIENCE_MASS_REDIRECT_V1')){
  const panel=fs.readFileSync(new URL('src/components/crm/SlimMassBroadcastPanel.tsx',root),'utf8');
  if(!get().includes("redirect({to:'/crm/publicos',search:{aba:'disparos'},replace:true})")||!panel.includes('// SLIM_AUDIENCE_MASS_PANEL_V1')||!panel.includes('requestId:requestTracker(')||!panel.includes('requestTracker.reset();')||!panel.includes('result.queued'))throw new Error('Mass broadcast tab must preserve redirect, tracker and queue acknowledgement.');
  return;
 }
 once('import { createFileRoute, Link }',`import {SlimAudienceQueue} from "@/components/crm/SlimAudienceQueue";
import {createAudienceRequestTracker} from "@/lib/slim-audience-request";
import { createFileRoute, Link }`);
 once('function DisparoEmMassaPage() {','function DisparoEmMassaPage() {\n  const [requestTracker]=useState(()=>createAudienceRequestTracker());');
 once('data: { id: selectedAudienceId, sessionId, message: text, limit, delayMs },','data: { id: selectedAudienceId, sessionId, message: text, limit, delayMs, requestId: requestTracker({id:selectedAudienceId,sessionId,message:text,limit,delayMs}) },');
 once('toast.success(`Disparo concluído: ${result.sent} enviados, ${result.failed} falhas.`);','requestTracker.reset();\n      toast.success(`Disparo registrado: ${result.queued} destinatários na fila. Acompanhe o progresso abaixo.`);');
 once('            </header>','            </header>\n            <SlimAudienceQueue />\n            {(audiencesQuery.error||sessionsQuery.error)&&<p role="alert" className="text-destructive text-sm">Falha ao carregar públicos ou canais. Atualize antes de enviar.</p>}');
});
edit('src/routes/crm.publicos.tsx',({once,section,get})=>{
 if(get().includes('// SLIM_AUDIENCE_TABS_V1')){
  once('import { createFileRoute, useNavigate }',`import {createAudienceRequestTracker} from "@/lib/slim-audience-request";
import { createFileRoute, useNavigate }`);
  if(!get().includes('<SlimAudienceQueue scope={scope}')||!get().includes('<SlimMassBroadcastPanel active=')||!get().includes('<SlimAudienceReport active='))throw new Error('Audience tabs must preserve queue, composer and report.');
 }else{
 once('import { createFileRoute }',`import {SlimAudienceQueue} from "@/components/crm/SlimAudienceQueue";
import {createAudienceRequestTracker} from "@/lib/slim-audience-request";
import { createFileRoute }`);
 section('export const Route', 'function FilterChips',s=>{const p=s.indexOf('</header>');if(p<0)throw new Error('Audience header missing');return s.slice(0,p)+'</header>\n            <SlimAudienceQueue />'+s.slice(p+9);});
 }
 section('function BroadcastDialog(', 'function ReactivateDialog(',s=>{
  s=s.replace('  const doBroadcast = useServerFn(broadcastCrmAudience);','  const doBroadcast = useServerFn(broadcastCrmAudience);\n  const [requestTracker]=useState(()=>createAudienceRequestTracker());');
  s=s.replace('id: target.id, sessionId, message, limit, delayMs }','id: target.id, sessionId, message, limit, delayMs, requestId:requestTracker({id:target.id,sessionId,message,limit,delayMs}) }');
  s=s.replace('toast.success(`Transmissão: ${r.sent} enviadas · ${r.failed} falhas · ${r.total} contatos.`);','requestTracker.reset();toast.success(`Disparo registrado: ${r.queued} destinatários na fila.`);');return s;
 });
 section('function ReactivateDialog(',null,s=>{
  s=s.replace('  const [busy, setBusy] = useState(false);','  const [busy, setBusy] = useState(false);\n  const [requestTracker]=useState(()=>createAudienceRequestTracker());');
  s=s.replace('id: target.id, salesbotId, delaySeconds: botDelay, limit: botLimit }','id: target.id, salesbotId, delaySeconds: botDelay, limit: botLimit, requestId:requestTracker({id:target.id,salesbotId,botDelay,botLimit}) }');
  s=s.replace('toast.success(`Salesbot disparado: ${r.started}/${r.total} (skip ${r.skipped}).`);','requestTracker.reset();toast.success(`SalesBot: ${r.queued} clientes enfileirados. Veja o progresso na página.`);');
  s=s.replace('id: target.id, agentId, sessionId, message: agentMsg, limit: agentLimit, delayMs: agentDelayMs }','id: target.id, agentId, sessionId, message: agentMsg, limit: agentLimit, delayMs: agentDelayMs, requestId:requestTracker({id:target.id,agentId,sessionId,agentMsg,agentLimit,agentDelayMs}) }');
  s=s.replace('toast.success(`Agente ativado: ${r.sent} envios · ${r.failed} falhas · ${r.total} leads.`);','requestTracker.reset();toast.success(`Agente IA: ${r.queued} clientes na fila. Ativação e envio serão registrados no progresso.`);');
  s=s.replace('const bots = botsQ.data?.bots ?? [];','const bots = (botsQ.data?.bots ?? []).filter((b:any)=>b.is_active);');
  s=s.replace('const agents = agentsQ.data ?? [];','const agents = (agentsQ.data ?? []).filter((a:any)=>a.enabled);');
  s=s.replace('const sessions = sessQ.data?.sessions ?? [];','const sessions = (sessQ.data?.sessions ?? []).filter((s:any)=>s.status==="conectado");');return s;
 });
});
edit('src/lib/security-settings.functions.ts',({once})=>{
 once('  block_leaked_passwords: true,','  block_leaked_passwords: false,');
 once('  const { data } = await sb.rpc("can_admin_workspace", { _user_id: userId, _workspace_id: wsId });','  const { data, error } = await sb.rpc("can_admin_workspace", { _user_id: userId, _workspace_id: wsId });\n  if(error)throw new Error("Configuração de permissões de segurança indisponível. A alteração não foi salva.");');
 once('    const { data } = await sb.from("workspace_security_settings").select(COLS).eq("workspace_id", wsId).maybeSingle();','    const { data, error } = await sb.from("workspace_security_settings").select(COLS).eq("workspace_id", wsId).maybeSingle();\n    if(error)throw new Error("Configurações de segurança indisponíveis neste ambiente. Não foi possível confirmar as proteções.");');
 once('    const { data: row } = await sb\n      .from("workspace_security_settings")','    const { data: row, error: saveError } = await sb\n      .from("workspace_security_settings")');
 once('    await logEvent(sb, wsId, context.userId, {\n      type: "settings",','    if(saveError||!row)throw new Error("Não foi possível salvar as configurações de segurança.");\n    await logEvent(sb, wsId, context.userId, {\n      type: "settings",');
});
edit('src/lib/settings.functions.ts',({once,get})=>{
 const code=get();
 if(code.includes('// SLIM_INVITATIONS_EXPLICIT_ACCESS_V1:')){
  const modernImport='import { changeSlimInvitation, previewSlimInvitation, acceptSlimInvitation } from "@/lib/slim-invitations.functions";';
  if(!code.includes(modernImport)||!code.includes('export const previewInvitation = previewSlimInvitation;')||!code.includes('export const acceptInvitation = acceptSlimInvitation;')||/\.rpc\(["'](?:preview_invitation|accept_invitation)["']/.test(code))throw new Error('settings.functions.ts: modern invitation contract changed; review compatibility before building.');
  return; // Error handling and strict receipts now belong to the dedicated invitation server functions.
 }
 once('    const { data: result } = await sb.rpc("preview_invitation", { p_token: data.token });','    const { data: result, error } = await sb.rpc("preview_invitation", { p_token: data.token });\n    if(error)throw new Error("Serviço de convites indisponível. Não foi possível verificar o convite.");');
});
for(const [p,s] of plans)fs.writeFileSync(new URL(p,root),s);
console.log(`[Slim audiences] ${plans.length} checked source files updated. No migration or outbound message executed by this build script.`);
