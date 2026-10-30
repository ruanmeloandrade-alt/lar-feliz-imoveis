import assert from 'node:assert/strict';
import {
 withSlimGroupCatalogRequest,authorizeSlimGroupCatalog,listSlimWorkspaceGroups,saveSlimGroupConfiguration,
} from '../src/lib/slim-group-catalog.server.ts';
import {extractSlimEvolutionGroups,fetchSlimEvolutionGroups,slimGroupMetadataRows,syncSlimSessionGroups} from '../src/lib/slim-group-sync.server.ts';

// Exercise the real handlers with explicit, local DB/provider doubles. Never opens a network connection.
const W='00000000-0000-4000-8000-000000000101',OTHER='00000000-0000-4000-8000-000000000102';
const U='00000000-0000-4000-8000-000000000001',V='00000000-0000-4000-8000-000000000002';
const S='00000000-0000-4000-8000-000000000201',S2='00000000-0000-4000-8000-000000000202';
const G='00000000-0000-4000-8000-000000000301',BOT='00000000-0000-4000-8000-000000000401';
const clone=value=>structuredClone(value);
const group=()=>({id:G,workspace_id:W,session_id:S,group_jid:'120363000001@g.us',name:'Existing name',rules:{enabled:true,keyword:'keep'},active_bot_id:BOT,active_ai_agent_id:null,metadata:{custom:'preserve'},is_admin:false,last_synced_at:null});
function fakeDb(options={}){
 const tables={
  profiles:[{id:U,current_workspace_id:W}],workspaces:[{id:W,owner_id:options.member?V:U}],
  workspace_members:options.member?[{workspace_id:W,user_id:U,role_type:options.viewer?'visualizador':'funcionario',access_expires_at:options.expired?'2000-01-01T00:00:00Z':null}]:[],
  whatsapp_groups:[group()],whatsapp_web_sessions:[{id:S,workspace_id:W,phone_number:'5511987654321',status:'connected',provider:'evolution'}],
  salesbots:[{id:BOT,workspace_id:W,scope:'grupo'}],...clone(options.tables??{}),
 };
 const calls=[];
 const db={tables,calls,rpcResults:[...(options.rpcResults??[{data:{recovered:0,total:tables.whatsapp_groups.length},error:null}])],
  from(table){return query({table,op:'select'});},rpc(name,args){return query({table:'rpc',name,args,op:'rpc'});}};
 function query(initial){
  const q={...initial,filters:[],orders:[],columns:null,retryValue:undefined,signal:null};let result;
  const chain={
   select(columns){q.columns=columns;return chain;},eq(column,value){q.filters.push([column,value]);return chain;},
   order(column,value){q.orders.push([column,value]);return chain;},range(from,to){q.range=[from,to];return chain;},
   update(value){q.op='update';q.value=clone(value);return chain;},upsert(value,options){q.op='upsert';q.value=clone(value);q.options=options;return chain;},
   maybeSingle(){q.single=true;return chain;},single(){q.single=true;return chain;},
   retry(value){q.retryValue=value;return chain;},abortSignal(signal){q.signal=signal;return chain;},
   then(resolve,reject){
    result??=Promise.resolve().then(async()=>{
     assert.equal(q.retryValue,false,`${q.table}: requests must disable retries`);
     assert(q.signal instanceof AbortSignal,`${q.table}: request needs an AbortSignal`);
     assert.equal(q.signal.aborted,false,`${q.table}: do not start after timeout`);
     calls.push(q);
     const override=await options.handle?.(q,db);if(override!==undefined)return override;
     if(q.op==='rpc'){
      if(q.name==='get_evolution_credentials'){
       assert.deepEqual(q.args,{_session_id:S,_key:'synthetic-encryption-key'});
       return {data:clone(options.credentials??{workspace_id:W,instance_name:'synthetic/instance',api_key:'synthetic-api-key'}),error:null};
      }
      assert.equal(q.name,'slim_sync_group_catalog','Unknown RPC in test double');
      assert.deepEqual(q.args,{_workspace_id:W,_session_id:options.expectedSession??null});
      return clone(db.rpcResults.length>1?db.rpcResults.shift():db.rpcResults[0]);
     }
     assert(Object.hasOwn(tables,q.table),'Unknown IO table: '+q.table);
     let rows=tables[q.table].filter(row=>q.filters.every(([key,value])=>row[key]===value));
     if(q.op==='update')for(const row of rows)Object.assign(row,clone(q.value));
     if(q.op==='upsert'){
      for(const incoming of q.value){const old=tables[q.table].find(row=>row.session_id===incoming.session_id&&row.group_jid===incoming.group_jid);if(old)Object.assign(old,clone(incoming));else tables[q.table].push(clone(incoming));}
      rows=q.value;
     }
     if(q.range)rows=rows.slice(q.range[0],q.range[1]+1);
     return {data:q.single?clone(rows[0]??null):clone(rows),error:null};
    });
    return result.then(resolve,reject);
   },
  };return chain;
 }
 return db;
}
const signal=()=>new AbortController().signal;
const writes=db=>db.calls.filter(q=>['update','upsert','rpc'].includes(q.op));
let passed=0;
async function test(name,work){await work();passed++;console.log('PASS group catalog runtime: '+name);}

