import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
function load(source,imports={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(name=>{assert(name in imports,'Unexpected dependency '+name);return imports[name];},module,module.exports);return module.exports;}
const identity=load(read('src/lib/whatsapp-identity.ts'));
const routing=load(read('src/lib/whatsapp-session-routing.server.ts'),{'@/lib/whatsapp-identity':identity});
const source=read('src/lib/salesbot-runtime.server.ts'),ast=ts.createSourceFile('runtime.ts',source,ts.ScriptTarget.Latest,true);
const fn=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='resolveRuntimeWhatsappTarget');assert(fn);
const runtime=load('import {findLatestLeadWhatsappIdentity,resolveLeadEvolutionSession} from "./routing";import {whatsappIdentityFromJid,normalizeInternationalPhone} from "./identity";\nexport '+fn.getText(ast),{'./routing':routing,'./identity':identity});
const sessions=['a','b','c'],phone='5599999999999',jid=phone+'@s.whatsapp.net';
function db(disconnected){return {from(table){let rows=table==='leads'?sessions.map(s=>({id:'lead-'+s,workspace_id:'w',custom_data:{whatsapp_session_id:s}})):table==='whatsapp_web_sessions'?sessions.filter(s=>s!==disconnected).map(s=>({id:s,workspace_id:'w',provider:'evolution',status:'conectado',last_connected_at:s})):table==='lead_activities'?sessions.flatMap(s=>[{lead_id:'lead-'+s,workspace_id:'w',type:'message_in',occurred_at:'2026-10-19T12:00:00Z',payload:{whatsapp_session_id:s==='a'?'b':'a',whatsapp_remote_jid:jid}},{lead_id:'lead-'+s,workspace_id:'w',type:'message_in',occurred_at:'2026-10-19T11:00:00Z',payload:{whatsapp_session_id:s,whatsapp_remote_jid:jid}}]):[];const q={select(){return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},in(k,values){rows=rows.filter(r=>values.includes(r[k]));return q;},order(k,{ascending}){rows.sort((a,b)=>(ascending?1:-1)*String(a[k]??'').localeCompare(String(b[k]??'')));return q;},limit(n){rows=rows.slice(0,n);return q;},or(){return q;},async maybeSingle(){return {data:rows[0]??null,error:null};},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve);}};return q;}};}
let checks=0;
for(const session of sessions){const target=await runtime.resolveRuntimeWhatsappTarget(db(),'w','lead-'+session,'+'+phone);assert.equal(target.sessionId,session);assert.equal(target.conversationKey,session+':'+jid);checks++;}
await assert.rejects(()=>runtime.resolveRuntimeWhatsappTarget(db('a'),'w','lead-a','+'+phone),/sessão correta/);checks++;
const stage=read('src/lib/stage-automation-engine.server.ts');assert(stage.includes('sendWhatsappText(admin as never, lead.workspaceId, lead.phone, text, lead.whatsappSessionId)'));checks++;
assert(stage.includes('.eq("session_id", lead.whatsappSessionId)'));checks++;
assert(!source.includes('else sessionQuery = sessionQuery.order("last_connected_at", { ascending: false }).limit(1)'));checks++;
const consumers=['src/routes/api/public/evolution/webhook.$secret.ts','src/lib/leads.functions.legacy.ts','src/lib/whatsapp-session-routing.server.ts','src/lib/salesbot-runtime.server.ts','src/components/inbox/InboxPage.legacy.tsx','src/lib/stage-automation-engine.server.ts','src/lib/slim-audience-runtime.server.ts'];
for(const path of consumers){const code=read(path);assert(code.includes('SLIM_WHATSAPP_ORIGIN_V1'));assert.equal(ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS).parseDiagnostics.length,0);checks++;}
console.log(`PASS WhatsApp origin runtime: ${checks} checks, actual bot routing source with three sessions and disconnected-origin blocking. No messages or providers called.`);
