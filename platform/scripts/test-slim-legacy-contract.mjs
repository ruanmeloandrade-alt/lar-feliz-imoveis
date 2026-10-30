import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');let n=0;
function test(name,run){run();n++;console.log('PASS legacy integration: '+name)}
const paths=['src/components/erp/SlimErpWorkspace.tsx','src/lib/slim-automation-metrics.server.ts'],before=paths.map(read);
const api=read('src/lib/slim-legacy-review.functions.ts'),ui=read('src/components/erp/SlimLegacyOrdersReview.tsx');
test('history has one sales list without the removed reconciliation panel',()=>{assert(!before[0].includes('<SlimLegacyOrdersReview'));assert(before[0].includes('<SlimOrderHistory'));});
test('both sources still contain verified transforms',()=>assert(before.every(s=>s.startsWith('// SLIM_LEGACY_REVIEW_V1'))));
execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-legacy-review.mjs',import.meta.url))],{stdio:'inherit'});
test('transform idempotent on real files',()=>assert.deepEqual(paths.map(read),before));
test('ERP metric source read with legacy mapping',()=>assert(before[1].includes("optional('slim_orders','id,customer_id,status,confirmed_at,legacy_lead_id')")));
test('metric events combined rather than raw concatenation',()=>assert(before[1].includes('metricPurchasesIncludingErp(legacyPurchases,erpOrders)')));
test('reader and mutation retain authenticated middleware',()=>assert.equal((api.match(/middleware\(\[requireSupabaseAuth\]\)/g)||[]).length,2));
test('operator and current workspace checked',()=>{assert(api.includes('if(ws!==expected)throw'));assert(api.includes('assertSlimOperator(sb,ws,context.userId)'))});
test('one explicit consent-based RPC, no direct writes or secret access',()=>{assert(api.includes("sb.rpc('slim_reconcile_legacy_sale'"));assert(api.includes('approved:z.literal(true)'));for(const x of ['supabaseAdmin','.insert(','.update(','.delete(','process.env','fetch('])assert(!api.includes(x))});
test('payment and stock mode start unselected',()=>{assert(ui.includes("[method,setMethod]=useState('')"));assert(ui.includes("[stockMode,setStockMode]=useState('')"));assert(ui.includes("[paymentStatus,setPaymentStatus]=useState('')"))});
test('uncertain request only recovers, no automatic replay',()=>{assert(ui.includes('Consultar resultado sem reenviar'));assert(ui.includes('if(!selected||inflight.current||uncertain||!q.data?.reconciliation.canReconcile)return'))});
test('download and new checkout preserved',()=>{assert(before[0].includes('getSlimOrderReceipt'));assert(before[0].includes('<SlimCheckout'))});
console.log(`${n}/${n} real-source legacy integration checks passed. Not a transactional or authenticated browser test.`);

// SLIM_GLOBAL_HISTORY_V1
