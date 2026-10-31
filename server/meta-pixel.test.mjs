import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const script=await readFile(new URL('../public/meta-pixel.js',import.meta.url),'utf8');
function page(pathname='/',hostname='www.corretoravanessasimoni.com'){
  const inserted=[];
  const window={location:{pathname,hostname}};
  const document={createElement:()=>({}),getElementsByTagName:()=>[{parentNode:{insertBefore:(node)=>inserted.push(node)}}]};
  return {window,document,inserted};
}
test('initializes the supplied pixel and sends one PageView on the public domain',()=>{
  const context=page();runInNewContext(script,context);runInNewContext(script,context);
  assert.equal(context.inserted.length,1);
  assert.equal(context.inserted[0].src,'https://connect.facebook.net/en_US/fbevents.js');
  assert.equal(JSON.stringify(context.window.fbq.queue.map(args=>Array.from(args))),JSON.stringify([['init','1893599451303631'],['track','PageView']]));
});
test('does not load Meta in the internal platform or development preview',()=>{
  for(const context of [page('/admin'),page('/pedidos'),page('/crm/produtos'),page('/painel'),page('/','127.0.0.1')]){
    runInNewContext(script,context);assert.equal(context.inserted.length,0);assert.equal(context.window.fbq,undefined);
  }
});
