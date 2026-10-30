import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import * as tz from 'date-fns-tz';
import React from 'react';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
function load(path,deps={},extra=''){const m={exports:{}};Function('require','module','exports','React',compile(read(path)+extra))(name=>{assert(name in deps,'Unexpected import '+name);return deps[name]},m,m.exports,React);return m.exports;}
const crm=load('src/lib/crm-mock.ts');
const core=load('src/lib/stage-execution.core.ts',{'date-fns-tz':tz,'./crm-mock':crm});
const engine=load('src/lib/stage-automation-engine.server.ts',{'@/lib/crm-mock':crm,'@/lib/forms.functions':{},'date-fns-tz':tz,'./stage-execution.core':core,'./slim-operation-errors.core':{slimSafeOperationalError:e=>e?.message??String(e)}});
const pg=new PGlite();
const ws='c49945db-1960-461a-9339-a43b8403bdd9',pipeline='00000000-0000-4000-8000-000000000001',stage='00000000-0000-4000-8000-000000000002',otherStage='00000000-0000-4000-8000-000000000003',field='00000000-0000-4000-8000-000000000004';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
await pg.exec(`create table workspaces(id uuid primary key,business_hours jsonb);create table leads(id uuid primary key,workspace_id uuid,pipeline_id uuid,stage_id uuid,crm_source_id uuid,responsible_id uuid,name text,email text,phone text,value numeric,tags jsonb,custom_data jsonb,ai_paused boolean,updated_at timestamptz);
create table lead_custom_fields(id uuid primary key,name text);create table lead_custom_field_values(workspace_id uuid,lead_id uuid,field_id uuid,value jsonb);
create table crm_stage_automations(id uuid default gen_random_uuid(),workspace_id uuid,pipeline_id uuid,stage_id uuid,action_id text,action jsonb,enabled boolean,position integer default 0);
create table crm_automation_jobs(id uuid default gen_random_uuid() primary key,workspace_id uuid,lead_id uuid,pipeline_id uuid,stage_id uuid,action_id text,action jsonb,context jsonb,due_at timestamptz,status text,attempts integer default 0,last_error text,executed_at timestamptz,unique(workspace_id,dedupe_key),dedupe_key text);
create table lead_activities(id uuid default gen_random_uuid(),workspace_id uuid,lead_id uuid,type text,payload jsonb,occurred_at timestamptz);`);
await pg.query('insert into workspaces values($1,$2)',[ws,{timezone:'America/Sao_Paulo'}]);
for(let n=100;n<103;n++)await pg.query('insert into leads(id,workspace_id,pipeline_id,stage_id,name,tags,custom_data) values($1,$2,$3,$4,$5,$6,$7)',[id(n),ws,pipeline,stage,'QA '+n,['qa'],{utm_source:'qa'}]);
await pg.query('insert into lead_custom_fields values($1,$2)',[field,'Agenda QA']);
const q=s=>'"'+s.replaceAll('"','""')+'"';
const col=s=>s.includes('->')?s.split(/(->>|->)/).map((x,i)=>i===0?q(x):i%2?x:"'"+x.replaceAll("'","''")+"'").join(''):q(s);
const queries=[];let failJobs=false;
function from(table){let op='select',payload,fields='*',where=[],sort=[],range,limit,one=false,upsert;
 const api={select(s='*'){fields=s;return api},eq(c,v){where.push([c,'=',v]);return api},neq(c,v){where.push([c,'<>',v]);return api},lte(c,v){where.push([c,'<=',v]);return api},in(c,v){where.push([c,'in',v]);return api},order(c){sort.push(q(c));return api},range(a,b){range=[a,b];return api},limit(n){limit=n;return api},insert(v){op='insert';payload=v;return api},upsert(v,o){op='insert';payload=v;upsert=o;return api},update(v){op='update';payload=v;return api},maybeSingle(){one=true;return api},single(){one=true;return api},then(resolve,reject){return execute().then(resolve,reject)}};
 async function execute(){try{if(failJobs&&table==='crm_automation_jobs'&&op==='insert')throw Error('QA persistence failure');const params=[],add=v=>{params.push(v&&typeof v==='object'?JSON.stringify(v):v);return '$'+params.length};const conditions=where.map(([c,o,v])=>o==='in'?`${col(c)} in (${v.map(add).join(',')})`:`${col(c)} ${o} ${add(v)}`);const filter=conditions.length?' where '+conditions.join(' and '):'';let sql;
 if(op==='select'){let selection=fields.replace(/workspaces\(business_hours\)/g,`(select jsonb_build_object('business_hours',business_hours) from workspaces w where w.id=${q(table)}.workspace_id) as workspaces`).replace(/lead_custom_fields\(name\)/g,`(select jsonb_build_object('name',name) from lead_custom_fields f where f.id=${q(table)}.field_id) as lead_custom_fields`);sql=`select ${selection} from ${q(table)}${filter}${sort.length?' order by '+sort.join(','):''}${range?' limit '+(range[1]-range[0]+1)+' offset '+range[0]:limit?' limit '+limit:''}`;}
 else if(op==='insert'){const rows=Array.isArray(payload)?payload:[payload],keys=Object.keys(rows[0]);sql=`insert into ${q(table)}(${keys.map(q)}) values ${rows.map(r=>'('+keys.map(k=>add(r[k])).join(',')+')').join(',')}${upsert?' on conflict ('+upsert.onConflict.split(',').map(q).join(',')+') do nothing':''} returning *`;}
 else{sql=`update ${q(table)} set ${Object.entries(payload).map(([k,v])=>q(k)+'='+add(v)).join(',')}${filter} returning *`;}
 queries.push(sql);const result=await pg.query(sql,params);return{data:one?result.rows[0]??null:result.rows,error:null};}catch(e){return{data:null,error:{message:e.message,code:e.code}}}}
 return api;
}
const db={from,rpc:async(name,args)=>{assert.equal(name,'slim_claim_stage_job');return{data:(await pg.query("update crm_automation_jobs set status='running' where id=$1 and status='pending' and due_at<=now() returning *",[args._job_id])).rows,error:null}}};let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS pipeline QA: '+name)}
const base={id:'qa-action',triggerId:'pausar-ia',title:'QA',description:'',channel:'ia',enabled:true,config:{kind:'pausar-ia'},execution:{trigger:{kind:'created-or-moved'},active:'always'}};
async function register(action){await pg.query('delete from crm_stage_automations where action_id=$1',[action.id]);await pg.query('insert into crm_stage_automations(workspace_id,pipeline_id,stage_id,action_id,action,enabled) values($1,$2,$3,$4,$5,true)',[ws,pipeline,stage,action.id,action]);}
await test('all event gates accept their event and reject unrelated events',async()=>{
 for(const [kind,event] of [['created-or-moved','created'],['created-only','created'],['moved-only','moved'],['assignee-changed','assignee-changed'],['tag-added','tag-added'],['field-updated','field-updated'],['hours-before-field','field-updated'],['daily','created'],['exact-datetime','created']]){const a={...base,execution:{trigger:{kind}}};assert(engine.shouldRunForEvent(a,event));assert(!engine.shouldRunForEvent(a,'unrelated'));}
 assert(!engine.shouldRunForEvent({...base,execution:{trigger:{kind:'tag-added',tags:['yes']}}},'tag-added',{tags:['no']}));
 assert(!engine.shouldRunForEvent({...base,execution:{trigger:{kind:'field-updated',fieldId:field}}},'field-updated',{fieldId:'other'}));
});
await test('immediate action claims once, writes once and confirms done',async()=>{
 await register(base);const results=await engine.enqueueLeadAutomationEvent(db,{workspaceId:ws,leadId:id(100),event:'created',eventId:'qa-created'});assert(results[0].ok,JSON.stringify(results));
 assert.equal((await pg.query('select status from crm_automation_jobs')).rows[0].status,'done');
 await engine.enqueueLeadAutomationEvent(db,{workspaceId:ws,leadId:id(100),event:'created',eventId:'qa-created'});
 assert.equal(queries.filter(q=>q.startsWith('update "leads"')).length,1);
});
await test('apply existing paginates and retry never duplicates',async()=>{
 const a={...base,id:'qa-apply'};await register(a);const input={workspaceId:ws,pipelineId:pipeline,stageIds:[stage],action:a,requestId:'qa-request'};
 assert.equal((await engine.backfillAutomationAction(db,input)).queued,3);assert.equal((await engine.backfillAutomationAction(db,input)).queued,0);
 assert(queries.some(s=>s.includes('limit 500 offset 0')));
 failJobs=true;await assert.rejects(()=>engine.backfillAutomationAction(db,{...input,requestId:'fail'}),/persistence failure/);failJobs=false;
});
await test('apply uses daily and exact target times instead of firing immediately',async()=>{
 for(const trigger of [{kind:'daily',time:'09:00'},{kind:'exact-datetime',at:new Date(Date.now()+3_600_000).toISOString()}]){const a={...base,id:'qa-'+trigger.kind,execution:{trigger}};await register(a);await engine.backfillAutomationAction(db,{workspaceId:ws,pipelineId:pipeline,stageIds:[stage],action:a});const rows=(await pg.query('select due_at from crm_automation_jobs where action_id=$1',[a.id])).rows;assert.equal(rows.length,3);assert(rows.every(r=>Date.parse(r.due_at)>Date.now()+60_000));}
});
await test('recurring timers cover existing leads, remain unique and schedule next day',async()=>{
 await pg.query('delete from crm_stage_automations');const a={...base,id:'qa-recurring',execution:{trigger:{kind:'daily',time:'09:00'}}};await register(a);
 assert.equal(await engine.scheduleStageTimerActions(db,true),3);assert.equal(await engine.scheduleStageTimerActions(db,true),0);
 const realNow=Date.now,first=(await pg.query('select due_at from crm_automation_jobs where action_id=$1 limit 1',[a.id])).rows[0].due_at;
 Date.now=()=>Date.parse(first)+60_000;try{assert.equal(await engine.scheduleStageTimerActions(db,true),3)}finally{Date.now=realNow}
});
await test('rules honor configured timezone, business hours and overnight windows',async()=>{
 const lead={timezone:'America/Sao_Paulo',tags:[],customFields:[],businessHours:{days:Array.from({length:7},()=>({enabled:true,start:'20:00',end:'23:00'}))}};
 assert(core.stageInsideWindow({active:'always'},lead));assert(core.stageInsideWindow({active:'business-hours'},lead,Date.parse('2026-10-24T23:30Z')));
 assert(!core.stageInsideWindow({active:'business-hours'},lead,Date.parse('2026-10-24T13:00Z')));
 const exec={active:'custom',activeWindows:[{days:[5],from:'22:00',to:'02:00'}]};
 assert(core.stageInsideWindow(exec,lead,Date.parse('2026-10-24T04:00Z')));assert(!core.stageInsideWindow(exec,lead,Date.parse('2026-10-24T06:00Z')));
 assert.equal(new Date(core.stageDueAt({trigger:{kind:'daily',time:'09:00'}},lead,Date.parse('2026-10-24T11:00Z'))).toISOString(),'2026-10-24T12:00:00.000Z');
});
await test('responsible, source, UTM, tags, lists and custom-field conditions',async()=>{
 const l={tags:['A','B'],assigneeId:id(77),sourceId:'source',attributes:{utm_source:'qa'},customFields:[{id:field,name:'Campo',displayValue:'Sim'}]};
 for(const c of [{field:'assignee',value:id(77)},{field:'source',value:'source'},{field:'utm_source',value:'qa'},{field:'tag',value:'A'},{field:'custom-field',customFieldId:field,value:'Sim'}])assert(core.stageMatchesCondition({op:'eq',...c},l));
 assert(core.stageMatchesCondition({field:'tag',op:'in',value:'A,C'},l));assert(!core.stageMatchesCondition({field:'tag',op:'not-in',value:'A,C'},l));
 assert.equal(core.stageReminderTarget({trigger:{kind:'hours-before-field',fieldName:' campo ',hours:0}},l),'Sim');
});
await test('pipeline internal message persists note and private alert only to a member of the workspace',async()=>{
 await pg.exec('create table workspace_members(workspace_id uuid,user_id uuid,access_expires_at timestamptz);create table team_messages(id uuid default gen_random_uuid(),workspace_id uuid,to_user_id uuid,body text,origin text);delete from crm_stage_automations;');
 await pg.query('insert into workspace_members values($1,$2,null)',[ws,id(77)]);
 const a={...base,id:'qa-notify',triggerId:'msg-interna',config:{kind:'msg-interna',toUserId:id(77),mensagem:'QA private pipeline'}};await register(a);
 const result=await engine.enqueueLeadAutomationEvent(db,{workspaceId:ws,leadId:id(100),event:'created',eventId:'qa-notify'});assert(result[0].ok,JSON.stringify(result));
 const alerts=(await pg.query('select * from team_messages')).rows;assert.equal(alerts.length,1);assert.equal(alerts[0].to_user_id,id(77));assert.equal(alerts[0].origin,'salesbot');assert.equal((await pg.query("select count(*)::int n from lead_activities where type='note'")).rows[0].n,1);
 const denied={...a,id:'qa-denied',config:{...a.config,toUserId:id(88)}};await pg.exec('delete from crm_stage_automations');await register(denied);
 const failure=await engine.enqueueLeadAutomationEvent(db,{workspaceId:ws,leadId:id(100),event:'created',eventId:'qa-denied'});assert.equal(failure[0].ok,false);assert.equal((await pg.query('select count(*)::int n from team_messages')).rows[0].n,1);
});
await test('delay units preserve exact duration and leaving stage prevents execution',async()=>{
 for(const [minutes,ms] of [[30,1_800_000],[120,7_200_000],[1440,86_400_000]])assert.equal(core.stageDueAt({delayMinutes:minutes},undefined,1000),1000+ms);
 const a={...base,id:'qa-obsolete'};await register(a);await engine.backfillAutomationAction(db,{workspaceId:ws,pipelineId:pipeline,stageIds:[stage],action:a});
 await pg.query('update leads set stage_id=$1',[otherStage]);await engine.tickStageAutomationJobs(db,100);
 assert((await pg.query('select status from crm_automation_jobs where action_id=$1',[a.id])).rows.every(r=>r.status==='skipped'));
});

