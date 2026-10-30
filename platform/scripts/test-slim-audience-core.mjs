import assert from 'node:assert/strict';
import { audienceTags, audienceMatches, querySlimAudience, readAudienceRows, audienceMessage, contactBlocked } from '../src/lib/slim-audience.core.ts';
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name);}
const lead={id:'a',name:'Ana $&',email:null,phone:'5511999999999',status:'active',tags:['VIP',{name:'Cliente'}],created_at:'2026-10-01T23:45:00Z',updated_at:'2026-10-01T23:45:00Z',custom_data:{},last_message_from:null};
await test('JSON tags, objects and case-insensitive any/all/none',()=>{assert.deepEqual(audienceTags(lead.tags),['vip','cliente']);assert(audienceMatches(lead,{tagsAny:['vip'],tagsAll:['VIP','CLIENTE']}));assert(!audienceMatches(lead,{tagsNone:['cliente']}));});
await test('false filters and no prior message work',()=>{assert(audienceMatches(lead,{hasEmail:false,lastMessageFrom:'none'}));assert(!audienceMatches(lead,{hasPhone:false}));});
await test('end date includes entire selected day',()=>assert(audienceMatches(lead,{createdTo:'2026-10-01'})));
await test('merged leads are excluded even for any status',()=>assert(!audienceMatches({...lead,merged_into_id:'b'},{status:'any'})));
await test('custom-field comparators',()=>{const refs={fields:new Map([['a',new Map([['f','Aprovado']])]])};assert(audienceMatches(lead,{customFields:[{fieldId:'f',op:'contains',value:'prov'}]},refs));assert(!audienceMatches(lead,{customFields:[{fieldId:'f',op:'empty'}]},refs));});
await test('task state and products combine',()=>assert(audienceMatches(lead,{hasProducts:true,taskState:'has_open'},{products:new Set(['a']),tasks:new Map([['a',[{status:'pendente'}]]])})));
function fake(tables,fail) {const calls=[];return {calls,from(table){return {select(){return this;},eq(k,v){calls.push([table,k,v]);return this;},order(){return this;},async range(a,b){if(fail===table)return {data:null,error:{code:'42501'}};return {data:(tables[table]??[]).slice(a,Math.min(a+73,b+1)),error:null};}};}};}
await test('pagination over 1000 rows applies limit AFTER filtering',async()=>{const rows=Array.from({length:1205},(_,i)=>({...lead,id:String(i),tags:i>=1199?['match']:[]}));const db=fake({leads:rows});const r=await querySlimAudience(db,'workspace',{tagsAny:['match']},2);assert.equal(r.length,2);assert(db.calls.every(c=>c[1]==='workspace_id'&&c[2]==='workspace'));});
await test('preview count is not silently capped',async()=>assert.equal((await querySlimAudience(fake({leads:Array.from({length:2101},(_,i)=>({...lead,id:String(i)}))}),'ws',{})).length,2101));
await test('related table failure blocks calculation instead of false no-tasks',async()=>await assert.rejects(querySlimAudience(fake({leads:[lead]},'tasks'),'ws',{taskState:'none'})));
await test('workspace required',async()=>await assert.rejects(readAudienceRows(fake({}),'','leads','id')));
await test('malformed dates rejected',async()=>await assert.rejects(querySlimAudience(fake({}),'ws',{createdTo:'not-a-date'})));
await test('replacement tokens cannot interpret dollars from a contact name',()=>assert.equal(audienceMessage('Oi {{nome}}',lead),'Oi Ana $&'));
await test('opt-out and removed contact fences',()=>{assert(contactBlocked({...lead,custom_data:{opt_out:true}}));assert(contactBlocked({...lead,status:'archived'}));assert(!contactBlocked(lead));});

