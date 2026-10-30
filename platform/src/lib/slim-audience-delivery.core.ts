import { audienceMessage, contactBlocked } from './slim-audience.core.ts';
export type DeliveryOutcome = { state: 'sent'|'skipped'|'failed'|'uncertain'; code?: string; messageId?: string; note?: string };
export function audienceDeliveryIssueText(code: string): string {
  if (code === 'LOCAL_PERSISTENCE_FAILED') return 'A resposta do WhatsApp foi recebida, mas houve falha ao gravar o histórico. Confira a conversa; o disparo não será repetido automaticamente.';
  if (code === 'NO_PROVIDER_RECEIPT') return 'Sem comprovante válido do WhatsApp. Confira a conversa antes de qualquer nova tentativa.';
  return `${code}. Confira a conversa antes de tentar novamente.`;
}
export type DeliveryDependencies = {
  allowed: () => Promise<boolean>;
  lead: () => Promise<Record<string,any>|null>;
  campaign: { kind: string; message: string; agent_id?: string|null; salesbot_id?: string|null };
  expectedPhone?: string|null;
  session: (lead: Record<string,any>) => Promise<{ id?: string; workspace_id: string; status: string; instance_name: string; api_key: string }>;
  workspaceId: string;
  normalizePhone: (phone: string) => {ok:boolean; digits?:string};
  activateAgent: (lead: Record<string,any>) => Promise<{allowed:boolean; continue:()=>Promise<boolean>; rollback:()=>Promise<void>}>;
  startBot: (lead: Record<string,any>) => Promise<string|null>;
  send: (session: Record<string,any>, phone:string, message:string) => Promise<{ok:boolean; status:number; messageId?:string}>;
  persist: (lead:Record<string,any>,phone:string,message:string,messageId:string) => Promise<void>;
};
/** No network or credentials in this core. A provider failure is never an invitation to resend. */
export async function deliverAudienceItem(d:DeliveryDependencies):Promise<DeliveryOutcome>{
  let outboundAttempted=false; let acknowledgedMessageId:string|undefined; let agent:Awaited<ReturnType<DeliveryDependencies['activateAgent']>>|null=null;
  try {
    if (!await d.allowed()) return {state:'skipped',code:'CAMPAIGN_STOPPED'};
    const lead=await d.lead();
    if (!lead || lead.workspace_id!==d.workspaceId || contactBlocked(lead)) return {state:'skipped',code:'CONTACT_UNAVAILABLE'};
    if(d.campaign.kind==='salesbot') {
      if(!await d.allowed()) return {state:'skipped',code:'CAMPAIGN_STOPPED'};
      outboundAttempted=true;
      const run=await d.startBot(lead);
      return run ? {state:'sent',messageId:run,note:'SalesBot iniciado; não é confirmação de entrega WhatsApp.'} : {state:'skipped',code:'BOT_NOT_STARTED'};
    }
    if(!['text','agent'].includes(d.campaign.kind)) return {state:'failed',code:'INVALID_KIND'};
    const phone=d.normalizePhone(String(lead.phone??''));
    if(!phone.ok || !phone.digits) return {state:'skipped',code:'INVALID_PHONE'};
    if(d.expectedPhone && phone.digits!==d.expectedPhone) return {state:'skipped',code:'PHONE_CHANGED'};
    const session=await d.session(lead);
    const origin=lead.custom_data?.whatsapp_session_id;
    if(typeof origin==='string'&&origin&&session.id!==origin)return {state:'failed',code:'ORIGIN_MISMATCH'};
    if(session.workspace_id!==d.workspaceId || session.status!=='conectado' || !session.instance_name || !session.api_key) return {state:'failed',code:'SESSION_UNAVAILABLE'};
    const message=audienceMessage(d.campaign.message,lead).trim();
    if(!message || message.length>4096) return {state:'failed',code:'INVALID_MESSAGE'};
    if(d.campaign.kind==='agent'){
      agent=await d.activateAgent(lead);
      if(!agent.allowed) return {state:'skipped',code:'OTHER_AGENT_ACTIVE'};
    }
    if(!await d.allowed() || (agent && !await agent.continue())) {
      if(agent) await agent.rollback();
      return {state:'skipped',code:'CAMPAIGN_STOPPED'};
    }
    outboundAttempted=true;
    const r=await d.send(session,phone.digits,message);
    if(!r.ok){
      const uncertain=r.status>=500 || r.status===408;
      if(agent&&!uncertain) await agent.rollback();
      return {state:uncertain?'uncertain':'failed',code:`PROVIDER_${r.status}`};
    }
    const messageId=typeof r.messageId==='string'?r.messageId.trim():'';
    if(!messageId) return {state:'uncertain',code:'NO_PROVIDER_RECEIPT'};
    acknowledgedMessageId=messageId;
    await d.persist(lead,phone.digits,message,messageId);
    return {state:'sent',messageId};
  }catch{
    if(agent&&!outboundAttempted) await agent.rollback().catch(()=>undefined);
    // A failed local write cannot undo a provider acknowledgement or justify another send.
    if(acknowledgedMessageId) return {state:'sent',messageId:acknowledgedMessageId,code:'LOCAL_PERSISTENCE_FAILED'};
    return {state:outboundAttempted?'uncertain':'failed',code:outboundAttempted?'PROVIDER_RESULT_UNKNOWN':'PRECONDITION_FAILED'};
  }
}
