import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertSlimChatMembership} from '../src/lib/slim-chat-membership.core.ts';
const ws='11111111-1111-4111-8111-111111111111',uid='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';let n=0;
async function test(name,run){await run();n++;console.log('PASS chat membership: '+name);}
function fake(owner,member,error=null){
 const calls=[];
 return {calls,from(table){
  calls.push(['table',table]);
  return {select(){return this;},eq(k,v){calls.push([k,v]);return this;},async maybeSingle(){return {data:table==='workspaces'?{id:ws,owner_id:owner}:member,error};}};
 }};
}
await test('owner access without duplicated membership',()=>assertSlimChatMembership(fake(uid,null),ws,uid));
await test('active member permitted',()=>assertSlimChatMembership(fake(other,{workspace_id:ws,user_id:uid}),ws,uid));
await test('non-member rejected',()=>assert.rejects(assertSlimChatMembership(fake(other,null),ws,uid)));
await test('expired access rejected',()=>assert.rejects(assertSlimChatMembership(fake(other,{workspace_id:ws,user_id:uid,access_expires_at:'2020-01-01'}),ws,uid)));
await test('invalid expiration fails closed',()=>assert.rejects(assertSlimChatMembership(fake(other,{workspace_id:ws,user_id:uid,access_expires_at:'garbled'}),ws,uid)));
await test('wrong workspace not accepted',()=>assert.rejects(assertSlimChatMembership(fake(other,{workspace_id:other,user_id:uid}),ws,uid)));
await test('wrong identity not accepted',()=>assert.rejects(assertSlimChatMembership(fake(other,{workspace_id:ws,user_id:other}),ws,uid)));
await test('backend errors sanitized and not ignored',()=>assert.rejects(assertSlimChatMembership(fake(uid,null,{message:'sensitive'}),ws,uid),e=>!e.message.includes('sensitive')));
await test('both authorized identifiers constrain the query',async()=>{const db=fake(other,{workspace_id:ws,user_id:uid});await assertSlimChatMembership(db,ws,uid);assert(db.calls.some(([k,v])=>k==='user_id'&&v===uid));assert(db.calls.some(([k,v])=>k==='workspace_id'&&v===ws));});
await test('invalid workspace rejected before query',async()=>{const db=fake(uid,null);await assert.rejects(assertSlimChatMembership(db,'invalid',uid));assert.equal(db.calls.length,0);});
await test('transport failure fails closed',()=>assert.rejects(assertSlimChatMembership({from(){throw Error('network secret');}},ws,uid),e=>!e.message.includes('secret')));
await test('future expiry permitted',()=>assertSlimChatMembership(fake(other,{workspace_id:ws,user_id:uid,access_expires_at:'2027-01-01T00:00:00Z'}),ws,uid,Date.parse('2026-10-15T00:00:00Z')));
await test('bearer verification preserved and no privileged fallback',()=>{const s=fs.readFileSync(new URL('../src/lib/ai-agent/auth-bearer.server.ts',import.meta.url),'utf8');assert(s.includes('supabase.auth.getUser(token)'));assert(s.includes('await assertSlimChatMembership(supabase, workspaceId, userId)'));assert(!s.includes('.rpc('));assert(!s.includes('supabaseAdmin'));assert(s.includes('publishableKey: anon'));});
console.log(`${n}/${n} chat membership checks passed. No API key or token read; no provider call or database privilege change.`);
