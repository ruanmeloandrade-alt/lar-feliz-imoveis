import assert from 'node:assert/strict';
import { resolveAgentBrainSources, buildWorkspaceAgentKnowledgeBlock } from '../src/lib/agent-brain-sources.server.ts';
const calls = [];
function db(rows, error = null) {
  return { from(table) {
    assert.equal(table, 'ai_brain_sources'); const filters = {};
    return { select() { return this; }, eq(k,v) { filters[k]=v; return this; },
      async in(k,ids) { calls.push(filters); return {error,data: rows.filter(r=>r.workspace_id===filters.workspace_id && r.enabled===filters.enabled && ids.includes(r[k]))}; } };
  }, storage: { from(bucket) { return { async download(path) {
    assert.equal(bucket,'saude-slim-brain'); assert.equal(path,'slim/guia.txt');
    return {data:new Blob(['Conteúdo atual do documento']),error:null};
  } }; } } };
}
const rows=[{id:'a',workspace_id:'slim',title:'Fonte atual',source_type:'text',content:'Texto atualizado',enabled:true},
  {id:'b',workspace_id:'slim',title:'Pausada',content:'Não usar',enabled:false},
  {id:'c',workspace_id:'outra',title:'Outra empresa',content:'Privado',enabled:true}];
const linked=[{brainSourceId:'a',content:'Cópia antiga'},{brainSourceId:'b',content:'Cópia pausada'},{brainSourceId:'c',content:'Cópia externa'},{content:'Texto próprio'}];
const result=await resolveAgentBrainSources(db(rows),'slim',linked);
assert.deepEqual(result.inline,[{content:'Texto próprio'}]);
assert.equal(result.brain.length,1);assert.equal(result.brain[0].content,'Texto atualizado');
assert.deepEqual(calls[0],{workspace_id:'slim',enabled:true});
const block=await buildWorkspaceAgentKnowledgeBlock(db(rows),'slim',linked);
assert.match(block,/Texto atualizado/);assert.match(block,/Texto próprio/);assert.doesNotMatch(block,/Cópia|Não usar|Privado/);
rows[0].content='Edição seguinte';assert.match(await buildWorkspaceAgentKnowledgeBlock(db(rows),'slim',linked),/Edição seguinte/);
rows[0].enabled=false;assert.equal((await resolveAgentBrainSources(db(rows),'slim',linked)).brain.length,0);
await assert.rejects(()=>resolveAgentBrainSources(db(rows,{message:'offline'}),'slim',linked),/fontes atuais/);
await assert.rejects(()=>resolveAgentBrainSources(db(rows),'',linked),/Empresa/);
const document={id:'d',workspace_id:'slim',title:'Guia',source_type:'document',storage_path:'slim/guia.txt',file_name:'guia.txt',enabled:true};
assert.match(await buildWorkspaceAgentKnowledgeBlock(db([document]),'slim',[{brainSourceId:'d'}]),/Conteúdo atual do documento/);
for (const path of ['outra/guia.txt','slim/../outra/guia.txt']) {
  await assert.rejects(()=>resolveAgentBrainSources(db([{...document,storage_path:path}]),'slim',[{brainSourceId:'d'}]),/não pertence/);
}
assert.equal((await resolveAgentBrainSources(db([]),'slim',[{brainSourceId:'deleted',content:'stale'}])).brain.length,0);
assert.equal((await resolveAgentBrainSources(db([]),'slim',[{id:'local-uuid',content:'Inline original'}])).inline.length,1);
console.log('PASS: live edits, pause/delete, tenant isolation, no stale fallback, query error, private document bucket and legacy inline sources.');
