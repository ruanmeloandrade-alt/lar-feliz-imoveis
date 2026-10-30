import fs from 'node:fs';
const root=new URL('../',import.meta.url);const mark='// SLIM_ERP_RELEASE_V1';const planned=[];
function edit(path,fn){let text=fs.readFileSync(new URL(path,root),'utf8');if(text.includes(mark))return;const once=(from,to)=>{if(text.split(from).length!==2)throw new Error(`ERP ${path}: expected unique integration anchor: ${from.slice(0,60)}`);text=text.replace(from,()=>to);};fn(once);planned.push([path,text+'\n'+mark+'\n']);}
edit('src/lib/slim-checkout-session.core.ts',once=>{
 once("export type CheckoutState =", "export class CheckoutRejected extends Error {}\nexport type CheckoutState =");
 once("catch{state='uncertain';error='Não foi possível confirmar o resultado. Consulte este pedido antes de refazê-lo.';}","catch(e){if(e instanceof CheckoutRejected){state='rejected';error=e.message;}else{state='uncertain';error='Não foi possível confirmar o resultado. Consulte este pedido antes de refazê-lo.';}}")
});
edit('src/routes/saude-slim.tsx',once=>{
 once('import { createFileRoute, Link }', 'import { SlimErpWorkspace } from "@/components/erp/SlimErpWorkspace";\nimport { createFileRoute, Link }');
 once('          <header className="rounded-lg border border-border bg-card p-5">',`          <h1 className="text-2xl font-semibold">Histórico de Vendas</h1>
          <SlimErpWorkspace mode="history" />
          <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">Histórico anterior do CRM (separado dos pedidos ERP)</summary>
          <p className="my-3 text-xs text-muted-foreground">Este bloco preserva os registros anteriores. Não soma novamente os pedidos acima nem comprova baixa de estoque dos registros antigos.</p>
          <header className="rounded-lg border border-border bg-card p-5">`);
 once('          </section>\n        </div>\n      </main>', '          </section>\n          </details>\n        </div>\n      </main>');
});
edit('src/routes/painel.tsx',once=>{
 once('import { createFileRoute', 'import { SlimErpWorkspace } from "@/components/erp/SlimErpWorkspace";\nimport { createFileRoute');
 once('            {metrics && !dashboardQuery.error && metrics.read_status !== "error" ? <>',`            <SlimErpWorkspace mode="summary" />
            <p className="text-xs text-muted-foreground">Abaixo: indicadores de oportunidades e atendimento do CRM. Os totais de pedidos, recebimentos e cancelamentos estão no bloco Gestão ERP acima.</p>
            {metrics && !dashboardQuery.error && metrics.read_status !== "error" ? <>`);
});
for(const [path,text] of planned)fs.writeFileSync(new URL(path,root),text);
console.log(`[Slim ERP] ${planned.length} checked integration targets connected. No SQL or production mutation occurs in this build script.`);