const NOW = Date.parse('2026-10-18T01:00:00Z'), DAY = 86400000;
const WS='c49945db-1960-461a-9339-a43b8403bdd9', OTHER_WS='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const uuid=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const at=days=>new Date(NOW-days*DAY).toISOString();
const contact=(n=1,patch={})=>({...lead,id:uuid(n),workspace_id:WS,name:'Contato sintético',phone:'+5511999999999',source:'whatsapp',merged_into_id:null,created_at:at(30),updated_at:at(0),custom_data:{whatsapp_session_id:'session-a'},...patch});
const activity=(n=1,patch={})=>({id:uuid(100000+n),workspace_id:WS,lead_id:uuid(1),type:'message_in',occurred_at:at(1),...patch});
const message=(n=1,patch={})=>({id:uuid(200000+n),workspace_id:WS,message_id:'message-'+n,session_id:'session-a',remote_jid:'5511999999999@s.whatsapp.net',to_jid:null,received_at:at(1),from_me:false,delivery_status:'received',message_type:'text',...patch});
function historyDb(tables={},options={}) {
 const calls=[];
 return {calls,from(table){
  let fields='',filters=[],first=0,last=499,sort='id';
  const query={
   select(v){fields=v;return this;},eq(k,v){filters.push(['eq',k,v]);return this;},
   gte(k,v){filters.push(['gte',k,v]);return this;},in(k,v){filters.push(['in',k,v]);return this;},
   order(k){sort=k;return this;},range(a,b){first=a;last=b;return this;},abortSignal(){return this;},
   then(resolve,reject){return Promise.resolve().then(()=>{
    calls.push({table,fields,filters:[...filters],first,last});
    if(options.fail===table&&(options.failAfter==null||first>=options.failAfter))return {data:null,error:{code:'42501'}};
    if(options.malformed===table)return {data:null,error:null};
    const rows=(tables[table]??[]).filter(row=>filters.every(([op,k,v])=>op==='eq'?row[k]===v:op==='in'?v.includes(row[k]):Date.parse(row[k])>=Date.parse(v))).sort((a,b)=>String(a[sort]).localeCompare(String(b[sort])));
    const repeat=options.repeatPage&&table==='lead_activities';
    const data=rows.slice(repeat?0:first,Math.min((repeat?0:first)+(options.pageSize??500),last+1));
    return {data:options.injectForeign&&table==='lead_activities'&&first===0?[...data,activity(99,{workspace_id:OTHER_WS})]:data,error:null};
   }).then(resolve,reject);},
  };return query;
 }};
}
const originalNow=Date.now;Date.now=()=>NOW;
try {
 await test('silence uses message dates, not a recently edited customer',async()=>{
  const db=historyDb({leads:[contact()],lead_activities:[activity(1,{occurred_at:at(20)}),activity(2,{type:'note',occurred_at:at(0)})]});
  assert.equal((await querySlimAudience(db,WS,{noMessageForDays:7})).length,1);
 });
 await test('recent conversation excludes a customer with an old updated_at',async()=>{
  assert.equal((await querySlimAudience(historyDb({leads:[contact(1,{updated_at:at(20)})],lead_activities:[activity()]}),WS,{noMessageForDays:7})).length,0);
 });
 await test('outbound messages also count as contact',async()=>{
  assert.equal((await querySlimAudience(historyDb({leads:[contact()],lead_activities:[activity(1,{type:'message_out'})]}),WS,{noMessageForDays:7})).length,0);
 });
 await test('without message history waiting starts at contact creation',async()=>{
  const rows=await querySlimAudience(historyDb({leads:[contact(),contact(2,{created_at:at(2)})]}),WS,{noMessageForDays:7});
  assert.deepEqual(rows.map(row=>row.id),[uuid(1)]);
 });
 await test('an activity exactly at the cutoff is recent',async()=>{
  assert.equal((await querySlimAudience(historyDb({leads:[contact()],lead_activities:[activity(1,{occurred_at:at(7)})]}),WS,{noMessageForDays:7})).length,0);
 });
 await test('a newly created record at the full waiting interval may match',async()=>{
  assert.equal((await querySlimAudience(historyDb({leads:[contact(1,{created_at:at(7)})]}),WS,{noMessageForDays:7})).length,1);
 });
 await test('updatedWithinDays still filters edits independently of silence',async()=>{
  const rows=await querySlimAudience(historyDb({leads:[contact(),contact(2,{updated_at:at(20)})]}),WS,{noMessageForDays:7,updatedWithinDays:3});
  assert.deepEqual(rows.map(row=>row.id),[uuid(1)]);
 });
 await test('raw WhatsApp message counts before activity synchronization',async()=>{
  assert.equal((await querySlimAudience(historyDb({leads:[contact()],whatsapp_web_messages:[message()]}),WS,{noMessageForDays:7})).length,0);
 });
 await test('explicit alternate phone JID resolves a LID without using LID digits',async()=>{
  assert.equal((await querySlimAudience(historyDb({leads:[contact()],whatsapp_web_messages:[message(1,{remote_jid:'999999999999@lid',to_jid:'5511999999999@s.whatsapp.net'})]}),WS,{noMessageForDays:7})).length,0);
 });
 await test('unresolved recent LID blocks false silence classification',async()=>{
  await assert.rejects(querySlimAudience(historyDb({leads:[contact()],whatsapp_web_messages:[message(1,{remote_jid:'999999999999@lid'})]}),WS,{noMessageForDays:7}),/vínculo individual/);
 });
 await test('a recent LID with an explicit message and session activity link is known',async()=>{
  const db=historyDb({leads:[contact()],lead_activities:[activity(1,{message_id:'message-1',session_id:'session-a'})],whatsapp_web_messages:[message(1,{remote_jid:'999999999999@lid'})]});
  assert.equal((await querySlimAudience(db,WS,{noMessageForDays:7})).length,0);
 });
 await test('LID message ID from a different session is not a known link',async()=>{
  const db=historyDb({leads:[contact()],lead_activities:[activity(1,{message_id:'message-1',session_id:'session-b'})],whatsapp_web_messages:[message(1,{remote_jid:'999999999999@lid'})]});
  await assert.rejects(querySlimAudience(db,WS,{noMessageForDays:7}),/vínculo individual/);
 });
 await test('group traffic cannot become direct contact through an alternate JID',async()=>{
  const db=historyDb({leads:[contact()],whatsapp_web_messages:[message(1,{remote_jid:'123456789-123@g.us',to_jid:'5511999999999@s.whatsapp.net'})]});
  assert.equal((await querySlimAudience(db,WS,{noMessageForDays:7})).length,1);
 });
 await test('group lead source and group phone are excluded from individual silence',async()=>{
  const db=historyDb({leads:[contact(1,{source:'whatsapp_group'}),contact(2,{phone:'123456789-123@g.us'})]});
  assert.equal((await querySlimAudience(db,WS,{noMessageForDays:7})).length,0);
 });
 await test('a different phone or bound session does not borrow contact history',async()=>{
  const db=historyDb({leads:[contact()],whatsapp_web_messages:[message(1,{session_id:'session-b'}),message(2,{remote_jid:'351912345678@s.whatsapp.net'})]});
  assert.equal((await querySlimAudience(db,WS,{noMessageForDays:7})).length,1);
 });
 await test('an unbound session is conservatively suppressed by matching recent phone traffic',async()=>{
  const db=historyDb({leads:[contact(1,{custom_data:{}})],whatsapp_web_messages:[message()]});
  assert.equal((await querySlimAudience(db,WS,{noMessageForDays:7})).length,0);
 });
 await test('pending or uncertain outgoing records never encourage another send',async()=>{
  for(const delivery_status of ['pending','uncertain',null]){
   const db=historyDb({leads:[contact()],whatsapp_web_messages:[message(1,{from_me:true,delivery_status})]});
   assert.equal((await querySlimAudience(db,WS,{noMessageForDays:7})).length,0);
  }
 });
 await test('known legacy order aliases share the canonical contact activity window',async()=>{
  const db=historyDb({leads:[contact(),contact(2,{source:'pedido_saude_slim'})],lead_activities:[activity(1,{lead_id:uuid(2)})]});
  assert.equal((await querySlimAudience(db,WS,{noMessageForDays:7})).length,0);
 });
 await test('short server pages are exhausted before applying preview limit',async()=>{
  const activities=Array.from({length:1205},(_,i)=>activity(i,{lead_id:i===1204?uuid(1):uuid(9999)}));
  const db=historyDb({leads:[contact()],lead_activities:activities},{pageSize:73});
  assert.equal((await querySlimAudience(db,WS,{noMessageForDays:7},1)).length,0);
  assert(db.calls.some(call=>call.table==='lead_activities'&&call.first>1000));
 });
 await test('history reads project only scalar metadata and filter by workspace and window',async()=>{
  const db=historyDb({leads:[contact()],lead_activities:[activity(1,{workspace_id:OTHER_WS})],whatsapp_web_messages:[message(1,{workspace_id:OTHER_WS})]});
  assert.equal((await querySlimAudience(db,WS,{noMessageForDays:7})).length,1);
  const calls=db.calls.filter(call=>call.table!=='leads');
  assert(calls.length>=2);
  for(const call of calls){
   assert(call.filters.some(([op,k,v])=>op==='eq'&&k==='workspace_id'&&v===WS));
   assert(call.filters.some(([op,k,v])=>op==='gte'&&['occurred_at','received_at'].includes(k)&&v===at(7)));
   assert(!/(^|,)(body|raw|payload|media_url|sender_name|sender_phone)(,|$)/.test(call.fields));
  }
 });
 await test('the filter does not read message tables when disabled',async()=>{
  const db=historyDb({leads:[contact()]},{fail:'lead_activities'});
  assert.equal((await querySlimAudience(db,WS,{})).length,1);
  assert(db.calls.every(call=>call.table==='leads'));
 });
 await test('either message source failing blocks a partial audience',async()=>{
  for(const fail of ['lead_activities','whatsapp_web_messages'])await assert.rejects(querySlimAudience(historyDb({leads:[contact()]},{fail}),WS,{noMessageForDays:7}),/histórico parcial/);
 });
 await test('failure on a later message page is not treated as no messages',async()=>{
  const db=historyDb({leads:[contact()],lead_activities:Array.from({length:600},(_,i)=>activity(i,{lead_id:uuid(9999)}))},{fail:'lead_activities',failAfter:500});
  await assert.rejects(querySlimAudience(db,WS,{noMessageForDays:7}),/histórico parcial/);
 });
 await test('foreign message rows returned by a broken adapter are rejected',async()=>{
  await assert.rejects(querySlimAudience(historyDb({leads:[contact()]},{injectForeign:true}),WS,{noMessageForDays:7}),/inconsistente/);
 });
 await test('repeated history pages fail explicitly instead of looping',async()=>{
  await assert.rejects(querySlimAudience(historyDb({leads:[contact()],lead_activities:[activity()]},{repeatPage:true}),WS,{noMessageForDays:7}),/inconsistente/);
 });
 await test('malformed history response fails explicitly',async()=>{
  await assert.rejects(querySlimAudience(historyDb({leads:[contact()]},{malformed:'whatsapp_web_messages'}),WS,{noMessageForDays:7}),/histórico parcial/);
 });
 await test('invalid silence interval fails before any source read',async()=>{
  for(const days of [0,-1,366,1.5,'7',NaN]){
   const db=historyDb({});await assert.rejects(querySlimAudience(db,WS,{noMessageForDays:days}),/365 dias/);assert.equal(db.calls.length,0);
  }
 });
 await test('direct predicate cannot infer silence without a complete history window',()=>{
  assert.throws(()=>audienceMatches(contact(),{noMessageForDays:7},{},NOW),/Histórico/);
 });
} finally {Date.now=originalNow;}
console.log(`${count}/${count} audience checks passed`);
