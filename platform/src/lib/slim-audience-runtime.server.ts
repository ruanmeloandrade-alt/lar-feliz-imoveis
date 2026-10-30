import { dbWorkerMayRun, recordDbError, recordDbRecovery } from './slim-db-worker-backoff.core';
import { dbReadyForQueue } from './slim-db-readiness.server';
import {tickSlimStageMoveEvents} from "./slim-stage-move-worker.server";
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { deliverAudienceItem } from './slim-audience-delivery.core';
import { normalizeInternationalPhone, directWhatsappJidFromCanonicalDigits } from './whatsapp-identity';
const db = supabaseAdmin as any;
const root=globalThis as typeof globalThis & {__slimAudienceWorker?:{timer?:ReturnType<typeof setInterval>;busy:boolean;stageBusy:boolean;lastStage:number}};
const state=root.__slimAudienceWorker??={busy:false,stageBusy:false,lastStage:0};
function report(){console.error('[slim-audience-worker] Falha operacional. Nenhuma credencial ou resposta do provedor foi registrada.');}
function checked(r:any,label:string){if(r.error)throw new Error(label);return r.data;}
async function authorMayContinue(c:any):Promise<boolean>{
 const [cr,wr,mr]=await Promise.all([
  db.from('slim_audience_campaigns').select('status').eq('id',c.id).eq('workspace_id',c.workspace_id).maybeSingle(),
  db.from('workspaces').select('owner_id').eq('id',c.workspace_id).maybeSingle(),
  db.from('workspace_members').select('role_type,access_expires_at').eq('workspace_id',c.workspace_id).eq('user_id',c.created_by).maybeSingle(),
 ]);
 const campaign=checked(cr,'campaign'),w=checked(wr,'workspace'),m=checked(mr,'membership');
 return Boolean(campaign&&['queued','running'].includes(campaign.status)&&(w?.owner_id===c.created_by||(m&&m.role_type!=='visualizador'&&(!m.access_expires_at||Date.parse(m.access_expires_at)>Date.now()))));
}
async function activate(c:any,l:any){
 const a=checked(await db.from('conversation_ai_agents').select('id,enabled').eq('workspace_id',c.workspace_id).eq('id',c.agent_id).maybeSingle(),'agent');
 if(!a?.enabled)throw new Error('Agente desabilitado.');
 const {resolveWorkspaceAiKey}=await import('./workspace-ai-key.server');await resolveWorkspaceAiKey(db,c.workspace_id);
 const noop={allowed:false,continue:async()=>false,rollback:async()=>undefined};
 if(l.active_conversation_agent_id&&!l.ai_paused&&l.active_conversation_agent_id!==c.agent_id)return noop;
 let version=l.active_conversation_agent_version;let changed=false;
 if(l.active_conversation_agent_id!==c.agent_id||l.ai_paused){
  const result=await db.from('leads').update({active_conversation_agent_id:c.agent_id,ai_paused:false,updated_at:new Date().toISOString()})
   .eq('id',l.id).eq('workspace_id',c.workspace_id).eq('active_conversation_agent_version',version)
   .select('active_conversation_agent_version').maybeSingle();
  const updated=checked(result,'agent activation');if(!updated)return noop;version=updated.active_conversation_agent_version;changed=true;
 }
 return {allowed:true,continue:async()=>{
  const now=checked(await db.from('leads').select('active_conversation_agent_id,active_conversation_agent_version,ai_paused').eq('id',l.id).eq('workspace_id',c.workspace_id).maybeSingle(),'agent state');
  return Boolean(now&&!now.ai_paused&&now.active_conversation_agent_id===c.agent_id&&now.active_conversation_agent_version===version);
 },rollback:async()=>{
  if(!changed)return;
  checked(await db.from('leads').update({active_conversation_agent_id:l.active_conversation_agent_id,ai_paused:l.ai_paused,updated_at:new Date().toISOString()})
   .eq('id',l.id).eq('workspace_id',c.workspace_id).eq('active_conversation_agent_version',version),'agent rollback');
 }};
}
export async function processSlimAudienceQueue():Promise<void>{
 if(state.busy||!dbWorkerMayRun())return;state.busy=true;
 try{
  if(!await dbReadyForQueue(db))return;
  const claim=await db.rpc('slim_claim_audience_delivery');
  if(claim.error){recordDbError(claim.error);throw new Error('Fila de entregas temporariamente indisponível.');}
  recordDbRecovery();
  const item=claim.data;if(!item)return;
  const c=item.campaign;
  let originSessionId=item.origin_session_id??c.session_id;
  const outcome=await deliverAudienceItem({
   campaign:c,workspaceId:c.workspace_id,expectedPhone:item.phone,
   allowed:()=>authorMayContinue(c),
   lead:async()=>checked(await db.from('leads').select('id,workspace_id,name,email,phone,status,custom_data,merged_into_id,active_conversation_agent_id,active_conversation_agent_version,ai_paused').eq('id',item.lead_id).eq('workspace_id',c.workspace_id).maybeSingle(),'lead'),
   normalizePhone:(phone)=>normalizeInternationalPhone(phone,{allowTrustedBare:true}),
   session:async(lead)=>{
    originSessionId=lead.custom_data?.whatsapp_session_id??originSessionId;
    const s=checked(await db.from('whatsapp_web_sessions').select('status,metadata').eq('id',originSessionId).eq('workspace_id',c.workspace_id).maybeSingle(),'session');
    if(!s||s.metadata?.deleted===true||s.status!=='conectado')throw new Error('WhatsApp indisponível.');
    const key=process.env.INTEGRATION_ENCRYPTION_KEY;if(!key)throw new Error('Cofre indisponível.');
    return {...checked(await db.rpc('get_evolution_credentials_service',{_session_id:originSessionId,_key:key}),'credentials'),id:originSessionId};
   },
   activateAgent:(l)=>activate(c,l),
   startBot:async(l)=>{
    const bot=checked(await db.from('salesbots').select('id,is_active,scope').eq('id',c.salesbot_id).eq('workspace_id',c.workspace_id).maybeSingle(),'bot');
    if(!bot?.is_active||bot.scope==='group'||bot.scope==='grupo')throw new Error('SalesBot individual indisponível.');
    const {startSalesbotRun}=await import('./salesbot-runtime.server');
    return startSalesbotRun(db,{workspaceId:c.workspace_id,salesbotId:c.salesbot_id,leadId:l.id,delaySeconds:0,initialVariables:{nome:l.name??'',email:l.email??'',telefone:l.phone??''}});
   },
   send:async(s,phone,message)=>{
    const base=process.env.EVOLUTION_BASE_URL;if(!base)throw new Error('Canal não configurado.');
    const response=await fetch(`${base.replace(/\/+$/,'')}/message/sendText/${encodeURIComponent(s.instance_name)}`,{
     method:'POST',headers:{'Content-Type':'application/json',apikey:s.api_key},body:JSON.stringify({number:phone,text:message}),signal:AbortSignal.timeout(25000),
    });
    const body=await response.json().catch(()=>null);
    return {ok:response.ok,status:response.status,messageId:typeof body?.key?.id==='string'?body.key.id:undefined};
   },
   persist:async(l,phone,message,messageId)=>{
    const jid=directWhatsappJidFromCanonicalDigits(phone);if(!jid)throw new Error('Destinatário inválido.');
    const r=await db.from('whatsapp_web_messages').insert({workspace_id:c.workspace_id,session_id:originSessionId,remote_jid:jid,to_jid:jid,message_id:messageId,from_me:true,message_type:'text',body:message,delivery_status:'sent',raw:{source:'slim_audience',campaign_id:c.id,delivery_id:item.id},received_at:new Date().toISOString()});
    if(r.error&&r.error.code!=='23505')throw new Error('Registro da mensagem falhou.');
   },
  });
  checked(await db.from('slim_audience_deliveries').update({status:outcome.state,message_id:outcome.messageId??null,last_error:outcome.code??null,finished_at:new Date().toISOString()})
    .eq('id',item.id).eq('workspace_id',c.workspace_id).eq('status','running'),'delivery result');
 }catch(error){recordDbError(error);throw error;}
 finally{state.busy=false;}
}
async function processStageJobs(){
 if(state.stageBusy||Date.now()-state.lastStage<15000||!dbWorkerMayRun())return;state.stageBusy=true;state.lastStage=Date.now();
 try{if(!await dbReadyForQueue(db))return;
 await tickSlimStageMoveEvents();
 const {tickStageAutomationJobs}=await import('./stage-automation-engine.server');await tickStageAutomationJobs(db,10);recordDbRecovery();}
 catch(error){recordDbError(error);throw error;}
 finally{state.stageBusy=false;}
}
export function ensureSlimAudienceWorker(){
 if(state.timer)return;
 state.timer=setInterval(()=>{void processSlimAudienceQueue().catch(report);void processStageJobs().catch(report);},5000);
 state.timer.unref?.();
}
export function kickSlimAudienceWorker(){ensureSlimAudienceWorker();void processSlimAudienceQueue().catch(report);}

// SLIM_HISTORY_MEDIA_STAGE_HOTFIX_V1

// SLIM_WHATSAPP_ORIGIN_V1
