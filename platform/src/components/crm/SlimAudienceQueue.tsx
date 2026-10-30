import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {useState} from 'react';
import {toast} from 'sonner';
import {listSlimAudienceCampaigns,cancelSlimAudienceCampaign} from '@/lib/slim-audience-queue.functions';
import {audienceDeliveryIssueText} from '@/lib/slim-audience-delivery.core';
import type {AudienceReportScope} from '@/lib/slim-audience-report.core';
const labels:Record<string,string>={queued:'Na fila',running:'Em execução',completed:'Processamento encerrado',cancelled:'Cancelado'};
export function SlimAudienceQueue({scope,onReport}:{scope?:AudienceReportScope|null;onReport?:(campaignId:string)=>void}={}){
 const list=useServerFn(listSlimAudienceCampaigns);const cancel=useServerFn(cancelSlimAudienceCampaign);const [busy,setBusy]=useState<string|null>(null);
 const q=useQuery({queryKey:['slim-audience-campaigns',scope?.workspaceId,scope?.actorId],queryFn:()=>list(),enabled:scope!==null,refetchInterval:4000,retry:1});
 async function stop(id:string){if(!window.confirm('Encerrar os destinatários ainda pendentes? Um envio já iniciado pode terminar.'))return;setBusy(id);try{await cancel({data:{id}});await q.refetch();toast.success('Pendências canceladas.');}catch(e){toast.error(e instanceof Error?e.message:'Falha ao cancelar.');}finally{setBusy(null);}}
 return <section className="rounded-xl border border-border bg-card p-4 space-y-3">
  <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-sm">Progresso dos disparos e reativações</h2><button type="button" className="text-xs underline" onClick={()=>q.refetch()}>Atualizar</button></div>
  <p className="text-xs text-muted-foreground">Enfileirado não significa enviado. Resultados incertos não são reenviados automaticamente. O encerramento não desfaz mensagens já enviadas nem interrompe um SalesBot já iniciado no Inbox.</p>
  {q.error?<p role="alert" className="text-sm text-destructive">{q.error instanceof Error?q.error.message:'Falha ao consultar o progresso.'}</p>:q.isLoading?<p className="text-xs">Carregando...</p>:!(q.data as any)?.campaigns?.length?<p className="text-xs text-muted-foreground">Nenhum disparo registrado.</p>:
   (q.data as any).campaigns.map((c:any)=><div key={c.id} className="rounded-lg border border-border p-3 space-y-2">
    <div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{c.audience_name}</strong><span className="text-xs">{labels[c.status]??c.status}</span></div>
    <p className="text-xs">{c.kind==='salesbot'?'SalesBots acionados':'Aceitos pelo WhatsApp'}: {c.states.sent??0} · Pendentes: {c.states.pending??0} · Em execução: {c.states.running??0} · Falhas: {c.states.failed??0} · Incertos: {c.states.uncertain??0} · Ignorados/cancelados: {(c.states.skipped??0)+(c.states.cancelled??0)}</p>
    {!!c.issues?.length&&<p className="text-xs text-amber-700">Atenção: {c.issues.map(audienceDeliveryIssueText).join(' ')}</p>}
    {['queued','running'].includes(c.status)&&<button type="button" disabled={busy===c.id} onClick={()=>stop(c.id)} className="rounded-md border border-border px-3 py-1 text-xs">{busy===c.id?'Encerrando...':'Encerrar pendentes'}</button>}
    {onReport&&<button type="button" onClick={()=>onReport(c.id)} className="ml-2 text-xs underline">Relatório detalhado</button>}
   </div>)}
 </section>;
}
