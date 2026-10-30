import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');let n=0;
function test(name,fn){fn();n++;console.log('PASS ERP source: '+name);}
const routes=['src/routes/pedidos.tsx','src/routes/saude-slim.tsx','src/routes/painel.tsx'];
const sources=routes.map(read),server=read('src/lib/slim-erp-release.functions.ts'),ui=read('src/components/erp/SlimErpWorkspace.tsx');
test('three existing destinations connected',()=>{for(const [i,mode] of ['checkout','history','summary'].entries())assert(sources[i].includes(`mode="${mode}"`));});
test('no old nonatomic creator in new checkout',()=>{for(const t of ['createSaudeSlimLead','addSaudeSlimOrderProduct','createSaudeSlimProduct'])assert(!sources[0].includes(t));});
test('one operational history without mounting legacy readers',()=>{assert.equal(sources[1].split('mode="history"').length-1,1);for(const old of ['getSaudeSlimSalesHistory','getSaudeSlimSalesProducts','<details','sales-history-products'])assert(!sources[1].includes(old));});
test('CRM opportunity counts are not mixed with ERP revenue',()=>assert(sources[2].includes('indicadores de oportunidades e atendimento do CRM')));
test('patch is idempotent over the real sources',()=>{const paths=[...routes,'src/lib/slim-checkout-session.core.ts'];const before=paths.map(read);execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-erp-release.mjs',import.meta.url))],{stdio:'inherit'});assert.deepEqual(paths.map(read),before);});
test('confirmation and cancellation use authenticated atomic RPCs',()=>{assert(server.includes("sb.rpc('slim_confirm_order'"));assert(server.includes("sb.rpc('slim_cancel_order'"));});
test('no privileged client, direct mutations or provider transport',()=>{const hashing="createHash('sha256').update(pdf)";assert.equal(server.split(hashing).length-1,1);const operations=server.replace(hashing,'HASH_DOCUMENT_BYTES');for(const forbidden of ['supabaseAdmin','.insert(','.update(','.delete(','fetch(','process.env','get_evolution_credentials_service'])assert(!operations.includes(forbidden),forbidden);});
test('confirmation bounded and verified before success',()=>{assert(server.includes('items:z.array'));assert(server.includes('.min(1).max(100)'));assert(server.includes('confirmReceiptShape(result.data,ws,data.requestId,data.quote.totalCents)'));});
test('workspace and operator validated on server',()=>{assert(server.includes('assertErpContext('));assert(server.includes('assertSlimOperator(sb,ws,context.userId)'));});
test('document from stored original rather than client quote or current catalog',()=>{const s=server.split('export const getSlimOrderReceipt=')[1];assert(s.includes('validateOrderSnapshot(row.snapshot,ws)'));assert(s.includes('loadErpOrder(sb,ws,data.orderId)'));assert(s.includes("createHash('sha256')"));assert(!s.includes("from('products')"));});
test('read surfaces share canonical complete-order reader',()=>assert(server.includes('return loadErpOrders(sb,ws)')));
test('checkout reference preserved before network and verified before clearing',()=>{assert(ui.indexOf('journal().begin(requestId)')<ui.indexOf('await confirm('));assert(ui.includes('const verified=verifyCheckoutReceipt(quote,requestId,response.receipt);clearJournal(requestId)'));});
test('recovery performs reads only',()=>{const r=ui.split('async function recover(')[1].split('useEffect(')[0];assert(r.includes('lookup('));assert(!r.includes('confirm('));});
test('same-workspace background refresh preserves checkout review',()=>{assert(!ui.includes('identity.isFetching?'));assert(ui.includes('key={`${identity.data.workspaceId}:${identity.data.actorId}:${mode}`}'));});
test('actual cancel requires reason and explicit operator decision',()=>{assert(ui.includes('window.prompt('));assert(ui.includes('if(!reason?.trim())return;'));});
test('previous regression gates remain',()=>{const p=read('scripts/apply-salesbot-save-contract.mjs');for(const name of ['apply-salesbot-save-contract.base','test-slim-money-source','test-slim-chat-membership','test-slim-metrics-integration','test-slim-checkout-preparation','test-slim-erp-release'])assert(p.includes(name));});
test('unrelated inbox, autonomous copilot and goals changes not added',()=>{for(const name of ['sendSlimOrderDocument','ObjectiveCanvas','createGroup','SupportRobot'])assert(!ui.includes(name));});
console.log(`${n}/${n} ERP real-source contract checks passed; no authenticated browser or external message tested.`);

// SLIM_HISTORY_MEDIA_STAGE_HOTFIX_V1
