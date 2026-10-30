import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const graph=JSON.parse(readFileSync(new URL('./fixtures/slim-pre-follow-simple.json',import.meta.url),'utf8'));
const before=JSON.parse(readFileSync(new URL('./fixtures/slim-pre-follow-before.json',import.meta.url),'utf8'));
const start=graph.find(b=>b.config.isStartBlock);
assert.equal(graph.filter(b=>b.config.isStartBlock).length,1);
assert.equal(graph.filter(b=>b.type==='validacao').length,1);
assert.equal(start.config.roleta.length,9);
assert.equal(graph.length,before.length-1);
assert.ok(!JSON.stringify(graph).includes('"regex"'));
for(const b of graph.filter(b=>b.id!==start.id)){
 const old=before.find(o=>o.id===b.id);
 assert.deepEqual(b,old,'Preservar exatamente bloco ajustado '+b.id);
}
let cases=0;
for(const rule of start.config.roleta){
 assert.equal(rule.tipo,'contem');assert.equal(rule.alvo,'campo');
 assert.equal(rule.valor,rule.label);
 for(const value of [rule.label,rule.label.toLowerCase()]){
  const match=start.config.roleta.find(r=>value.toLowerCase().includes(r.valor.toLowerCase()));
  assert.equal(match.nextBlockId,rule.nextBlockId);
  const end=graph.find(b=>b.id===match.nextBlockId);
  assert.equal(end.type,'encerrar-bot');
  assert.equal(end.config.encerrarAcoes[0].tipo,'iniciar-salesbot');cases++;
 }
}
for(const value of ['', 'Sem origem']){
 assert.ok(!start.config.roleta.some(r=>value.toLowerCase().includes(r.valor.toLowerCase())));
 const note=graph.find(b=>b.id===start.next_block_id);assert.equal(note.type,'msg-interna');
 assert.equal(graph.find(b=>b.id===note.next_block_id).type,'encerrar-bot');cases++;
}
console.log('PASS: '+cases+' casos; uma validação Contém; 9 regras; destinos e ajustes restantes preservados integralmente.');

