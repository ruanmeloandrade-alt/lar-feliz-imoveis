import fs from 'node:fs';
import ts from 'typescript';
const target=new URL('../src/lib/salesbot-runtime.server.ts',import.meta.url);
const marker='// SLIM_INBOUND_OWNER_V1';
export function patchInboundOwnership(input){
 if(input.includes(marker))return input;
 let code=input;
 const once=(text,a,b)=>{if(text.split(a).length!==2)throw new Error('[Inbound ownership] Missing or ambiguous anchor: '+a.slice(0,100));return text.replace(a,()=>b);};
 const section=(start,end,fn)=>{const i=code.indexOf(start),j=code.indexOf(end,i+start.length);if(i<0||j<0||code.split(start).length!==2)throw new Error('[Inbound ownership] Missing section '+start);code=code.slice(0,i)+fn(code.slice(i,j))+code.slice(j);};
 code='import { routeInboundAgentOwnership, waitingEventsAcceptInbound, type InboundResumeOptions } from "./slim-inbound-owner.core";\n'+code;
 section('async function loadConversationAgent(', 'async function assignConversationAgent(',part=>{
  part=once(part,'  const { data } = await supabaseAdmin.from("conversation_ai_agents")','  const { data, error } = await supabaseAdmin.from("conversation_ai_agents")');
  part=once(part,'    .eq("id", agentId)\n    .maybeSingle();','    .eq("id", agentId)\n    .eq("enabled", true)\n    .maybeSingle();\n  if (error) throw new Error("Não foi possível carregar o Agente IA desta empresa.");');
  return part;
 });
 section('export async function dispatchInboundMessage(', 'export async function dispatchStageChange(',part=>{
  const start='  await resumeRunsOnInboundMessage(supabaseAdmin, params);';
  const end='  const bots = await loadActiveBotsWithGatilhos(supabaseAdmin, params.workspaceId);';
  const i=part.indexOf(start),j=part.indexOf(end,i);
  if(i<0||j<0||part.split(start).length!==2)throw new Error('[Inbound ownership] Dispatcher prefix changed');
  return part.slice(0,i)+`  const owned = await routeInboundAgentOwnership(supabaseAdmin, params, {
    resume: (options) => resumeRunsOnInboundMessage(supabaseAdmin, { ...params, ...options }),
    turn: (owner) => runAiAgentTurn(supabaseAdmin, params.workspaceId, params.leadId, owner.phone, owner.id, params.text, owner.version),
  });
  if (owned) return;

`+part.slice(j);
 });
 section('export async function resumeRunsOnInboundMessage(', 'export async function resumeRunsOnMediaEvent(',part=>{
  part=once(part,'params: { workspaceId: string; leadId: string; text: string; senderPhone?: string | null; senderName?: string | null },','params: { workspaceId: string; leadId: string; text: string; senderPhone?: string | null; senderName?: string | null } & InboundResumeOptions,');
  part=once(part,`  const { data: runs } = await supabaseAdmin.from("salesbot_runs")
    .select("id, variables")
    .eq("workspace_id", params.workspaceId)
    .eq("lead_id", params.leadId)
    .eq("status", "waiting_message");`, `  let inboundRunQuery = supabaseAdmin.from("salesbot_runs")
    .select("id, variables")
    .eq("workspace_id", params.workspaceId)
    .eq("lead_id", params.leadId)
    .eq("status", "waiting_message");
  if (params.onlyRunId) inboundRunQuery = inboundRunQuery.eq("id", params.onlyRunId);
  const { data: runs, error: inboundRunsError } = await inboundRunQuery;
  if (inboundRunsError) throw new Error("Não foi possível consultar as execuções aguardando mensagem.");`);
  const i=part.indexOf('    if (Array.isArray(configuredEvents)) {'),j=part.indexOf('    // --- Modo Agente IA:',i);
  if(i<0||j<0)throw new Error('[Inbound ownership] Waiting-event filter changed');
  part=part.slice(0,i)+'    if (!waitingEventsAcceptInbound(configuredEvents)) continue;\n'+part.slice(j);
  part=once(part,'      if (!claimedIa) continue;','      if (!claimedIa) continue;\n      params.onAgentClaimed?.(r.id);');
  part=once(part,'.select("phone").eq("id", params.leadId).maybeSingle();','.select("phone").eq("id", params.leadId).eq("workspace_id", params.workspaceId).maybeSingle();');
  part=once(part,'      const turn = await runAiAgentTurn(supabaseAdmin, params.workspaceId, params.leadId, phone, iaAgentId, params.text);',`      const turn = await withSalesbotGuard(supabaseAdmin, { id: r.id, workspace_id: params.workspaceId },
        () => runAiAgentTurn(supabaseAdmin, params.workspaceId, params.leadId, phone, iaAgentId, params.text));
      if (!turn) continue;`);
  part=once(part,'      const shouldHandoff = turn.handoff || (maxTurnos > 0 && usedNow >= maxTurnos);',`      if (turn.error) {
        const restored = await supabaseAdmin.from("salesbot_runs")
          .update({ status: "waiting_message", variables: { ...vars0, last_message: params.text, ia_last_turn_error: "O turno de IA não foi concluído. Verifique o agente antes de retomar." } })
          .eq("id", r.id).eq("workspace_id", params.workspaceId).eq("status", "running").is("stopped_at", null);
        if (restored.error) throw new Error("Não foi possível registrar a interrupção do turno de IA.");
        continue;
      }
      const shouldHandoff = turn.handoff || (maxTurnos > 0 && usedNow >= maxTurnos);`);
  part=once(part,'        const kept = { ...vars0, last_message: params.text, ia_turns_used: usedNow };','        const kept: Record<string, unknown> = { ...vars0, last_message: params.text, ia_turns_used: usedNow };\n        delete kept.ia_last_turn_error;');
  return part;
 });
 return code+'\n'+marker+'\n';
}
const before=fs.readFileSync(target,'utf8'),after=patchInboundOwnership(before);
const parsed=ts.createSourceFile('salesbot-runtime.server.ts',after,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
if(parsed.parseDiagnostics.length)throw new Error('[Inbound ownership] Runtime syntax invalid: '+parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
if(patchInboundOwnership(after)!==after)throw new Error('[Inbound ownership] Transformation is not idempotent');
if(before!==after)fs.writeFileSync(target,after);
console.log('[Inbound ownership] Runtime owner, enabled-agent filter, guarded resume and button-response filter integrated. No business data changed.');
