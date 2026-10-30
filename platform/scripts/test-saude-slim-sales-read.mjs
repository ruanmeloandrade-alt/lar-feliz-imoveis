import assert from 'node:assert/strict';
import { readAllSalesRows, salesStatus } from '../src/lib/saude-slim-sales-read.core.ts';
let count = 0;
async function check(name, run) { await run(); count++; console.log(`PASS ${name}`); }
await check('More than one thousand rows are retained', async () => {
  const source = Array.from({ length: 1253 }, (_, id) => ({ id }));
  const result = await readAllSalesRows(async (from, to) => ({ data: source.slice(from, to + 1), error: null }));
  assert.deepEqual(result, source);
});
await check('A lower server page cap does not cause gaps or truncation', async () => {
  const source = Array.from({ length: 755 }, (_, id) => id);
  const result = await readAllSalesRows(async (from, to) => ({ data: source.slice(from, Math.min(to + 1, from + 200)), error: null }));
  assert.deepEqual(result, source);
});
await check('Failure on a later page is not reported as a complete result', async () => {
  await assert.rejects(readAllSalesRows(async (from) => from ? { data: null, error: { message: 'controlled failure' } } : { data: [1], error: null }), /controlled failure/);
});
await check('Empty data and malformed responses are distinct', async () => {
  assert.deepEqual(await readAllSalesRows(async () => ({ data: [], error: null })), []);
  await assert.rejects(readAllSalesRows(async () => ({ data: null, error: null })), /Resposta inválida/);
});
await check('Safety limit and invalid arguments fail visibly', async () => {
  await assert.rejects(readAllSalesRows(async () => ({ data: [1], error: null }), 1, 2), /limite de segurança/);
  await assert.rejects(readAllSalesRows(async () => ({ data: [], error: null }), 0), /paginação inválida/);
});
await check('Lost is not changed to won by the stage label', async () => {
  assert.equal(salesStatus('lost', 'Vendas ganhas'), 'lost');
  assert.equal(salesStatus('won', 'Cancelado'), 'won');
});
await check('Legacy stage inference remains for open leads', async () => {
  assert.equal(salesStatus('active', 'Concluído'), 'won');
  assert.equal(salesStatus('active', 'Cancelado'), 'lost');
  assert.equal(salesStatus('active', 'Atendimento'), 'open');
});
console.log(`${count}/${count} sales history regression checks passed.`);