// Actual selector and timing component callbacks, with React state supplied by its parent.
const noop=()=>null;
const ui=load('src/components/crm/StageTriggerConfigPopover.tsx',{'react':React,'@tanstack/react-query':{useQuery:()=>({data:{sources:[],fields:[]}})},'@tanstack/react-router':{useNavigate:()=>noop},'@tanstack/react-start':{useServerFn:x=>x},'lucide-react':{},'@/components/ui/popover':{},'@/components/ui/dropdown-menu':{},'@/components/ui/input':{Input:'input'},'@/components/ui/button':{Button:'button'},'@/components/ui/switch':{},'@/components/ui/checkbox':{},'@/components/ui/badge':{},'@/lib/utils':{cn:(...s)=>s.filter(x=>typeof x==='string').join(' ')},'@/lib/crm-mock':crm,'@/lib/crm.functions':{},'@/lib/leads.functions':{}},'\nexport {ExecutionTiming,PickerSelect};');
function all(node,result=[]){if(!node||typeof node!=='object')return result;if(node.props){result.push(node);React.Children.forEach(node.props.children,c=>all(c,result))}return result}
await test('native unit selector persists minutes/hours/days without canonical reset',async()=>{
 let minutes=30,unit='minutes',spec={kind:'created-or-moved'};
 const render=()=>ui.ExecutionTiming({spec,delayMinutes:minutes,delayUnit:unit,customFields:[],onTriggerChange:s=>{spec=s},onDelayChange:(m,u,clear)=>{minutes=m;if(clear)unit=undefined;else if(u)unit=u}});
 for(const next of ['hours','days','minutes']){const picker=all(render()).find(n=>n.type===ui.PickerSelect&&n.props.options.some(x=>x.value==='days'));const native=ui.PickerSelect(picker.props);assert.equal(native.type,'select');native.props.onChange({target:{value:next}});assert.equal(unit,next);assert.equal(all(render()).find(n=>n.type===ui.PickerSelect&&n.props.options.some(x=>x.value==='days')).props.value,next);}
 const input=()=>all(render()).find(n=>n.type==='input'&&n.props.type==='number');input().props.onChange({target:{value:''}});assert(all(render()).filter(n=>n.props.role==='radio')[3].props['aria-checked']);input().props.onChange({target:{value:'60'}});assert.equal(unit,'minutes');assert.equal(input().props.value,60);
 for(const kind of ['created-or-moved','created-only','moved-only','dwell','assignee-changed','tag-added','field-updated','hours-before-field','daily','exact-datetime']){const options=all(render()).filter(n=>n.props.role==='radio');const order=['created-or-moved','created-only','moved-only','dwell','assignee-changed','tag-added','field-updated','hours-before-field','daily','exact-datetime'];options[order.indexOf(kind)].props.onClick({stopPropagation(){}});assert(all(render()).filter(n=>n.props.role==='radio')[order.indexOf(kind)].props['aria-checked']);}
});
await test('apply really covers more than 2000 existing leads',async()=>{
 await pg.query("insert into leads(id,workspace_id,pipeline_id,stage_id,name,tags,custom_data) select gen_random_uuid(),$1,$2,$3,'QA page '||n,'[]'::jsonb,'{}'::jsonb from generate_series(1,2003) n",[ws,pipeline,otherStage]);
 const a={...base,id:'qa-pagination'};await register(a);const input={workspaceId:ws,pipelineId:pipeline,stageIds:[otherStage],action:a};
 await pg.exec("create function qa_partial_failure() returns trigger language plpgsql as $$ begin if NEW.action_id='qa-pagination' and (select count(*) from crm_automation_jobs where action_id=NEW.action_id)>=500 then raise exception 'QA partial persistence'; end if; return NEW; end $$;create trigger qa_partial before insert on crm_automation_jobs for each row execute function qa_partial_failure();");
 await assert.rejects(()=>engine.backfillAutomationAction(db,input),/QA partial persistence/);assert.equal((await pg.query('select count(*)::int n from crm_automation_jobs where action_id=$1',[a.id])).rows[0].n,500);
 await pg.exec('drop trigger qa_partial on crm_automation_jobs');assert.equal((await engine.backfillAutomationAction(db,input)).queued,1506);assert.equal((await pg.query('select count(*)::int n from crm_automation_jobs where action_id=$1',[a.id])).rows[0].n,2006);
 assert(queries.some(s=>s.includes('offset 2000')));await pg.query('delete from crm_automation_jobs where action_id=$1',[a.id]);await pg.exec("delete from leads where name like 'QA page %'");
});
await test('actual Pronto/save handler waits for confirmed settings and apply queue, preserves failed draft',async()=>{
 await pg.exec('create table pipelines(id uuid,workspace_id uuid);');await pg.query('insert into pipelines values($1,$2)',[pipeline,ws]);
 await pg.query('update leads set stage_id=$1',[stage]);await pg.exec('delete from crm_automation_jobs;delete from crm_stage_automations;');
 const nativeClaim=db.rpc;db.rpc=async(name,args)=>{if(name==='slim_claim_stage_job')return nativeClaim(name,args);assert.equal(name,'replace_crm_stage_automations');await pg.query('delete from crm_stage_automations where workspace_id=$1 and pipeline_id=$2',[ws,args._pipeline_id]);let count=0;for(const [stageId,actions]of Object.entries(args._automations))for(const a of actions){await pg.query('insert into crm_stage_automations(workspace_id,pipeline_id,stage_id,action_id,action,enabled) values($1,$2,$3,$4,$5,$6)',[ws,pipeline,stageId,a.id,a,a.enabled!==false]);count++}return{data:count,error:null}};
 const source=read('src/lib/crm.functions.legacy.ts'),ast=ts.createSourceFile('server.ts',source,ts.ScriptTarget.Latest,true);let declaration;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='saveStageAutomations')declaration=n;n.forEachChild(visit)}visit(ast);
 const callback=declaration.initializer.arguments[0];let code=callback.getText(ast).replace(/const \{ supabaseAdmin \} = await import\([^;]+;/g,'').replace(/const \{ backfillAutomationAction, scheduleStageTimerActions \} = await import\([^;]+;/g,'');
 const handler=Function('loadActiveWorkspace','supabaseAdmin','backfillAutomationAction','scheduleStageTimerActions',compile('const handler='+code+';')+';return handler')(async()=>ws,db,engine.backfillAutomationAction,engine.scheduleStageTimerActions);
 const front=read('src/legacy/crm.funis-de-venda.legacy.tsx'),frontAst=ts.createSourceFile('front.tsx',front,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let save,persistence;
 function scan(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='saveAutomatize')save=n;if(ts.isFunctionDeclaration(n)&&n.name?.text==='assertAutomationPersistence')persistence=n;n.forEachChild(scan)}scan(frontAst);
 const input={[stage]:[{...base,id:'qa-pronto',execution:{trigger:{kind:'created-or-moved'},active:'always',delayMinutes:0,delayUnit:'minutes',applyToExisting:true}}]};
 let current,closed=false;const stored=new Map(),storage={getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
 const ctx={draft:input,funnelId:pipeline,savingAutomations:false,setDraft:v=>{current=v},setSavingAutomations:()=>{},automationSaveRequest:{current:null},localStorage:storage,sessionStorage:storage,stageAutomationDraftStorageKey:()=> 'qa-draft',stageAutomationStorageKey:()=> 'qa-saved',toast:{success(){},error(){}},setAutomations(){},setConfiguring(){},setColorMode(){},setSelectedColorStageId(){},setMode(){closed=true},stageActionStamp:core.stageActionStamp,
 saveStageAutomationsServer:({data})=>handler({data,context:{supabase:db,userId:id(77)}}),
 listStageAutomationsServer:async()=>({automations:{[stage]:(await pg.query('select action from crm_stage_automations order by position')).rows.map(r=>r.action)}})};
 const saveFn=Function(...Object.keys(ctx),compile(persistence.getText(frontAst)+'\n'+save.getText(frontAst))+';return saveAutomatize')(...Object.values(ctx));
 failJobs=true;await assert.rejects(()=>saveFn(input,true),/aplicação aos leads falhou/);assert.equal(current[stage][0].execution.applyToExisting,true);assert.equal(closed,false);const request=ctx.automationSaveRequest.current;assert(request);
 failJobs=false;await saveFn(input,true);assert.equal(current[stage][0].execution.applyToExisting,false);assert.equal(closed,false);
 assert.equal((await pg.query('select count(*)::int n from crm_automation_jobs')).rows[0].n,3);
 const repeat=await handler({data:{pipelineId:pipeline,automations:input,applyRequestId:request},context:{supabase:db,userId:id(77)}});assert.equal(repeat.backfilled,0);
});
await pg.close();console.log(`${passed}/${passed} pipeline QA checks; actual callbacks/executor and isolated PostgreSQL. No customer data, form submission or external message.`);
