import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');let n=0;
function check(name,fn){fn();n++;console.log('PASS stock integration: '+name);}
const paths=['src/routes/crm.estoque.tsx','src/components/erp/SlimCheckout.tsx','src/components/erp/SlimErpWorkspace.tsx'];const before=paths.map(read);
const ui=read('src/components/erp/SlimStockWorkspace.tsx'),server=read('src/lib/slim-stock-view.functions.ts');
check('three actual source consumers wired',()=>assert(before.every(s=>s.split(/\r?\n/).includes('// SLIM_STOCK_VISIBILITY_V1'))));
check('previous transform header retained',()=>assert(before[2].startsWith('// SLIM_LEGACY_REVIEW_V1')));
check('active stock route mounts new ledger component',()=>{assert(before[0].includes('component: EstoqueErpPage'));assert(before[0].includes('<SlimStockWorkspace/>'));assert(before[0].includes('createFileRoute("/crm/estoque")'));});
check('stock screen does not use whole-real currency helper or legacy catalog',()=>{for(const term of ['crm-mock','listSaudeSlimCatalogs','Math.round','MOCK_'])assert(!ui.includes(term));assert(ui.includes('formatStockCents(p.priceCents)'));});
check('stock cache separated by company and operator and refreshes',()=>{assert(ui.includes("['slim-stock-catalog',workspaceId,actorId]"));assert(ui.includes("['slim-stock-movements',workspaceId,actorId]"));assert(ui.includes('refetchInterval:15000'));});
check('error not shown as zero or nonexistent products',()=>{assert(ui.includes('const data=!stock.error'));assert(ui.includes('stock.error?<p role="alert"'));assert(ui.includes('ledger.error?<p role="alert"'));});
check('stock endpoints use authentication and expected current workspace',()=>{assert.equal((server.match(/middleware\(\[requireSupabaseAuth\]\)/g)||[]).length,2);assert(server.includes('current_workspace_id!==expected'));assert(server.includes('assertErpContext('));});
check('stock reader has no mutation or external transport',()=>{for(const t of ['.rpc(','.insert(','.update(','.delete(','supabaseAdmin','fetch(','process.env'])assert(!server.includes(t));});
check('stock movement labels distinguish historical and current balance',()=>{assert(ui.includes('não o saldo atual'));assert(ui.includes('Saldo anterior'));assert(ui.includes('Saldo após'));});
check('rejected quote recalculated from edited draft',()=>{assert(before[1].includes('preview=currentCheckoutPreview(state,quote)'));assert(!before[1].includes('preview=state?.quote??quote()'));});
check('PDF bytes verified before available in dialog',()=>{const s=before[2];assert(s.indexOf('await verifyReceiptDownload(result,{workspaceId,orderId})')<s.indexOf('setPdf({...result,verifiedBytes})'));assert(s.includes('const bytes=pdf.verifiedBytes'));});
check('stock reader cannot regularize sales or send documents',()=>{assert(!server.includes('slim_reconcile_legacy_sale'));assert(!server.includes('get_evolution_credentials'));assert(!server.includes('sendSlimOrderDocument'));});
execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-stock-visibility.mjs',import.meta.url))],{stdio:'inherit'});
check('transform is idempotent over real sources',()=>assert.deepEqual(paths.map(read),before));
console.log(`${n}/${n} actual-source stock integration checks passed. Not an authenticated browser test.`);

// SLIM_LEGACY_ACCEPTED_STOCK_V1
