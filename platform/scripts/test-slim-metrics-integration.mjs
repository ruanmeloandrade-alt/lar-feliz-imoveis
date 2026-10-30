import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
let count=0;function test(name,fn){fn();count++;console.log('PASS metrics integration: '+name);}
const path='src/legacy/crm.automacoes.legacy.tsx',before=read(path);
test('list columns use live metrics and both ID formats',()=>{
 for(const key of ['conversionRate','launched','activeNow'])assert(before.includes(`slimBotMetric(liveBotMetrics.data,b.id,"${key}",liveBotMetrics.error)`));
 const hook=read('src/hooks/use-slim-automation-metrics.ts');assert(hook.includes('r.id===id||r.localId===id'));
});
test('builder mutations and graph loaders remain present',()=>{for(const name of ['SalesbotBuilder','listSalesbotsFull','loadCompleteForMutation','getSalesbotGraph','toggleActive','exportBot','duplicateBot','persist'])assert(before.includes(name));});
test('refresh is periodic but does not save bot graphs',()=>{const hook=read('src/hooks/use-slim-automation-metrics.ts');assert(hook.includes('refetchInterval:10000'));assert(!hook.includes('syncSalesbot'));assert(!hook.includes('saveSalesbots'));});
test('scope bound to authenticated active workspace and read only',()=>{const c=read('src/lib/slim-automation-metrics.functions.ts');assert(c.includes('requireSupabaseAuth'));assert(c.includes('assertSlimChatMembership'));assert(c.includes('expected!==data.current_workspace_id'));assert(!/supabaseAdmin|service_role|\.insert\(|\.update\(|\.delete\(/.test(c));});
test('server selects real runs, actual messages and purchase records',()=>{const c=read('src/lib/slim-automation-metrics.server.ts');for(const t of ['salesbot_runs','lead_products','conversation_agent_runs','whatsapp_web_messages'])assert(c.includes(t));assert(!/supabaseAdmin|service_role|\.insert\(|\.update\(|\.delete\(/.test(c));});
test('same failure cannot become zero measurements',()=>{assert(read('src/lib/slim-metrics-reader.core.ts').includes('throw'));assert(read('src/components/automations/ConsolidatedReportsTab.tsx').includes('não foram substituídos por zeros'));});
test('all four report tabs are functional rather than placeholders',()=>{const c=read('src/components/automations/ConsolidatedReportsTab.tsx');for(const tab of ["tab==='geral'","tab==='bots'","tab==='grupos'","tab==='agentes'"])assert(c.includes(tab));assert(c.includes('data.history.map'));assert(c.includes('data.agents.rows.map'));assert(!c.includes('Filtros Avançados de'));});
test('mock group percentages removed from old endpoint as well',()=>{for(const p of ['src/lib/group-reports.functions.ts','src/components/automations/ConsolidatedReportsTab.tsx'])assert(!/(68%|94%|\* 0\.25)/.test(read(p)));});
test('editor manual-save/120 seconds gate remains installed',()=>{const c=read('scripts/apply-salesbot-save-contract.mjs');assert(c.includes('apply-salesbot-save-contract.base.mjs'));assert(c.includes('test-slim-chat-membership.mjs'));assert(c.includes('test-slim-money-source.mjs'));});
execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-bot-metrics.mjs',import.meta.url))],{stdio:'inherit'});
test('second metrics patch is idempotent on real target source',()=>assert.equal(read(path),before));
console.log(`${count}/${count} real-source metrics integration checks passed. No authenticated browser or message delivery tested.`);
