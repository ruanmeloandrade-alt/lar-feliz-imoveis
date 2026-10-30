import assert from 'node:assert/strict';import fs from 'node:fs';import {recoverUnchangedGroupCreation as recover} from '../src/lib/slim-group-recovery.core.ts';
const payload={name:'Original',system_prompt:'Manual',metadata:{settings:{mode:'prompt',sources:[]}}};const row=()=>({...structuredClone(payload),id:'agent',created_by:'owner',creation_payload:structuredClone(payload),updated_at:'2026-10-16T00:00:00Z'});let n=0;
function test(name,fn){fn();n++;console.log('PASS group creation recovery: '+name);}
test('unchanged creation can be recovered',()=>assert.equal(recover(row(),payload,'owner').id,'agent'));
test('changed prompt requires reopening instead of endorsing stale form',()=>assert.throws(()=>recover({...row(),system_prompt:'Novo manual'},payload,'owner')));
test('changed nested settings cannot be silently overwritten',()=>assert.throws(()=>recover({...row(),metadata:{settings:{mode:'prompt',sources:[{title:'New'}]}}},payload,'owner')));
test('other actor cannot recover this attempt',()=>assert.throws(()=>recover(row(),payload,'other')));
test('unrelated server fields do not alter configuration identity',()=>assert.equal(recover({...row(),extra_server_field:1},payload,'owner').recovered,true));
const core=fs.readFileSync(new URL('../src/lib/slim-group-prompt.core.ts',import.meta.url),'utf8');test('real save path applies recovery guard to full row',()=>{assert(core.includes('recoverUnchangedGroupCreation(row,payload,actorId)'));assert(core.includes("from('group_ai_agents').select('*').eq('workspace_id',data.workspaceId).eq('creation_request_id'"));});
console.log(`${n}/${n} group creation recovery checks passed. No database or provider used.`);
