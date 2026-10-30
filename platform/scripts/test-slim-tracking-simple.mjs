import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const graph=JSON.parse(readFileSync(new URL('./fixtures/slim-tracking-simple.json',import.meta.url),'utf8'));
assert.equal(graph.length,3);
const start=graph.find(b=>b.config.isStartBlock);
const rule=start.config.roleta[0];
assert.equal(rule.alvo,'mensagem');
assert.equal(rule.tipo,'regex');
const regex=new RegExp(rule.valor);
const codes=[...Array.from({length:10},(_,i)=>'COD#055CT1C'+(i+1)),...Array.from({length:3},(_,i)=>'COD#055CT2C'+(i+8))];
let cases=0;
function route(message){
 const path=[];let id=start.id;
 while(id){assert.ok(path.length<4);const b=graph.find(b=>b.id===id);assert.ok(b);path.push(b);id=b===start?(regex.test(message)?rule.nextBlockId:b.next_block_id):b.next_block_id;}
 assert.equal(path.at(-1).type,'iniciar-salesbot');
 assert.equal(path.at(-1).config.destinoBotId,'f2b2925f-cdae-9488-4b86-f64191b26bb8');
 return path;
}
for(const code of codes)for(const suffix of ['', ' Quero conhecer', ': olá', '\nOlá']){
 const message='  '+code+suffix;
 assert.ok(regex.test(message),message);const path=route(message);
 assert.equal(path.length,3);assert.equal(path[1].config.acaoTipo,'tags');
 assert.equal(path[1].config.tagsModo,'adicionar');
 assert.equal(path[1].config.acaoConfig,'🎯META ADS');cases++;
}
for(const message of ['', 'Olá', 'utm_source=meta', 'Olá COD#055CT1C1', 'COD#055CT1C100', 'COD#055CT1C11', 'COD#055CT2C7', 'COD#055CT2C100', 'COD#055CT1C1extra']){
 assert.ok(!regex.test(message),message);assert.equal(route(message).length,2);cases++;
}
assert.ok(!graph.some(b=>b.config.acaoTipo==='definir-campo'||b.type==='encerrar-bot'));
console.log('PASS: '+cases+' entradas; 13 códigos originais; ambos os caminhos iniciam Pré-atendimento; sem gravação UTM.');

