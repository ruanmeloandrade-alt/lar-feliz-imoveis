import {createFileRoute} from '@tanstack/react-router';
import {AppSidebar} from '@/components/dashboard/AppSidebar';
import {SlimErpWorkspace} from '@/components/erp/SlimErpWorkspace';
export const Route=createFileRoute('/pedidos')({
 ssr:false,
 head:()=>({meta:[{title:'Checkout de Negociações · Vanessa Simoni'}]}),
 component:()=> <div className="flex min-h-[100dvh] bg-background text-foreground md:h-screen md:overflow-hidden"><AppSidebar/><main className="min-w-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-[1500px] p-4 md:p-6"><SlimErpWorkspace mode="checkout"/></div></main></div>,
});
