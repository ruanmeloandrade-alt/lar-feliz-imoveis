import assert from 'node:assert/strict';
const originalTimeout = globalThis.setTimeout;
const originalClear = globalThis.clearTimeout;
let now = 0, counter = 0, imports = 0;
const scheduled = new Map();
globalThis.setTimeout = (fn, ms = 0) => { const id = ++counter; scheduled.set(id, { at: now + ms, fn }); return id; };
globalThis.clearTimeout = (id) => { scheduled.delete(id); };
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
async function advance(ms) {
  const target = now + ms;
  while (true) {
    await settle();
    const next = [...scheduled.entries()].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
    if (!next) break;
    now = next[1].at; scheduled.delete(next[0]); next[1].fn();
  }
  now = target; await settle();
}
async function fresh() {
  scheduled.clear(); now = 0;
  return import(new URL(`../src/lib/salesbot-sync-queue.ts?case=${++imports}`, import.meta.url));
}
let passed = 0;
async function test(label, fn) { await fn(await fresh()); passed++; console.log('PASS '+label); }
try {
  await test('edits remain dirty, no write at 700ms, 60s or 119999ms',async q=>{
    let calls=0;
    q.scheduleSalesbotSave('a',async()=>{calls++;});
    assert.equal(q.getSalesbotSaveStatus().status,'dirty');
    await advance(700); assert.equal(calls,0);
    await advance(59_300); assert.equal(calls,0);
    await advance(59_999); assert.equal(calls,0);
    await advance(1); assert.equal(calls,1); assert.equal(q.getSalesbotSaveStatus().status,'saved');
  });
  await test('continuous typing sends only latest contents at two minutes',async q=>{
    const sent=[];
    q.scheduleSalesbotSave('a',async()=>{sent.push('old');});
    await advance(60_000);
    q.scheduleSalesbotSave('a',async()=>{sent.push('new');});
    await advance(59_999); assert.deepEqual(sent,[]);
    await advance(1); assert.deepEqual(sent,['new']);
  });
  await test('manual Save runs now and cancels duplicate autosave',async q=>{
    let calls=0;
    q.scheduleSalesbotSave('a',async()=>{calls++;});
    await advance(10_000); await q.flushAllSalesbotSaves();
    assert.equal(calls,1); assert.equal(q.hasPendingSalesbotSaves(),false);
    await advance(240_000); assert.equal(calls,1);
  });
  await test('failed Save rejects, preserves exact error and unsaved warning',async q=>{
    q.scheduleSalesbotSave('a',async()=>{throw new Error('42501 test');});
    await assert.rejects(q.flushAllSalesbotSaves(),/42501 test/);
    assert.equal(q.getSalesbotSaveStatus().status,'error');
    assert.equal(q.getSalesbotSaveStatus().error,'42501 test');
    assert.equal(q.hasPendingSalesbotSaves(),true);
  });
  await test('manual retry recovers an actual failed task',async q=>{
    let calls=0;
    q.scheduleSalesbotSave('a',async()=>{ if (++calls===1) throw new Error('temporary'); });
    await assert.rejects(q.flushSalesbotSave('a'));
    await q.flushSalesbotSave('a');
    assert.equal(calls,2); assert.equal(q.getSalesbotSaveStatus().status,'saved');
  });
  await test('typing during request waits a new two-minute window',async q=>{
    let finish; const sent=[];
    q.scheduleSalesbotSave('a',()=>new Promise(resolve=>{finish=resolve;sent.push('first');}));
    const save=q.flushSalesbotSave('a'); await settle();
    await advance(1_000);
    q.scheduleSalesbotSave('a',async()=>{sent.push('second');});
    finish(); await save; await settle();
    assert.deepEqual(sent,['first']); assert.equal(q.getSalesbotSaveStatus().status,'dirty');
    await advance(119_999); assert.deepEqual(sent,['first']);
    await advance(1); assert.deepEqual(sent,['first','second']);
  });
  await test('timeout is failure, never success, and late request keeps lock',async q=>{
    let finish; let calls=0;
    q.scheduleSalesbotSave('a',()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
    const result=q.flushSalesbotSave('a').then(()=>null,e=>e);
    await settle(); await advance(45_000);
    assert.match((await result).message,/servidor/);
    assert.equal(q.getSalesbotSaveStatus().status,'error');
    await assert.rejects(q.flushSalesbotSave('a'),/servidor/); assert.equal(calls,1);
    finish(); await settle();
    q.scheduleSalesbotSave('a',async()=>{calls++;});
    await q.flushSalesbotSave('a'); assert.equal(calls,2);
  });
  await test('concurrent explicit operations are serialized per bot',async q=>{
    let finish; const order=[];
    const first=q.enqueueSalesbotSync('a',()=>new Promise(resolve=>{order.push('start');finish=resolve;}));
    const second=q.enqueueSalesbotSync('a',async()=>{order.push('after');});
    await settle(); assert.deepEqual(order,['start']);
    finish(); await Promise.all([first,second]); assert.deepEqual(order,['start','after']);
  });
  console.log(`SalesBot save contract: ${passed}/${passed} PASS`);
} finally { globalThis.setTimeout=originalTimeout; globalThis.clearTimeout=originalClear; }
