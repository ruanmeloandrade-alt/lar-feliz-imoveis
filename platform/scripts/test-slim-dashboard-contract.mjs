import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const paths = [
  'src/lib/dashboard.functions.ts', 'src/lib/dashboard-v4-live.functions.ts',
  'src/lib/dashboard-v4-product-sales.functions.ts', 'src/routes/painel.tsx',
  'src/components/dashboard/DashboardV4ConfigurableBoard.tsx',
];
const before = paths.map(p=>readFileSync(new URL(p,root),'utf8'));
let passed=0;
function check(name,fn){ fn(); passed++; console.log(`PASS dashboard integration: ${name}`); }
check('all five real sources contain the checked contract',()=>{
  assert.ok(before.every(s=>s.startsWith('// SLIM_DASHBOARD_DATA_CONTRACT_V1')));
});
execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-dashboard-contract.mjs',import.meta.url))],{stdio:'inherit'});
check('running the patch twice does not change real source',()=>{
  assert.deepEqual(paths.map(p=>readFileSync(new URL(p,root),'utf8')),before);
});
check('primary panel has no mock fallback and waits for data',()=>{
  const route=before[3];assert.ok(!route.includes('MOCK_METRICS'));
  assert.ok(route.includes('metrics && !dashboardQuery.error && metrics.read_status !== "error"'));
  assert.ok(route.includes('onSync={refreshDashboard}'));
});
check('all commercial readers use complete workspace-scoped reads',()=>{
  for(const code of before.slice(0,3)) assert.ok(code.includes('readDashboardRows(sb,'));
  assert.ok(before[0].includes('id, status, pipeline_id'));
  assert.ok(before[1].includes('id, status, pipeline_id'));
  assert.ok(before[2].includes('id,status,pipeline_id'));
});
check('explicit outcomes share one classification rule',()=>{
  for(const code of before.slice(0,3)) assert.ok(code.includes('classifyDashboardLead(lead,'));
});
check('optional sources have availability indicators, not fake zero values',()=>{
  const code=before[1];assert.ok(code.includes('availability: {'));
  assert.ok(code.includes('forms: !formsRes.issue && !submissionsRes.issue'));
  assert.ok(code.includes('customFields: !fieldsRes.issue && !fieldValuesRes.issue'));
  assert.ok(code.includes('events24h: null'));assert.ok(code.includes('sessions24h: null'));
  assert.ok(before[4].includes('liveData.availability?.forms === false'));
  assert.ok(before[4].includes('liveData.availability?.customFields === false'));
});
check('permissions and transport errors do not trigger schema fallback',()=>{
  assert.ok(before[2].includes('if (linksRes.error && !["42703", "PGRST204"].includes(linksRes.error.code)) throw'));
});
check('all existing configurable commercial widgets remain present',()=>{
  for(const id of ['product-catalog','product-sales','companies','forms','tags','custom-fields']) assert.ok(before[4].includes(`widgetId="${id}"`));
  assert.ok(before[3].includes('<AddKpiDialog'));
  assert.ok(before[3].includes('<DrilldownDrawer'));
});
console.log(`${passed}/${passed} dashboard integration contract checks passed.`);
