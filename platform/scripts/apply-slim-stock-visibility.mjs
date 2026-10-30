import fs from 'node:fs';
const root=new URL('../',import.meta.url),mark='// SLIM_STOCK_VISIBILITY_V1',plans=[];
function edit(path,run){let s=fs.readFileSync(new URL(path,root),'utf8');if(s.split(/\r?\n/).includes(mark))return;const once=(a,b)=>{if(s.split(a).length!==2)throw new Error(`Stock contract anchor changed: ${path}: ${a.slice(0,80)}`);s=s.replace(a,()=>b);};run(once);plans.push([path,s+'\n'+mark+'\n']);}
edit('src/routes/crm.estoque.tsx',once=>{
 once('import { createFileRoute, Link }','import {SlimStockWorkspace} from "@/components/erp/SlimStockWorkspace";\nimport { createFileRoute, Link }');
 once('  component: EstoquePage,','  component: EstoqueErpPage,');
 once('type StockProduct =',`function EstoqueErpPage(){return <div className="flex min-h-[100dvh] w-full bg-muted/20 text-foreground md:h-screen md:overflow-hidden"><AppSidebar/><main className="min-w-0 flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-screen-2xl space-y-5 p-4 md:p-6"><SlimStockWorkspace/></div></main></div>;}\n\ntype StockProduct =`);
});
edit('src/components/erp/SlimCheckout.tsx',once=>{
 once("import {useEffect,useRef,useState} from 'react';","import {useEffect,useRef,useState} from 'react';\nimport {currentCheckoutPreview} from '@/lib/slim-erp-ui-integrity.core';");
 once('preview=state?.quote??quote();','preview=currentCheckoutPreview(state,quote);');
});
edit('src/components/erp/SlimErpWorkspace.tsx',once=>{
 once("import {useEffect,useMemo,useRef,useState} from 'react';","import {useEffect,useMemo,useRef,useState} from 'react';\nimport {verifyReceiptDownload} from '@/lib/slim-erp-ui-integrity.core';");
 once('useState<Awaited<ReturnType<typeof loadReceipt>>|null>(null)','useState<(Awaited<ReturnType<typeof loadReceipt>>&{verifiedBytes:Uint8Array})|null>(null)');
 once('const result=await loadReceipt({data:{workspaceId,orderId}});if(live.current)setPdf(result);','const result=await loadReceipt({data:{workspaceId,orderId}});const verifiedBytes=await verifyReceiptDownload(result,{workspaceId,orderId});if(live.current)setPdf({...result,verifiedBytes});');
 once('const bytes=Uint8Array.from(atob(pdf.pdfBase64),c=>c.charCodeAt(0));','const bytes=pdf.verifiedBytes;');
});
for(const [p,s] of plans)fs.writeFileSync(new URL(p,root),s);
console.log(`[Slim stock] ${plans.length} source files updated. Read-only stock visibility, no financial mutation or document transport.`);
