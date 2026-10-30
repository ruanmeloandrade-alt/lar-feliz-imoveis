// SLIM_ERP_RELEASE_V1
// Single operational history. Historical CRM records remain in the database, not mounted as a second screen.
import {createFileRoute} from '@tanstack/react-router';
import {AppSidebar} from '@/components/dashboard/AppSidebar';
import {SlimErpWorkspace} from '@/components/erp/SlimErpWorkspace';
export const Route=createFileRoute('/saude-slim')({ssr:false,head:()=>({meta:[{title:'Histórico de Vendas · Vanessa Simoni'},{name:'description',content:'Pedidos e documentos da Vanessa Simoni.'}]}),component:SalesHistoryPage});
function SalesHistoryPage(){return <div className="flex min-h-[100dvh] bg-background text-foreground md:h-screen md:overflow-hidden"><AppSidebar/><main className="min-w-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8"><SlimErpWorkspace mode="history"/></div></main></div>;}
