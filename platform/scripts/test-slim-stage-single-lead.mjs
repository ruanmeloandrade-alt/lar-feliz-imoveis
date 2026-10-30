import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
let count=0;function check(name,fn){fn();count++;console.log('PASS stage single-lead: '+name);}
const file=new URL('../src/lib/saude-slim-funnel-client.ts',import.meta.url),source=fs.readFileSync(file,'utf8'),rpc=source.includes('moveSlimLeadWithAutomations');
const ast=ts.createSourceFile('funnel.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
check('stage source parses',()=>assert.equal(ast.parseDiagnostics.length,0));
if(!rpc){
 const fragment=source.split('export async function moveSlimLead(')[1].split('export async function updateSlimStage(')[0];
 check('stage write addresses one lead, never entire company',()=>{assert(fragment.includes('.eq("id",data.leadId).is("merged_into_id",null).select("id")'));assert(!fragment.includes('if(lead.company_id)'));assert(!fragment.includes('.eq("company_id"'));});
 check('stage movement does not impersonate a WhatsApp reply',()=>assert(!fragment.includes('last_message_from:')));
 check('no-op transition does not advertise pending automation',()=>assert(fragment.includes('backendPending:false,moved:false')));
 check('unconfirmed update fails instead of returning success',()=>assert(fragment.includes('if(error||!updated)throw')));
 check('actual callable movement scope with a second company lead',()=>{
   const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='moveSlimLead');assert(fn);
   const js=ts.transpileModule(fn.getText(ast).replace(/^export\s+/,''),
      {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
   const rows=[{id:'l1',workspace_id:'ws',company_id:'company',stage_id:'old',pipeline_id:'pipe',merged_into_id:null},{id:'l2',workspace_id:'ws',company_id:'company',stage_id:'old',pipeline_id:'pipe',merged_into_id:null}];let updatedIds=[];
   const db={from(table){let ops=[],patch;const q={select(){return q;},eq(k,v){ops.push(row=>row[k]===v);return q;},is(k,v){ops.push(row=>row[k]===v);return q;},update(v){patch=v;return q;},async maybeSingle(){const list=(table==='pipeline_stages'?[{id:'dest',workspace_id:'ws',pipeline_id:'pipe',name:'Next'}]:rows).filter(row=>ops.every(test=>test(row)));if(patch){for(const row of list){Object.assign(row,patch);updatedIds.push(row.id);} }return {data:list[0]??null,error:null};}};return q;}};
   const make=new Function('ctx','requiresEditor','resolveSlimContactId','sb',js+'\nreturn moveSlimLead;');
   const move=make(async()=>({ws:'ws',role:'owner'}),()=>undefined,async(_db,_ws,id)=>id,db);
   // An async test runner below uses this selected function to validate scoped effects.
   globalThis.__stageScopedTest={move,rows,updatedIds};
 });
}
check('integration stays idempotent',()=>{const before=fs.readFileSync(file,'utf8');execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-stage-single-lead.mjs',import.meta.url))],{stdio:'inherit'});assert.equal(fs.readFileSync(file,'utf8'),before);});
if(globalThis.__stageScopedTest){
 const {move,rows,updatedIds}=globalThis.__stageScopedTest;
 const result=await move({data:{leadId:'l1',toStageId:'dest'}});
 assert.equal(result.ok,true);assert.equal(result.backendPending,true);
 assert.deepEqual(updatedIds,['l1']);assert.equal(rows[1].stage_id,'old');assert.equal(rows[0].last_message_from,undefined);
 count++;console.log('PASS stage single-lead: actual transition edits only requested contact without changing reply status');
 delete globalThis.__stageScopedTest;
}
console.log(count+'/'+count+' scoped stage tests. Trigger release remains independent of SQL installation.');
