import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// The actual server handler, with only its authenticated transport replaced by synthetic IO.
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const ddl=read('supabase/migrations/20261013103000_saude_slim_evolution_whatsapp_core.sql');
const table=ddl.slice(ddl.indexOf('create table if not exists public.whatsapp_web_sessions'),ddl.indexOf('create index if not exists whatsapp_sessions_workspace_status_idx'));
const columns=new Set([...table.matchAll(/^  ([a-z_]+)\s+(?:uuid|text|bytea|timestamptz|jsonb)\b/gm)].map(match=>match[1]));
const granted=new Set(ddl.match(/grant select\s*\(([\s\S]*?)\) on public\.whatsapp_web_sessions to authenticated;/i)[1].split(',').map(column=>column.trim()));
const auth=Symbol('requireSupabaseAuth');
const createServerFn=options=>{
 assert.deepEqual(options,{method:'GET'});
 return {middleware(items){assert.deepEqual(items,[auth]);return this;},handler(fn){return fn;}};
};
const load=id=>{
 if(id==='@tanstack/react-start')return {createServerFn};
 if(id==='@/integrations/supabase/auth-middleware')return {requireSupabaseAuth:auth};
 throw new Error('Unmocked dependency: '+id);
};
const compiled=ts.transpileModule(read('src/lib/channels.functions.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};new Function('exports','require',compiled)(exports,load);
const handler=exports.listWorkspaceChannels;
const W='00000000-0000-4000-8000-000000000101',FOREIGN='00000000-0000-4000-8000-000000000102',U='00000000-0000-4000-8000-000000000001';
const S=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const session=(n,extra={})=>({id:S(n),workspace_id:W,phone_number:'5511987654321',status:'connected',updated_at:'2026-10-18T10:00:00Z',metadata:{},...extra});
function fixture(options={}){
 const calls=[];
 const tables={profiles:[{id:U,current_workspace_id:W}],whatsapp_web_sessions:[session(1)],meta_instagram_accounts:[{id:S(90),workspace_id:W,username:'synthetic',instagram_id:'ig-fixture'}],meta_pages:[{id:S(91),workspace_id:W,page_name:'Synthetic page',page_id:'fb-fixture'}],...options.tables};
 const db={calls,from(name){
  const query={name,filters:[]};let promise;
  const chain={select(value){query.columns=value.split(',').map(column=>column.trim());return chain;},eq(key,value){query.filters.push([key,value]);return chain;},maybeSingle(){query.single=true;return chain;},
   then(resolve,reject){promise??=Promise.resolve().then(()=>{
    calls.push(query);assert(Object.hasOwn(tables,name),'Unexpected table '+name);
    if(name==='whatsapp_web_sessions')for(const column of query.columns){assert(columns.has(column),'Column absent from versioned schema: '+column);assert(granted.has(column),'Column not granted to authenticated: '+column);}
    if(options.errors?.[name])return {data:null,error:options.errors[name]};
    const rows=tables[name].filter(row=>query.filters.every(([key,value])=>row[key]===value)).map(row=>Object.fromEntries(query.columns.map(column=>[column,row[column]])));
    return {data:query.single?rows[0]??null:rows,error:null};
   });return promise.then(resolve,reject);},
  };return chain;
 }};return db;
}
const run=db=>handler({context:{supabase:db,userId:U}});
let count=0;
async function test(name,work){await work();count++;console.log('PASS workspace channels: '+name);}

await test('authenticated real handler loads WhatsApp using existing, granted columns only',async()=>{
 const db=fixture(),result=await run(db);assert.deepEqual(result.whatsapp,[{id:S(1),label:'5511987654321',status:'connected'}]);
 assert(!Object.hasOwn(result.whatsapp[0],'subtitle'));
 assert.deepEqual(db.calls.find(call=>call.name==='whatsapp_web_sessions').columns,['id','phone_number','status','updated_at','metadata']);
});
await test('WhatsApp query failure is explicit and does not expose backend diagnostics',async()=>{
 const db=fixture({errors:{whatsapp_web_sessions:{code:'42703',message:'push_name missing; synthetic internal diagnostic'}}});
 await assert.rejects(run(db),error=>{
  assert.equal(error.message,'Não foi possível consultar as sessões de WhatsApp. Atualize a lista para tentar novamente.');
  assert.doesNotMatch(error.message,/push_name|42703|internal diagnostic/);return true;
 });
});
await test('active workspace and actor scope constrain every channel query',async()=>{
 const db=fixture({tables:{whatsapp_web_sessions:[session(1),session(2,{workspace_id:FOREIGN,phone_number:'551188887777'})]}});
 const result=await run(db);assert.equal(result.whatsapp.length,1);assert.deepEqual(db.calls[0].filters,[['id',U]]);
 for(const call of db.calls.slice(1))assert.deepEqual(call.filters,[['workspace_id',W]]);
 assert.deepEqual(result.instagram,[{id:S(90),label:'@synthetic'}]);assert.deepEqual(result.facebook,[{id:S(91),label:'Synthetic page'}]);assert.deepEqual(result.email,[]);
});
await test('existing deleted/disconnected filters and connected-without-phone fallback remain',async()=>{
 const db=fixture({tables:{whatsapp_web_sessions:[session(1,{metadata:{deleted:true}}),session(2,{status:'disconnected'}),session(3,{status:'desconectado'}),session(4,{phone_number:null,status:'configurando'}),session(5,{phone_number:null,status:'open'})]}});
 assert.deepEqual((await run(db)).whatsapp,[{id:S(5),label:'WhatsApp conectado',status:'open'}]);
});
await test('phone identity deduplication keeps connection priority then newest timestamp',async()=>{
 const db=fixture({tables:{whatsapp_web_sessions:[session(1,{status:'connecting',updated_at:'2026-10-18T13:00:00Z'}),session(2,{phone_number:'+55 (11) 98765-4321',updated_at:'2026-10-18T11:00:00Z'}),session(3,{updated_at:'2026-10-18T12:00:00Z'}),session(4,{phone_number:null}),session(5,{phone_number:null})]}});
 assert.deepEqual((await run(db)).whatsapp.map(row=>row.id),[S(3),S(4),S(5)]);
});
await test('verified empty WhatsApp result remains distinct from query failure; Meta behavior preserved',async()=>{
 const db=fixture({tables:{whatsapp_web_sessions:[]},errors:{meta_instagram_accounts:{message:'Synthetic unavailable Meta'},meta_pages:{message:'Synthetic unavailable Meta'}}});
 assert.deepEqual(await run(db),{whatsapp:[],instagram:[],facebook:[],email:[]});
});
await test('missing active workspace stops before looking up any channel',async()=>{
 const db=fixture({tables:{profiles:[{id:U,current_workspace_id:null}]}});await assert.rejects(run(db),/Workspace ativo não encontrado/);assert.equal(db.calls.length,1);
});
console.log(`${count}/${count} real channel handler checks passed with synthetic IO. No network, messages or account changes.`);
