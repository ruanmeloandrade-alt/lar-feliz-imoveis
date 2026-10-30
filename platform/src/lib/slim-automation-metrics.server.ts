// SLIM_LEGACY_REVIEW_V1
import {metricPurchasesIncludingErp} from './slim-legacy-review.core';
import {aggregateBotMetrics,aggregateMessages,aggregateAgentRuns} from './slim-automation-metrics.core';
import {readCompleteMetricRows} from './slim-metrics-reader.core';
import {classifyDashboardLead} from './slim-dashboard-data.core';
export async function loadSlimAutomationMetrics(db:any,workspaceId:string,days:number|null,details=false){
 const now=Date.now(); const from=days===null?0:now-days*86400000; const issues:Array<{source:string;message:string;code:string}>=[];
 async function optional(table:string,columns:string,configure:(q:any)=>any=q=>q){
  try{return await readCompleteMetricRows(db,workspaceId,table,columns,configure);}
  catch(error){const code=typeof (error as any)?.code==='string'?(error as any).code:'READ_ERROR';issues.push({source:table,code,message:['42P01','PGRST205'].includes(code)?`${table}: fonte ainda não disponível.`:`${table}: leitura indisponível; nenhum valor foi inventado.`});return null;}
 }
 const [bots,runs,legacyPurchases,erpOrders]=await Promise.all([
  readCompleteMetricRows(db,workspaceId,'salesbots','id,local_id,name,scope'),
  readCompleteMetricRows(db,workspaceId,'salesbot_runs','id,salesbot_id,lead_id,status,started_at,finished_at,stopped_at,last_error'),
  optional('lead_products','id,lead_id,kind,sold_at',q=>q.eq('kind','comprou')),
  optional('slim_orders','id,customer_id,status,confirmed_at,legacy_lead_id'),
 ]);
 let purchases=null;
 try{purchases=metricPurchasesIncludingErp(legacyPurchases,erpOrders);}catch{issues.push({source:'slim_orders',code:'INVALID_SOURCE',message:'Pedidos inconsistentes. Conversão não calculada.'});}
 const result=aggregateBotMetrics({bots,runs,purchases,days,now});
 result.conversionRule+=' Inclui pedidos ERP confirmados. Cancelados são excluídos; vendas regularizadas não repetem o vínculo antigo.';
 if(!details)return {...result,workspaceId,issues,agents:null,messages:null,groups:null,crm:null};
 const [agents,agentRuns,leads,stages,messages,groups]=await Promise.all([
  optional('conversation_ai_agents','id,name'),
  optional('conversation_agent_runs','id,agent_id,lead_id,started_at,interactions_count,objective_reached,objective_reached_at'),
  optional('leads','id,name,status,stage_id,value,created_at,active_conversation_agent_id,ai_paused,merged_into_id'),
  optional('pipeline_stages','id,name'),
  optional('whatsapp_web_messages','id,message_id,session_id,from_me,remote_jid,delivery_status,received_at',q=>q.eq('from_me',true).gte('received_at',new Date(from).toISOString()).lte('received_at',new Date(now).toISOString())),
  optional('whatsapp_groups','id'),
 ]);
 const names=new Map((leads??[]).map(l=>[l.id,l.name]));
 const stageNames=new Map((stages??[]).map(s=>[s.id,s.name]));
 const cohort=(leads??[]).filter(l=>!l.merged_into_id&&!['archived','deleted','merged'].includes(l.status)&&Date.parse(l.created_at)>=from&&Date.parse(l.created_at)<=now);
 let crm:null|{leads:number;open:number;won:number;lost:number;wonCents:number;openCents:number;ticketCents:number|null;winRate:number|null}=null;
 if(leads&&stages){
  const won=cohort.filter(l=>classifyDashboardLead(l,stageNames.get(l.stage_id))==='won');const lost=cohort.filter(l=>classifyDashboardLead(l,stageNames.get(l.stage_id))==='lost');const open=cohort.filter(l=>classifyDashboardLead(l,stageNames.get(l.stage_id))==='open');
  const sum=(rows:any[])=>rows.reduce((s,l)=>s+Math.round(Number(l.value??0)*100),0);
  crm={leads:cohort.length,open:open.length,won:won.length,lost:lost.length,wonCents:sum(won),openCents:sum(open),ticketCents:won.length?Math.round(sum(won)/won.length):null,winRate:won.length+lost.length?Math.round(10000*won.length/(won.length+lost.length))/100:null};
 }
 return {...result,workspaceId,issues,history:result.history.map(r=>({...r,leadName:names.get(r.leadId)||'Cliente não disponível'})),
  agents:agents&&agentRuns&&leads?aggregateAgentRuns(agentRuns,agents,leads,days,now):null,
  messages:messages?aggregateMessages(messages,from,now):null,
  groups:{count:groups?.length??null,engagementRate:null},crm};
}