await test('finite request deadline aborts the local work',async()=>{
 let observed;await assert.rejects(withSlimGroupCatalogRequest(s=>{observed=s;return new Promise(()=>{});},5),/excedeu o prazo/);assert.equal(observed.aborted,true);
});
await test('owner and active employee can write, viewer is read-only',async()=>{
 assert.deepEqual(await authorizeSlimGroupCatalog(fakeDb(),W,U,signal(),true),{canWrite:true});
 assert.deepEqual(await authorizeSlimGroupCatalog(fakeDb({member:true}),W,U,signal(),true),{canWrite:true});
 const viewer=fakeDb({member:true,viewer:true});assert.deepEqual(await authorizeSlimGroupCatalog(viewer,W,U,signal()),{canWrite:false});
 await assert.rejects(authorizeSlimGroupCatalog(viewer,W,U,signal(),true),/consultar.*não alterar/);assert.equal(writes(viewer).length,0);
});
await test('invalid identity, changed active workspace and expired membership stop before mutations',async()=>{
 const invalid=fakeDb();await assert.rejects(listSlimWorkspaceGroups(invalid,W,undefined,'invalid'),/inválida/);assert.equal(invalid.calls.length,0);
 for(const db of [fakeDb({expired:true,member:true}),fakeDb({tables:{profiles:[{id:U,current_workspace_id:OTHER}]}})]){
  await assert.rejects(listSlimWorkspaceGroups(db,W,undefined,U));assert.equal(writes(db).length,0);
 }
});
await test('authorization query errors do not become a successful empty list',async()=>{
 const db=fakeDb({handle:q=>q.table==='workspace_members'?{data:null,error:{message:'synthetic failure'}}:undefined});
 await assert.rejects(listSlimWorkspaceGroups(db,W,undefined,U),/verificar o acesso/);assert.equal(writes(db).length,0);
});
await test('operator list recovers once per request and preserves stable group identities',async()=>{
 const db=fakeDb({rpcResults:[{data:{recovered:1,total:1},error:null},{data:{recovered:0,total:1},error:null}]});
 const first=await listSlimWorkspaceGroups(db,W,undefined,U),second=await listSlimWorkspaceGroups(db,W,undefined,U);
 assert.deepEqual(first,second);assert.equal(first[0].id,G);assert.equal(db.calls.filter(q=>q.op==='rpc').length,2);
 assert.equal(db.calls.filter(q=>['update','upsert'].includes(q.op)).length,0);
});
await test('viewer lists existing catalog without recovery or writes',async()=>{
 const db=fakeDb({member:true,viewer:true});assert.equal((await listSlimWorkspaceGroups(db,W,undefined,U)).length,1);assert.equal(writes(db).length,0);
});
await test('selected session is applied to recovery and all catalog pages',async()=>{
 const db=fakeDb({expectedSession:S,tables:{whatsapp_groups:[group(),{...group(),id:BOT,session_id:S2}]}});
 assert.equal((await listSlimWorkspaceGroups(db,W,S,U)).length,1);
 assert(db.calls.filter(q=>q.table==='whatsapp_groups').every(q=>q.filters.some(([key,value])=>key==='session_id'&&value===S)));
});
await test('recovery error and invalid receipt fail closed before catalog read',async()=>{
 for(const result of [{data:null,error:{code:'42501'}},{data:{recovered:2,total:1},error:null},{data:{recovered:'1',total:1},error:null}]){
  const db=fakeDb({rpcResults:[result]});await assert.rejects(listSlimWorkspaceGroups(db,W,undefined,U),/sincronizar o histórico/);
  assert.equal(db.calls.filter(q=>q.table==='whatsapp_groups').length,0);
 }
});
await test('catalog errors or cross-company rows never become accepted results',async()=>{
 for(const response of [{data:null,error:{message:'failed'}},{data:[{...group(),workspace_id:OTHER}],error:null}]){
  const db=fakeDb({handle:q=>q.table==='whatsapp_groups'?response:undefined});await assert.rejects(listSlimWorkspaceGroups(db,W,undefined,U),/consultar os grupos/);
 }
});
await test('saving rules updates only the selected group after a matching receipt',async()=>{
 const db=fakeDb(),before=clone(db.tables.whatsapp_groups[0]);
 assert.deepEqual(await saveSlimGroupConfiguration(db,{workspaceId:W,groupId:G,rules:{welcome:{enabled:false}}},U),{ok:true});
 const write=writes(db)[0];assert.deepEqual(write.filters,[['workspace_id',W],['id',G]]);
 assert.deepEqual(Object.keys(write.value).sort(),['rules','updated_at']);
 assert.equal(db.tables.whatsapp_groups[0].active_bot_id,before.active_bot_id);assert.deepEqual(db.tables.whatsapp_groups[0].metadata,before.metadata);
});
await test('saving rejects viewer, unknown bot, group AI and absent update receipt',async()=>{
 const viewer=fakeDb({member:true,viewer:true});await assert.rejects(saveSlimGroupConfiguration(viewer,{workspaceId:W,groupId:G,rules:{}},U));assert.equal(writes(viewer).length,0);
 const absent=fakeDb({tables:{salesbots:[]}});await assert.rejects(saveSlimGroupConfiguration(absent,{workspaceId:W,groupId:G,botId:BOT},U),/SalesBot.*não encontrado/);assert.equal(writes(absent).length,0);
 const ai=fakeDb();await assert.rejects(saveSlimGroupConfiguration(ai,{workspaceId:W,groupId:G,agentId:BOT},U),/SalesBots e gatilhos/);assert.equal(writes(ai).length,0);
 const noReceipt=fakeDb({handle:q=>q.op==='update'?{data:null,error:null}:undefined});await assert.rejects(saveSlimGroupConfiguration(noReceipt,{workspaceId:W,groupId:G,rules:{}},U),/confirmar o salvamento/);assert.equal(writes(noReceipt).length,1);
});
await test('valid group bot assignment confirms the group and clears removed group AI',async()=>{
 const db=fakeDb();assert.deepEqual(await saveSlimGroupConfiguration(db,{workspaceId:W,groupId:G,botId:BOT},U),{ok:true});
 const lookup=db.calls.find(q=>q.table==='salesbots');assert.deepEqual(lookup.filters,[['workspace_id',W],['id',BOT],['scope','grupo']]);
 const update=writes(db)[0];assert.equal(update.value.active_bot_id,BOT);assert.equal(update.value.active_ai_agent_id,null);
});

