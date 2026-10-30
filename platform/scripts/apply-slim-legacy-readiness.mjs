import fs from 'node:fs';
const root=new URL('../',import.meta.url),mark='// SLIM_LEGACY_READINESS_HOLD',plans=[];
function edit(path,run){let code=fs.readFileSync(new URL(path,root),'utf8');if(code.includes(mark))return;const once=(from,to)=>{if(code.split(from).length!==2)throw new Error(`[Legacy readiness] ${path}: missing exact anchor`);code=code.replace(from,()=>to);};run(once);plans.push([path,code+'\n'+mark+'\n']);}
edit('src/lib/slim-legacy-review.functions.ts',once=>{
 once("import {assessLegacyReview} from '@/lib/slim-legacy-review.core';","import {assessLegacyReview} from '@/lib/slim-legacy-review.core';\nimport {legacyReconciliationReadiness,assertLegacyReconciliationReady} from '@/lib/slim-legacy-readiness.core';");
 once('return {workspaceId:ws,rows:r.data};','return {workspaceId:ws,rows:r.data,reconciliation:legacyReconciliationReadiness()};');
 once("const r=await sb.rpc('slim_reconcile_legacy_sale'","assertLegacyReconciliationReady();\n const r=await sb.rpc('slim_reconcile_legacy_sale'");
});
edit('src/components/erp/SlimLegacyOrdersReview.tsx',once=>{
 once('if(!selected||inflight.current||uncertain)return;','if(!selected||inflight.current||uncertain||!q.data?.reconciliation.canReconcile)return;');
 once('{notice&&<p role="status"','{q.data?.reconciliation&&!q.data.reconciliation.canReconcile&&<p role="status" className="rounded-md border border-amber-500/40 p-3 text-sm">{q.data.reconciliation.message}</p>}\n  {notice&&<p role="status"');
 once('disabled={busy||!approved||!method||!paymentStatus||!stockMode||!target.canReview}','disabled={busy||!approved||!method||!paymentStatus||!stockMode||!target.canReview||!q.data?.reconciliation.canReconcile}');
 once('{error&&<p role="alert"','{q.data?.reconciliation&&!q.data.reconciliation.canReconcile&&<p className="text-sm">{q.data.reconciliation.message}</p>}\n    {error&&<p role="alert"');
});
for(const[path,code]of plans)fs.writeFileSync(new URL(path,root),code);
console.log(`[Legacy readiness] ${plans.length} source files protected. New historical adjustments remain read-only until final transaction validation; normal orders unchanged.`);
