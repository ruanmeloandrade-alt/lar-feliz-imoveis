import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');let n=0;
function test(name,fn){fn();n++;console.log('PASS recovery integration: '+name);}
const paths=['src/components/erp/SlimErpWorkspace.tsx','src/lib/slim-erp-release.functions.ts'];const before=paths.map(read),ui=before[0],server=read('src/lib/slim-checkout-recovery.functions.ts');
test('both target sources updated without replacing old headers',()=>{assert(before.every(s=>s.includes('// SLIM_CHECKOUT_RECOVERY_V1')));assert(ui.startsWith('// SLIM_LEGACY_REVIEW_V1'));});
test('idempotent transform',()=>{execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-checkout-recovery.mjs',import.meta.url))],{stdio:'inherit'});assert.deepEqual(paths.map(read),before);});
test('explicit button and confirmation',()=>{assert(ui.includes('Encerrar tentativa sem pedido'));const handler=ui.split('async function closeInterruptedAttempt(){')[1].split('const transport=')[0];assert(handler.indexOf('window.confirm(')<handler.indexOf('closeAttempt('));assert(handler.includes('recoveryFlight.current=true'));assert(handler.includes('finally{recoveryFlight.current=false'));});
test('recovery does not call confirm or cancel order',()=>{assert(server.includes("sb.rpc('slim_close_checkout_attempt'"));for(const forbidden of ['slim_cancel_order','slim_confirm_order','supabaseAdmin','.insert(','.update(','.delete(','fetch(','process.env'])assert(!server.includes(forbidden),forbidden);});
test('same operator and active workspace enforced',()=>{assert(server.includes('requireSupabaseAuth'));assert(server.includes('assertErpContext(data.workspaceId,ws,actor'));assert(server.includes('assertSlimOperator(sb,data.workspaceId,actor)'));assert(server.includes('row.created_by!==actor'));});
test('response validated before local journal is cleared',()=>{assert(ui.includes('finishCheckoutRecovery({approved:true'));assert(server.includes('validateCheckoutRecovery('));const core=read('src/lib/slim-checkout-recovery.core.ts');assert(core.indexOf('validateCheckoutRecovery(await args.send()')<core.indexOf('args.journal.clear('));});
test('ordinary lookup remains read-only and notices closed attempts',()=>{const lookup=before[1].split('export const lookupSlimErpOrder=')[1].split('export const cancelSlimErpOrder=')[0];assert(lookup.includes("from('slim_checkout_attempt_closures').select"));assert(!lookup.includes('.rpc('));assert(!lookup.includes('.insert('));assert(lookup.includes("if(closure.error)throw"));});
test('pending outcome never clears a reference automatically',()=>{const core=read('src/lib/slim-checkout-recovery.core.ts');assert(core.includes("if(result.state!=='processing')"));assert(ui.includes("if(result.state==='processing')"));});
test('unrelated messaging and copilot requests remain outside recovery',()=>{for(const name of ['sendSlimOrderDocument','createGroup','SupportRobot'])assert(!ui.includes(name));});
console.log(`${n}/${n} real-source checkout-recovery contract checks passed. No authenticated browser or concurrent database-session test.`);
