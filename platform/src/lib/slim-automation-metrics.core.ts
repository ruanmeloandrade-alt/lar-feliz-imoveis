export const ACTIVE_BOT_STATES = ['running', 'waiting_timer', 'waiting_message'] as const;
export type BotDefinition = { id: string; local_id?: string | null; name: string; scope?: string | null };
export type BotRun = { id: string; salesbot_id: string; lead_id: string; status: string; started_at: string; finished_at?: string | null; stopped_at?: string | null; last_error?: string | null };
export type Purchase = { id: string; lead_id: string; kind?: string; sold_at: string | null };
export type BotMetrics = { id: string; localId: string; name: string; scope: string; launched: number; activeNow: number; finished: number; failed: number; stopped: number; converted: number | null; conversionRate: number | null; completionRate: number | null };
export const CONVERSION_RULE = 'Compras registradas são atribuídas à última execução do SalesBot iniciada para o mesmo cliente nos 30 dias anteriores à compra. Cada execução conta no máximo uma conversão. Concluir o fluxo não significa vender. O período filtra o início das execuções; sessões ativas são a situação atual.';
const DAY = 86400000;
function date(value: unknown): number { return typeof value === 'string' ? Date.parse(value) : Number.NaN; }
function distinct<T extends {id:string}>(rows: T[]): T[] { return [...new Map(rows.map(row=>[row.id,row])).values()]; }
export function metricPercent(numerator: number, denominator: number): number | null { return denominator > 0 ? Math.round(numerator * 10000 / denominator) / 100 : null; }
export function classifyBotRun(run: BotRun): 'active'|'finished'|'failed'|'stopped'|'other' {
  if (run.stopped_at || ['cancelled','canceled','stopped'].includes(run.status)) return 'stopped';
  if (['error','failed'].includes(run.status)) return 'failed';
  if (run.status === 'finished') return 'finished';
  if (!run.finished_at && (ACTIVE_BOT_STATES as readonly string[]).includes(run.status)) return 'active';
  return run.last_error ? 'failed' : 'other';
}
export function aggregateBotMetrics(args: { bots: BotDefinition[]; runs: BotRun[]; purchases: Purchase[] | null; days: number | null; now?: number }) {
  const now = args.now ?? Date.now();
  if (!Number.isFinite(now) || (args.days !== null && (!Number.isInteger(args.days)||args.days<1||args.days>365))) throw new Error('Período inválido para as métricas.');
  const from = args.days === null ? -Infinity : now - args.days*DAY;
  const runs = distinct(args.runs).filter(r=>Number.isFinite(date(r.started_at))&&date(r.started_at)<=now);
  const inPeriod = runs.filter(r=>date(r.started_at)>=from);
  const byLead = new Map<string,BotRun[]>();
  for (const r of runs) { const list=byLead.get(r.lead_id)??[];list.push(r);byLead.set(r.lead_id,list); }
  for (const list of byLead.values()) list.sort((a,b)=>date(b.started_at)-date(a.started_at)||b.id.localeCompare(a.id));
  const conversions = new Set<string>();
  if (args.purchases !== null) for (const sale of distinct(args.purchases)) {
    const at=date(sale.sold_at);
    if (!Number.isFinite(at)||at>now||(sale.kind && sale.kind!=='comprou')) continue;
    const run=(byLead.get(sale.lead_id)??[]).find(r=>date(r.started_at)<=at&&at-date(r.started_at)<=30*DAY);
    if(run) conversions.add(run.id);
  }
  const result=new Map<string,BotMetrics>();
  const ensure=(id:string,bot?:BotDefinition)=>{
    let m=result.get(id);
    if(!m){m={id,localId:bot?.local_id||id,name:bot?.name||'Bot não disponível',scope:bot?.scope||'individual',launched:0,activeNow:0,finished:0,failed:0,stopped:0,converted:args.purchases===null?null:0,conversionRate:null,completionRate:null};result.set(id,m);}return m;
  };
  for(const b of distinct(args.bots)) ensure(b.id,b);
  for(const r of runs) if(classifyBotRun(r)==='active') ensure(r.salesbot_id).activeNow++;
  for(const r of inPeriod){const m=ensure(r.salesbot_id);m.launched++;const state=classifyBotRun(r);if(state==='finished')m.finished++;if(state==='failed')m.failed++;if(state==='stopped')m.stopped++;if(m.converted!==null&&conversions.has(r.id))m.converted++;}
  const bots=[...result.values()].map(m=>({...m,conversionRate:m.converted===null?null:metricPercent(m.converted,m.launched),completionRate:metricPercent(m.finished,m.finished+m.failed)}));
  const totals={launched:0,activeNow:0,finished:0,failed:0,stopped:0,converted:args.purchases===null?null:0 as number|null,conversionRate:null as number|null,completionRate:null as number|null};
  for(const m of bots){totals.launched+=m.launched;totals.activeNow+=m.activeNow;totals.finished+=m.finished;totals.failed+=m.failed;totals.stopped+=m.stopped;if(totals.converted!==null)totals.converted+=m.converted??0;}
  totals.conversionRate=totals.converted===null?null:metricPercent(totals.converted,totals.launched);
  totals.completionRate=metricPercent(totals.finished,totals.finished+totals.failed);
  return {bots,totals,history:inPeriod.sort((a,b)=>date(b.started_at)-date(a.started_at)||a.id.localeCompare(b.id)).slice(0,100).map(r=>({id:r.id,botId:r.salesbot_id,leadId:r.lead_id,status:r.status,state:classifyBotRun(r),startedAt:r.started_at,finishedAt:r.finished_at??null,converted:args.purchases===null?null:conversions.has(r.id)})),historyTotal:inPeriod.length,observedAt:new Date(now).toISOString(),days:args.days,conversionRule:CONVERSION_RULE};
}
export function aggregateMessages(rows: Array<{id:string;message_id?:string|null;session_id?:string|null;from_me:boolean;remote_jid:string;delivery_status?:string|null;received_at:string}>,from:number,now:number) {
  const accepted=new Set(['sent','delivered','read','played','server_ack','device_ack']);
  const unique=new Map<string,(typeof rows)[number]>();
  for(const r of rows){const at=date(r.received_at);if(!Number.isFinite(at)||at<from||at>now||!r.from_me||!accepted.has(r.delivery_status??'')||r.remote_jid==='status@broadcast')continue;unique.set(r.message_id?`${r.session_id??''}:${r.message_id}`:r.id,r);}
  const sent=[...unique.values()];return {sent:sent.length,groupSent:sent.filter(r=>r.remote_jid.endsWith('@g.us')).length,directSent:sent.filter(r=>r.remote_jid.endsWith('@s.whatsapp.net')||r.remote_jid.endsWith('@lid')).length};
}
export function aggregateAgentRuns(runs:Array<{id:string;agent_id:string;lead_id:string;started_at:string;interactions_count:number;objective_reached:boolean;objective_reached_at?:string|null}>,agents:Array<{id:string;name:string}>,activeLeads:Array<{id:string;active_conversation_agent_id:string|null;ai_paused:boolean;merged_into_id?:string|null}>,days:number|null,now=Date.now()) {
  const from=days===null?-Infinity:now-days*DAY;
  const period=distinct(runs).filter(r=>Number.isFinite(date(r.started_at))&&date(r.started_at)>=from&&date(r.started_at)<=now);
  const ids=new Set([...agents.map(a=>a.id),...period.map(r=>r.agent_id),...activeLeads.filter(l=>l.active_conversation_agent_id&&!l.ai_paused&&!l.merged_into_id).map(l=>l.active_conversation_agent_id!)]);
  const rows=[...ids].map(id=>{const rs=period.filter(r=>r.agent_id===id);return {id,name:agents.find(a=>a.id===id)?.name??'Agente não disponível',runs:rs.length,interactions:rs.reduce((n,r)=>n+Math.max(0,Number(r.interactions_count)||0),0),objectives:rs.filter(r=>r.objective_reached&&(!r.objective_reached_at||date(r.objective_reached_at)<=now)).length,activeNow:activeLeads.filter(l=>l.active_conversation_agent_id===id&&!l.ai_paused&&!l.merged_into_id).length};});
  return {rows,totals:rows.reduce((s,r)=>({runs:s.runs+r.runs,interactions:s.interactions+r.interactions,objectives:s.objectives+r.objectives,activeNow:s.activeNow+r.activeNow}),{runs:0,interactions:0,objectives:0,activeNow:0})};
}
