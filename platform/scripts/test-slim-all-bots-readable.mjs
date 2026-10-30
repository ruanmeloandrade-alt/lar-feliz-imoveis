
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchPlainSalesbotRule} from '../src/lib/salesbot-text-rules.ts';
import {outgoing,estimateHeight} from './lib/slim-bots-readable.mjs';
const before=JSON.parse(readFileSync(new URL('./fixtures/slim-all-bots-before-readable.json',import.meta.url),'utf8'));
const after=JSON.parse(readFileSync(new URL('./fixtures/slim-all-bots-readable.json',import.meta.url),'utf8'));
const canonical=x=>JSON.stringify(x);
let comparisons=0,converted=0,pairs=0;
const negatives=['','Olá','Não autorizado','Não informada','Quero comprar','Não quero sair','sair de férias','mais tarde','nenhum'];
for(const bot of after){
 const old=before.find(b=>b.id===bot.id);
 assert.ok(old);assert.equal(bot.blocks.length,old.blocks.length);
 assert.equal(bot.is_active,old.is_active);assert.deepEqual(bot.gatilhos,old.gatilhos);
 for(const block of bot.blocks){
  const original=old.blocks.find(b=>b.id===block.id);assert.ok(original);
  assert.equal(block.local_id,original.local_id);assert.equal(block.type,original.type);
  assert.equal(block.next_block_id,original.next_block_id);
  assert.deepEqual(outgoing(block).sort(),outgoing(original).sort());
  if(!(original.config.roleta||[]).some(r=>r.tipo==='regex'))assert.deepEqual(block.config,original.config);
  else {
   const expected={...original.config};delete expected.roleta;
   const actual={...block.config};delete actual.roleta;assert.deepEqual(actual,expected);
   for(const rule of original.config.roleta){
    if(rule.tipo!=='regex'){assert.deepEqual(block.config.roleta.find(r=>r.id===rule.id),rule);continue;}
    converted++;
    const replacement=block.config.roleta.filter(r=>r.id===rule.id||r.id===rule.id+'-sair');
    assert.ok(replacement.length);
    assert.ok(replacement.every(r=>r.nextBlockId===rule.nextBlockId&&r.alvo===rule.alvo&&r.campoId===rule.campoId));
    const samples=new Set(negatives);
    for(const r of replacement)for(const term of r.valor.split('\n')){
     samples.add(term);samples.add(term.charAt(0).toUpperCase()+term.slice(1));
     samples.add('Olá, '+term+' por favor');samples.add(term+'extra');
    }
    for(const sample of ['sair','SAIR','Sair!!! . ','sair.',' sair','sair\n'])samples.add(sample);
    for(const sample of samples){
     const expectedMatch=new RegExp(rule.valor).test(sample);
     const actualMatch=replacement.some(r=>matchPlainSalesbotRule(r.tipo,r.valor,sample));
     assert.equal(actualMatch,expectedMatch,bot.name+' '+rule.label+' '+JSON.stringify(sample));comparisons++;
    }
   }
  }
  assert.ok(!(block.config.roleta||[]).some(r=>r.tipo==='regex'));
  assert.ok(Number.isFinite(block.position_x)&&Number.isFinite(block.position_y));
 }
 for(let i=0;i<bot.blocks.length;i++)for(let j=i+1;j<bot.blocks.length;j++){
  const a=bot.blocks[i],b=bot.blocks[j];
  const overlapX=a.position_x<b.position_x+320&&b.position_x<a.position_x+320;
  const overlapY=a.position_y<b.position_y+estimateHeight(b)&&b.position_y<a.position_y+estimateHeight(a);
  assert.ok(!(overlapX&&overlapY),'Sobreposição '+bot.name+' '+a.id+' '+b.id);pairs++;
 }
}
assert.equal(converted,294);
assert.equal(after.length,19);
assert.equal(matchPlainSalesbotRule('igual','Autorizado','Não autorizado'),false);
assert.equal(matchPlainSalesbotRule('contem-lista','\n  \n','Olá'),false);
assert.equal(matchPlainSalesbotRule('contem-lista','preço\nvalor','QUAL O VALOR?'),true);
assert.equal(matchPlainSalesbotRule('resposta-igual','sair','não quero sair'),false);
console.log('PASS: 19 bots; 562 blocos preservados; '+converted+' regex substituídas; '+comparisons+' comparações; '+pairs+' pares sem sobreposição.');