// Provider synchronization tests follow below; all transports are explicit local functions.
const env={INTEGRATION_ENCRYPTION_KEY:'synthetic-encryption-key',EVOLUTION_BASE_URL:'https://evolution.example.invalid/'};
const syncData={workspaceId:W,sessionId:S};
const syncDb=options=>fakeDb({expectedSession:S,...options});
const response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const providerGroup={id:'120363000001@g.us',subject:'Provider name',participants:[{id:'5511987654321@s.whatsapp.net',admin:'admin'}]};
const networkOptions=fetcher=>({env,fetcher,providerTimeoutMs:15,timeoutMs:1000});

await test('known provider envelopes normalize groups and deduplicate identities',async()=>{
 const result=extractSlimEvolutionGroups({data:{response:{groups:[providerGroup,{...providerGroup,subject:'Current name'}]}}});
 assert.equal(result.length,1);assert.equal(result[0].name,'Current name');assert.equal(result[0].participants[0].admin,true);
 assert.deepEqual(extractSlimEvolutionGroups({groups:[]}),[]);assert.equal(extractSlimEvolutionGroups(providerGroup).length,1);
});
await test('unrecognized, partly invalid and excessive provider payloads are rejected',async()=>{
 for(const payload of [{members:[]},{groups:[providerGroup,{id:'not-a-group'}]},Array.from({length:2001},()=>providerGroup)])assert.throws(()=>extractSlimEvolutionGroups(payload));
 let deep=[];for(let i=0;i<8;i++)deep={data:deep};assert.throws(()=>extractSlimEvolutionGroups(deep),/não reconhecido/);
});
await test('provider uses exactly one GET with explicit headers, no redirect and a bounded signal',async()=>{
 let calls=0,request;
 const result=await fetchSlimEvolutionGroups('https://evolution.example.invalid/groups','synthetic-api-key',signal(),{fetcher:async(url,init)=>{calls++;request={url,init};return response([providerGroup]);}});
 assert.equal(calls,1);assert.equal(result.length,1);assert.equal(request.init.method,'GET');assert.equal(request.init.redirect,'error');
 assert.deepEqual(request.init.headers,{apikey:'synthetic-api-key',Accept:'application/json'});assert(request.init.signal instanceof AbortSignal);assert.equal(request.init.body,undefined);
});
await test('provider deadline covers headers and a stalled response body without retry',async()=>{
 for(const stalledBody of [false,true]){
  let calls=0,observed,cancelled=false;
  const fetcher=async(_url,init)=>{calls++;observed=init.signal;return stalledBody?new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}})):new Promise(()=>{});};
  await assert.rejects(fetchSlimEvolutionGroups('https://evolution.example.invalid/groups','synthetic-key',signal(),{fetcher,timeoutMs:5}),/demorou a responder/);
  assert.equal(calls,1);assert.equal(observed.aborted,true);if(stalledBody)assert.equal(cancelled,true);
 }
});
await test('oversized headers, oversized stream, HTTP errors and malformed JSON fail closed',async()=>{
 const factories=[()=>new Response('[]',{headers:{'content-length':'100'}}),()=>new Response('0123456789'),()=>new Response('no',{status:503}),()=>new Response('{broken')];
 for(const factory of factories){let calls=0;await assert.rejects(fetchSlimEvolutionGroups('https://evolution.example.invalid/groups','synthetic-key',signal(),{maxBytes:8,fetcher:async()=>{calls++;return factory();}}));assert.equal(calls,1);}
 const controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(fetchSlimEvolutionGroups('https://evolution.example.invalid/groups','synthetic-key',controller.signal,{fetcher:async()=>{calls++;return response([]);}}));assert.equal(calls,0);
});
await test('metadata preserves configuration and never infers admin from a phone suffix',async()=>{
 const previous={...group(),description:'Previous description',picture_url:'https://example.invalid/existing',participants_count:17,is_announce:true};
 const normalized=extractSlimEvolutionGroups({groups:[{id:providerGroup.id,participants:[{id:'11987654321@s.whatsapp.net',admin:'admin'}]}]});
 const [row]=slimGroupMetadataRows(normalized,[previous],W,S,'5511987654321','2026-10-18T19:00:00Z');
 assert.equal(row.name,previous.name);assert.equal(row.description,previous.description);assert.equal(row.picture_url,previous.picture_url);assert.equal(row.is_admin,false);
 for(const key of ['id','rules','active_bot_id','active_ai_agent_id','metadata','invite_code','created_at'])assert.equal(Object.hasOwn(row,key),false,'Never overwrite '+key);
 const [verified]=slimGroupMetadataRows(extractSlimEvolutionGroups([providerGroup]),[previous],W,S,'5511987654321','2026-10-18T19:00:00Z');assert.equal(verified.is_admin,true);
 const [unknown]=slimGroupMetadataRows(extractSlimEvolutionGroups([providerGroup]),[previous],W,S,'','2026-10-18T19:00:00Z');assert.equal(unknown.is_admin,false);
});
await test('successful sync makes one provider read and updates metadata while preserving rules and bots',async()=>{
 const db=syncDb(),before=clone(db.tables.whatsapp_groups[0]);let calls=0,url;
 const result=await syncSlimSessionGroups(db,syncData,U,networkOptions(async(value)=>{calls++;url=value;return response({groups:[providerGroup]});}));
 assert.equal(calls,1);assert.equal(url,'https://evolution.example.invalid/group/fetchAllGroups/synthetic%2Finstance?getParticipants=true');
 assert.deepEqual(result,{synced:1,recovered:0,total:1,adminGroups:1,identityResolved:true,provider:'evolution'});
 const after=db.tables.whatsapp_groups[0];assert.equal(after.name,'Provider name');assert.deepEqual(after.rules,before.rules);assert.equal(after.active_bot_id,before.active_bot_id);assert.deepEqual(after.metadata,before.metadata);
 const upserts=db.calls.filter(q=>q.op==='upsert');assert.equal(upserts.length,1);assert.deepEqual(upserts[0].options,{onConflict:'session_id,group_jid'});
});
await test('wrong workspace, missing session and viewer fail before any provider request',async()=>{
 const cases=[syncDb({tables:{profiles:[{id:U,current_workspace_id:OTHER}]}}),syncDb({tables:{whatsapp_web_sessions:[]}}),syncDb({member:true,viewer:true})];
 for(const db of cases){let calls=0;await assert.rejects(syncSlimSessionGroups(db,syncData,U,networkOptions(async()=>{calls++;return response([]);})));assert.equal(calls,0);assert.equal(writes(db).length,0);}
});
await test('foreign credentials or offline session retain history without a provider request',async()=>{
 const cases=[syncDb({credentials:{workspace_id:OTHER,instance_name:'foreign',api_key:'synthetic-key'}}),syncDb({tables:{whatsapp_web_sessions:[{id:S,workspace_id:W,status:'disconnected',provider:'evolution'}]}})];
 for(const db of cases){let calls=0;const before=clone(db.tables.whatsapp_groups);
  const result=await syncSlimSessionGroups(db,syncData,U,networkOptions(async()=>{calls++;return response([]);}));
  assert.equal(calls,0);assert.equal(result.provider,'history');assert.equal(result.synced,0);assert(result.warning);assert.deepEqual(db.tables.whatsapp_groups,before);assert.equal(db.calls.filter(q=>q.op==='upsert').length,0);
 }
});
await test('provider failure keeps known groups; failure without history is an error',async()=>{
 for(const payload of [{unrelated:[]},null]){
  const db=syncDb(),before=clone(db.tables.whatsapp_groups);let calls=0;
  const result=await syncSlimSessionGroups(db,syncData,U,networkOptions(async()=>{calls++;if(payload===null)throw new Error('Synthetic provider failure');return response(payload);}));
  assert.equal(calls,1);assert.equal(result.provider,'history');assert.equal(result.synced,0);assert(result.warning);assert.deepEqual(db.tables.whatsapp_groups,before);assert.equal(db.calls.filter(q=>q.op==='upsert').length,0);
 }
 const empty=syncDb({tables:{whatsapp_groups:[]}});
 await assert.rejects(syncSlimSessionGroups(empty,syncData,U,networkOptions(async()=>{throw new Error('Synthetic failure');})),/não foi concluída/);
});
await test('empty provider response and failed upsert do not erase the catalog or report full success',async()=>{
 const empty=syncDb(),before=clone(empty.tables.whatsapp_groups);
 const noGroups=await syncSlimSessionGroups(empty,syncData,U,networkOptions(async()=>response([])));
 assert.equal(noGroups.synced,0);assert.equal(noGroups.total,1);assert.match(noGroups.warning,/lista vazia/);assert.deepEqual(empty.tables.whatsapp_groups,before);assert.equal(empty.calls.filter(q=>q.op==='upsert').length,0);
 const failed=syncDb({handle:q=>q.op==='upsert'?{data:null,error:{message:'Synthetic DB failure'}}:undefined});
 const noReceipt=await syncSlimSessionGroups(failed,syncData,U,networkOptions(async()=>response([providerGroup])));
 assert.equal(noReceipt.provider,'history');assert.equal(noReceipt.synced,0);assert.match(noReceipt.warning,/não foi confirmada/);assert.deepEqual(failed.tables.whatsapp_groups,before);assert.equal(failed.calls.filter(q=>q.op==='upsert').length,1);
});
console.log(`${passed}/${passed} real group handler checks passed with synthetic DB and provider IO. No messages, automations or external requests executed.`);
