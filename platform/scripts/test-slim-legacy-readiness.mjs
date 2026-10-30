import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {legacyReconciliationReadiness,assertLegacyReconciliationReady,LEGACY_ACCEPTANCE} from '../src/lib/slim-legacy-readiness.core.ts';
let n=0;function test(name,run){run();n++;console.log('PASS legacy readiness: '+name);}
test('release carries explicit isolated SQL acceptance evidence',()=>{assert.equal(LEGACY_ACCEPTANCE.checks,29);assert.equal(LEGACY_ACCEPTANCE.kind,'isolated-postgresql-with-live-body-parity');assert(Object.isFrozen(LEGACY_ACCEPTANCE));});
test('validated release is available, not automatically applied',()=>{assert.equal(legacyReconciliationReadiness().canReconcile,true);assert.match(legacyReconciliationReadiness().message,/Nenhuma venda antiga é alterada automaticamente/);assert.doesNotThrow(assertLegacyReconciliationReady);});
test('consumer cannot mutate readiness globally',()=>{const s=legacyReconciliationReadiness();s.canReconcile=false;assert.equal(legacyReconciliationReadiness().canReconcile,true);});
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const paths=['src/lib/slim-legacy-review.functions.ts','src/components/erp/SlimLegacyOrdersReview.tsx'];const before=paths.map(read);
test('server still validates operator and explicit approval',()=>{assert(before[0].includes('approved:z.literal(true)'));assert(before[0].includes('assertSlimOperator(sb,ws,context.userId)'));assert(before[0].includes('if(ws!==expected)throw'));});
test('server checks readiness before financial RPC',()=>{const code=before[0].split('export const reconcileSlimLegacySale=')[1];assert(code.indexOf('assertLegacyReconciliationReady();')>=0);assert(code.indexOf('assertLegacyReconciliationReady();')<code.indexOf("sb.rpc('slim_reconcile_legacy_sale'"));});
test('UI retains approval, payment, stock and complete-origin conditions',()=>assert(before[1].includes('!approved||!method||!paymentStatus||!stockMode||!target.canReview||!q.data?.reconciliation.canReconcile')));
test('SQL acceptance reruns at every build before compilation',()=>assert(read('package.json').includes('node --experimental-strip-types scripts/test-slim-legacy-postgres.mjs')));
execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-legacy-readiness.mjs',import.meta.url))],{stdio:'inherit'});
test('readiness transform remains idempotent',()=>assert.deepEqual(paths.map(read),before));
console.log(`${n}/${n} legacy readiness/consent checks passed. Live business records were not reconciled.`);
