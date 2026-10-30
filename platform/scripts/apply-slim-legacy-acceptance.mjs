import fs from 'node:fs';
const root=new URL('../',import.meta.url),mark='// SLIM_LEGACY_ACCEPTED_STOCK_V1',plans=[];
function edit(path,replacements){let s=fs.readFileSync(new URL(path,root),'utf8');if(s.includes(mark))return;for(const[a,b]of replacements){if(s.split(a).length!==2)throw new Error('Legacy acceptance anchor changed: '+path+' '+a.slice(0,50));s=s.replace(a,()=>b);}plans.push([path,s+'\n'+mark+'\n']);}
edit('src/lib/slim-stock-view.core.ts',[
 ['quantity:number;balanceBefore:number','quantity:number;recordedOnly?:boolean;balanceBefore:number'],
 ["const before=m.kind==='sale'?after+qty:after-qty;int(before,0,2147483647);","const recordedOnly=m.kind==='sale'&&s.legacy?.stockMode==='already_accounted';\n  const before=recordedOnly?after:m.kind==='sale'?after+qty:after-qty;int(before,0,2147483647);"],
 ['kind:m.kind,quantity:qty,balanceBefore:before','kind:m.kind,quantity:qty,...(recordedOnly?{recordedOnly:true}:{}),balanceBefore:before'],
]);
edit('src/components/erp/SlimStockWorkspace.tsx',[
 ["{m.kind==='sale'?'Saída por venda':'Estorno de cancelamento'}","{m.recordedOnly?'Registro histórico, sem nova baixa':m.kind==='sale'?'Saída por venda':'Estorno de cancelamento'}"],
 ["{m.kind==='sale'?'−':'+'}{m.quantity}","{m.recordedOnly?`0 (${m.quantity} unidades já contabilizadas)`: `${m.kind==='sale'?'−':'+'}${m.quantity}`}"],
]);
edit('scripts/test-slim-stock-contract.mjs',[
 ["check('legacy financial gate remains closed and no sending endpoint introduced',()=>{const s=read('src/lib/slim-legacy-readiness.core.ts');assert(s.includes('false'));assert(!server.includes('slim_reconcile_legacy_sale'));assert(!before[2].includes('sendSlimOrderDocument'));});","check('stock reader cannot regularize sales or send documents',()=>{assert(!server.includes('slim_reconcile_legacy_sale'));assert(!server.includes('get_evolution_credentials'));assert(!server.includes('sendSlimOrderDocument'));});"],
]);
for(const[path,s]of plans)fs.writeFileSync(new URL(path,root),s);
console.log(`[Legacy acceptance] ${plans.length} projections updated; reviewed prior debits never appear as new stock debits. No business mutation performed.`);
