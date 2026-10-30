import fs from 'node:fs';
const root=new URL('../',import.meta.url),mark='// SLIM_LEGACY_REVIEW_V1',plans=[];
function edit(path,run){let code=fs.readFileSync(new URL(path,root),'utf8');if(code.startsWith(mark))return;
 const once=(from,to)=>{if(code.split(from).length!==2)throw new Error(`[Slim legacy] ${path}: unexpected source anchor ${from.slice(0,70)}`);code=code.replace(from,()=>to);};
 run(once);plans.push([path,mark+'\n'+code]);
}
edit('src/components/erp/SlimErpWorkspace.tsx',once=>{
 once("import {SlimOrderHistory} from './SlimOrderHistory';","import {SlimOrderHistory} from './SlimOrderHistory';\nimport {SlimLegacyOrdersReview} from './SlimLegacyOrdersReview';");
 once("{mode==='summary'?<section","{mode==='history'&&<SlimLegacyOrdersReview workspaceId={workspaceId} actorId={actorId}/>}\n  {mode==='summary'?<section");
});
edit('src/lib/slim-automation-metrics.server.ts',once=>{
 once("import {aggregateBotMetrics,aggregateMessages,aggregateAgentRuns}","import {metricPurchasesIncludingErp} from './slim-legacy-review.core';\nimport {aggregateBotMetrics,aggregateMessages,aggregateAgentRuns}");
 once('const [bots,runs,purchases]=await Promise.all([','const [bots,runs,legacyPurchases,erpOrders]=await Promise.all([');
 once("optional('lead_products','id,lead_id,kind,sold_at',q=>q.eq('kind','comprou')),","optional('lead_products','id,lead_id,kind,sold_at',q=>q.eq('kind','comprou')),\n  optional('slim_orders','id,customer_id,status,confirmed_at,legacy_lead_id'),");
 once('const result=aggregateBotMetrics({bots,runs,purchases,days,now});',`let purchases=null;
 try{purchases=metricPurchasesIncludingErp(legacyPurchases,erpOrders);}catch{issues.push({source:'slim_orders',code:'INVALID_SOURCE',message:'Pedidos inconsistentes. Conversão não calculada.'});}
 const result=aggregateBotMetrics({bots,runs,purchases,days,now});
 result.conversionRule+=' Inclui pedidos ERP confirmados. Cancelados são excluídos; vendas regularizadas não repetem o vínculo antigo.';`);
});
for(const[path,code]of plans)fs.writeFileSync(new URL(path,root),code);
console.log(`[Slim legacy] ${plans.length} real source files updated. No database writes or outbound transport executed by this script.`);
