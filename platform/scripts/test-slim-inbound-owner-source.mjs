import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// This import also executes the 40 core/guard tests, exactly once in this gate.
import {fixture} from './test-slim-inbound-owner.mjs';
import {routeInboundAgentOwnership,waitingEventsAcceptInbound} from '../src/lib/slim-inbound-owner.core.ts';
import {withSalesbotGuard} from '../src/lib/inbox-automation-guards.server.ts';
const root=new URL('../',import.meta.url),runtimePath=new URL('src/lib/salesbot-runtime.server.ts',root);
const source=fs.readFileSync(runtimePath,'utf8');
const ast=ts.createSourceFile('runtime.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS inbound source: '+name);}
function extract(names,deps){
 const declarations=names.map(name=>{const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(fn,name+' exists');return fn.getText(ast).replace(/^export\s+/,'');}).join('\n');
 const js=ts.transpileModule(declarations,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function(...Object.keys(deps),js+'\nreturn {'+names.join(',')+'};')(...Object.values(deps));
}
function actual(f){
 const from=f.db.from;f.db.from=table=>{const q=from(table);q.is=q.eq;return q;};
 const effects={turn:0,execute:[],globals:0,claims:0};
 const deps={routeInboundAgentOwnership,waitingEventsAcceptInbound,withSalesbotGuard,
  normalizeButtonText:s=>String(s).trim().toLowerCase(),
  claimSalesbotAiTurn:async(db,p)=>{effects.claims++;const row=f.rows.salesbot_runs.find(r=>r.id===p.runId&&r.workspace_id===p.workspaceId&&r.status==='waiting_message');if(!row)return false;row.status='running';return true;},
  runAiAgentTurn:async()=>{effects.turn++;f.onTurn?.();return f.turnResult??{reply:'controlled',handoff:false};},
  executeRun:async(db,r)=>{effects.execute.push(r.id);},
  loadActiveBotsWithGatilhos:async()=>{effects.globals++;return [];},
 };
 return {...extract(['resumeRunsOnInboundMessage','dispatchInboundMessage'],deps),effects,deps};
}
await test('full transformed runtime has valid TypeScript syntax',()=>assert.equal(ast.parseDiagnostics.length,0));
await test('new shared modules pass isolated TypeScript checking',()=>{const program=ts.createProgram(['src/lib/slim-inbound-owner.core.ts','src/lib/inbox-automation-guards.server.ts'].map(p=>fileURLToPath(new URL(p,root))),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,skipLibCheck:true,noEmit:true,types:['node']});const diagnostics=ts.getPreEmitDiagnostics(program);assert.equal(diagnostics.length,0,diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));});
await test('actual dispatcher plus resumed IA calls model once',async()=>{const f=fixture();f.addRun();const a=actual(f);await a.dispatchInboundMessage(f.db,{workspaceId:'ws',leadId:'lead',text:'Olá'});assert.equal(a.effects.turn,1);assert.equal(a.effects.globals,0);assert.equal(f.rows.salesbot_runs[0].status,'waiting_message');});
await test('actual IA run finishing cannot cause direct re-entry',async()=>{const f=fixture();const row=f.addRun({current_block_id:null,variables:{ia_agent_id:'agent',ia_max_turnos:1}});const a=actual(f);await a.dispatchInboundMessage(f.db,{workspaceId:'ws',leadId:'lead',text:'Fim'});assert.equal(row.status,'finished');assert.equal(a.effects.turn,1);assert.equal(a.effects.globals,0);});
await test('failed IA turn cannot spend a turn or advance the bot',async()=>{const f=fixture();const row=f.addRun({current_block_id:null,variables:{ia_agent_id:'agent',ia_max_turnos:1,ia_turns_used:0}});f.turnResult={reply:'',handoff:true,error:'controlled'};const a=actual(f);await a.dispatchInboundMessage(f.db,{workspaceId:'ws',leadId:'lead',text:'Teste'});assert.equal(row.status,'waiting_message');assert.equal(row.variables.ia_turns_used,0);assert(row.variables.ia_last_turn_error);assert.equal(a.effects.execute.length,0);assert.equal(a.effects.turn,1);});
await test('failed turn never resurrects a stopped run',async()=>{const f=fixture();const row=f.addRun();f.onTurn=()=>{row.status='finished';row.stopped_at='now';};f.turnResult={reply:'',handoff:false,error:'stopped'};const a=actual(f);await a.dispatchInboundMessage(f.db,{workspaceId:'ws',leadId:'lead',text:'Teste'});assert.equal(row.status,'finished');assert.equal(row.stopped_at,'now');});
await test('actual resumer limits query to selected owner',async()=>{const f=fixture();f.addRun();f.addRun({id:'other'});const a=actual(f);let claimed=[];await a.resumeRunsOnInboundMessage(f.db,{workspaceId:'ws',leadId:'lead',text:'Oi',onlyRunId:'run',onAgentClaimed:id=>claimed.push(id)});assert.deepEqual(claimed,['run']);assert.equal(a.effects.claims,1);assert.equal(a.effects.turn,1);});
await test('actual button answer resumes existing cable',async()=>{const f=fixture();f.rows.leads[0].active_conversation_agent_id=null;const row=f.addRun({current_block_id:'button',variables:{salesbot_waiting_branch:{waitingEvents:[{type:'botao-clicado',options:[{label:'Sim',nextBlockId:'next'}]}]}}});const a=actual(f);await a.resumeRunsOnInboundMessage(f.db,{workspaceId:'ws',leadId:'lead',text:'Sim'});assert.deepEqual(a.effects.execute,['run']);assert.equal(row.current_block_id,'next');});
await test('actual resumer leaves form wait untouched',async()=>{const f=fixture();f.addRun({variables:{salesbot_waiting_branch:{waitingEvents:[{type:'formulario-enviado'}]}}});const a=actual(f);await a.resumeRunsOnInboundMessage(f.db,{workspaceId:'ws',leadId:'lead',text:'Oi'});assert.equal(a.effects.turn,0);assert.equal(a.effects.execute.length,0);assert.equal(f.writes.length,0);});
await test('actual loader ignores disabled agents and keeps workspace scope',async()=>{const f=fixture();f.rows.conversation_ai_agents[0].enabled=false;const a=extract(['loadConversationAgent'],{projectPromptAgent:a=>a});assert.equal(await a.loadConversationAgent(f.db,'ws','agent'),null);f.rows.conversation_ai_agents[0].enabled=true;assert.equal((await a.loadConversationAgent(f.db,'ws','agent')).id,'agent');assert.equal(await a.loadConversationAgent(f.db,'other','agent'),null);});
await test('actual loader read errors cannot impersonate missing agent',async()=>{const f=fixture();f.failures.conversation_ai_agents=true;const a=extract(['loadConversationAgent'],{projectPromptAgent:a=>a});await assert.rejects(a.loadConversationAgent(f.db,'ws','agent'),/carregar/);});
await test('model wrapper passes requested identity and dispatch version to fence',async()=>{let received;const a=extract(['runAiAgentTurn'],{withAgentGuard:async(...args)=>{received=args;return {reply:'',handoff:false};},runAiAgentTurnUnchecked:async()=>{throw new Error('Not expected');}});await a.runAiAgentTurn({},'ws','lead','phone','agent','text',2);assert.equal(received[4],'agent');assert.equal(received[5],2);});
await test('new and earlier guard transforms preserve all three real consumers',()=>{
 const targets=['src/lib/salesbot-runtime.server.ts','src/server.ts','src/lib/inbox-group-salesbot.functions.ts'];
 const read=p=>fs.readFileSync(new URL(p,root),'utf8');const before=targets.map(read);
 for(const file of ['apply-slim-inbound-owner.mjs','apply-inbox-automation-contract.mjs'])execFileSync(process.execPath,[fileURLToPath(new URL(file,import.meta.url))],{stdio:'inherit'});
 assert.deepEqual(targets.map(read),before);assert.equal(read(targets[0]),source);
 const server=read('src/server.ts');
 assert.equal([...server.matchAll(/\bconst\s*\{\s*ensureInboxAutomationWorker\s*\}/g)].length,1);
 assert.equal([...server.matchAll(/\bensureInboxAutomationWorker\(\s*\)\s*;/g)].length,1);
 for(const path of targets)assert.equal(ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS).parseDiagnostics.length,0,path);
});
console.log(`${passed}/${passed} actual inbound source checks passed; isolated module typecheck included. No authenticated browser or live provider test claimed.`);
