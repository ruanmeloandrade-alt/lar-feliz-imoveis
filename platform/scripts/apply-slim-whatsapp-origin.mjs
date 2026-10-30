import fs from 'node:fs';
import ts from 'typescript';
const root=new URL('../',import.meta.url),marker='// SLIM_WHATSAPP_ORIGIN_V1',plans=[];
function edit(path,changes){let code=fs.readFileSync(new URL(path,root),'utf8');if(code.includes(marker))return;for(const [before,after]of changes){const n=code.split(before).length-1;if(n!==1)throw new Error(`WhatsApp origin ${path}: expected one anchor, got ${n}: ${before.slice(0,80)}`);code=code.replace(before,after);}plans.push([path,code+'\n'+marker+'\n']);}
edit('src/routes/api/public/evolution/webhook.$secret.ts',[
 ['findSlimContact(supabaseAdmin as never,sess.workspace_id,phone);','findSlimContact(supabaseAdmin as never,sess.workspace_id,phone,sess.session_id);'],
]);
edit('src/lib/leads.functions.legacy.ts',[
 ['const rawPhone = identity.digits;','if (!m.session_id) continue;\n      const rawPhone = m.session_id + ":" + identity.digits;'],
 ['        if (id) seenById.add(id);','        if (id) seenById.add(String(a.payload?.whatsapp_session_id ?? a.payload?.session_id ?? "")+":"+id);'],
 ['        if (seenById.has(m.message_id)) continue;','        if (seenById.has(m.session_id+":"+m.message_id)) continue;'],
 ['        seenById.add(m.message_id);','        seenById.add(m.session_id+":"+m.message_id);'],
 ['export interface LeadConversationRow {','export interface LeadConversationRow {\n  whatsappSessionId?: string | null;\n  whatsappOrigin?: string | null;'],
 ['id, name, email, phone, last_message_from, conversation_status, tags, external_id, updated_at, stage_id, company_id, pipeline_stages(name), crm_sources(provider, display_name)','id, name, email, phone, custom_data, last_message_from, conversation_status, tags, external_id, updated_at, stage_id, company_id, pipeline_stages(name), crm_sources(provider, display_name)'],
 ['    company_id: string | null;\n    pipeline_stages:', '    company_id: string | null;\n    custom_data?: Record<string, unknown> | null;\n    pipeline_stages:'],
 ['  const conversations: LeadConversationRow[] = sourceRows.map((row) => {', `  const originIds = [...new Set(sourceRows.map(row => row.custom_data?.whatsapp_session_id).filter((id): id is string => typeof id === "string" && !!id))];
  const origins = originIds.length ? await sb.from("whatsapp_web_sessions").select("id,phone_number,status").eq("workspace_id",wsId).in("id",originIds) : {data:[],error:null};
  const originMap = new Map<string, {phone_number:string|null;status:string|null}>((origins.data??[]).map((s:any)=>[s.id,s]));
  const conversations: LeadConversationRow[] = sourceRows.map((row) => {`],
 ['      sourceProvider: row.crm_sources?.provider ?? "mkton",', `      sourceProvider: row.crm_sources?.provider ?? "mkton",
      whatsappSessionId: typeof row.custom_data?.whatsapp_session_id === "string" ? row.custom_data.whatsapp_session_id : null,
      whatsappOrigin: (() => {const id=row.custom_data?.whatsapp_session_id;if(typeof id!=="string")return null;const s=originMap.get(id);return s?.phone_number ? "+"+s.phone_number.replace(/\\D/g,"")+(s.status==="conectado"?"":" · desconectado") : "Origem não identificada";})(),`],
]);
edit('src/components/inbox/InboxPage.legacy.tsx',[
 ['          sourceProvider: c.sourceProvider,','          sourceProvider: c.sourceProvider,\n          whatsappSessionId: c.whatsappSessionId,\n          whatsappOrigin: c.whatsappOrigin,'],
 ['        {conv.subtitle && (','        {conv.whatsappOrigin && <div className="mt-1 truncate text-[10px] font-semibold text-emerald-600">WhatsApp de origem: {conv.whatsappOrigin}</div>}\n        {conv.subtitle && ('],
 ['import { useMemo, useState, useRef, useEffect } from "react";','import { useMemo, useState, useRef, useEffect } from "react";\nimport { LeadWhatsappOrigin } from "@/components/inbox/LeadWhatsappOrigin";'],
 ['            <StatusLabel status={conversation.status} subtitle={leadSubtitle} />\n          </div>', `            <StatusLabel status={conversation.status} subtitle={leadSubtitle} />
          </div>
          {isLead && cacheScope && <LeadWhatsappOrigin leadId={conversation.id} workspaceId={cacheScope.workspaceId} actorId={cacheScope.userId} />}`],
]);
edit('src/lib/whatsapp-session-routing.server.ts',[
 ['input: { workspaceId: string; leadId: string; phone?: string | null },','input: { workspaceId: string; leadId: string; phone?: string | null; preferredSessionId?: string | null },'],
 ['    if (identity) {','    if (input.preferredSessionId && sessionId !== input.preferredSessionId) continue;\n    if (identity) {'],
 ['    if (!identity) continue;','    if (!identity) continue;\n    if (input.preferredSessionId && row.session_id !== input.preferredSessionId) continue;'],
 ['    phone: input.phone,','    phone: input.phone,\n    preferredSessionId: input.preferredSessionId,'],
 ['preferredSessionId: conversation.sessionId ?? input.preferredSessionId ?? null,','preferredSessionId: input.preferredSessionId ?? conversation.sessionId ?? null,'],
]);
edit('src/lib/salesbot-runtime.server.ts',[
 ['findLatestLeadWhatsappIdentity(supabaseAdmin, { workspaceId, leadId });','findLatestLeadWhatsappIdentity(supabaseAdmin, { workspaceId, leadId, phone: fallbackPhone, preferredSessionId });'],
 ['preferredSessionId: conversation.sessionId ?? preferredSessionId,','preferredSessionId: preferredSessionId ?? conversation.sessionId,'],
 ['    const { data: lastMessage } = await lastMessageQuery','    if (preferredSessionId) lastMessageQuery = lastMessageQuery.eq("session_id", preferredSessionId);\n    const { data: lastMessage } = await lastMessageQuery'],
 ['preferredSessionId: messageSessionId ?? preferredSessionId,','preferredSessionId: preferredSessionId ?? messageSessionId,'],
]);
edit('src/lib/stage-automation-engine.server.ts',[
 ['sendWhatsappText(admin as never, lead.workspaceId, lead.phone, text);','sendWhatsappText(admin as never, lead.workspaceId, lead.phone, text, lead.whatsappSessionId);'],
 ['      if (lead.phone) {\n        await admin\n          .from("whatsapp_web_messages")','      if (lead.phone && lead.whatsappSessionId) {\n        await admin\n          .from("whatsapp_web_messages")'],
 ['          .eq("sender_phone", lead.phone.replace(/\\D/g, ""));','          .eq("sender_phone", lead.phone.replace(/\\D/g, "")).eq("session_id", lead.whatsappSessionId);'],
]);
edit('src/lib/slim-audience-runtime.server.ts',[
 ['  const c=item.campaign;','  const c=item.campaign;\n  let originSessionId=item.origin_session_id??c.session_id;'],
 ['   session:async()=>{','   session:async(lead)=>{\n    originSessionId=lead.custom_data?.whatsapp_session_id??originSessionId;'],
 [".eq('id',c.session_id).eq('workspace_id',c.workspace_id)",".eq('id',originSessionId).eq('workspace_id',c.workspace_id)"],
 ["    return checked(await db.rpc('get_evolution_credentials_service',{_session_id:c.session_id,_key:key}),'credentials');","    return {...checked(await db.rpc('get_evolution_credentials_service',{_session_id:originSessionId,_key:key}),'credentials'),id:originSessionId};"],
 ['session_id:c.session_id,remote_jid:jid','session_id:originSessionId,remote_jid:jid'],
]);
// Transport without an explicit source must never select the most recently connected account.
const runtimePlan=plans.find(([p])=>p==='src/lib/salesbot-runtime.server.ts');
if(runtimePlan)runtimePlan[1]=runtimePlan[1].replaceAll('else sessionQuery = sessionQuery.order("last_connected_at", { ascending: false }).limit(1);','else sessionQuery = sessionQuery.order("last_connected_at", { ascending: false });');
for(const [path,code]of plans){const parsed=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true);if(parsed.parseDiagnostics.length)throw new Error('Invalid WhatsApp origin source: '+path);}
for(const [path,code]of plans)fs.writeFileSync(new URL(path,root),code);
console.log('WhatsApp origin: '+plans.length+' source consumers patched. No messages sent or sessions modified.');
