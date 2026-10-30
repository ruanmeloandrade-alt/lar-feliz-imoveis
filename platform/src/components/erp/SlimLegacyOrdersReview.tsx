import {useMemo,useRef,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {reviewSlimLegacySales,reconcileSlimLegacySale} from '@/lib/slim-legacy-review.functions';
import {assessLegacyReview,validateLegacyApproval,LEGACY_METHODS,type LegacyReview} from '@/lib/slim-legacy-review.core';
import {formatOrderCents} from '@/lib/slim-order-read.core';
export function SlimLegacyOrdersReview({workspaceId,actorId}:{workspaceId:string;actorId:string}){
 const read=useServerFn(reviewSlimLegacySales),save=useServerFn(reconcileSlimLegacySale),qc=useQueryClient();
 const q=useQuery({queryKey:['slim-legacy-review',workspaceId,actorId],queryFn:()=>read({data:{workspaceId}}),retry:1,staleTime:0});
 const [selected,setSelected]=useState<LegacyReview|null>(null),[method,setMethod]=useState(''),[paymentStatus,setPaymentStatus]=useState(''),[stockMode,setStockMode]=useState(''),[installments,setInstallments]=useState(1),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const inflight=useRef(false);
 const rows=useMemo(()=>((q.data?.rows??[]) as LegacyReview[]).map(row=>assessLegacyReview(row,workspaceId)),[q.data,workspaceId]);
 const target=selected?assessLegacyReview(selected,workspaceId):null;
 function open(row:LegacyReview){setSelected(row);setMethod('');setPaymentStatus('');setStockMode('');setInstallments(1);setApproved(false);setError('');setUncertain(false);}
 async function refreshAll(){await qc.invalidateQueries({predicate:x=>['slim-erp-orders','slim-erp-context','slim-legacy-review','slim-automation-metrics'].includes(String(x.queryKey[0]))});}
 async function confirm(){
  if(!selected||inflight.current||uncertain||!q.data?.reconciliation.canReconcile)return;
  try{validateLegacyApproval(method,paymentStatus,installments,stockMode,approved);}catch(e){setError(e instanceof Error?e.message:'Revisão incompleta.');return;}
  inflight.current=true;setBusy(true);setError('');
  try{
   const r=await save({data:{workspaceId,leadId:selected.source.leadId,fingerprint:selected.fingerprint,stockMode:stockMode as 'apply_missing'|'already_accounted',approved:true,payment:{method:method as (typeof LEGACY_METHODS)[number][0],status:paymentStatus as 'paid'|'pending',installments}}});
   if(r.state==='rejected'){setError(r.message);return;}
   setNotice(r.reused?`A origem já estava vinculada ao pedido ${r.number}. Nenhuma segunda venda foi criada.`:`Pedido ${r.number} regularizado com os dados revisados. Consulte o histórico e os indicadores ERP.`);setSelected(null);await refreshAll();
  }catch{setUncertain(true);setError('A resposta não chegou. Consulte o resultado antes de repetir. A origem só pode gerar um pedido.');}
  finally{setBusy(false);inflight.current=false;}
 }
 async function recover(){if(!selected||inflight.current)return;inflight.current=true;setBusy(true);try{
  const data=await read({data:{workspaceId}});const row=(data.rows as LegacyReview[]).find(r=>r.source.leadId===selected.source.leadId);
  if(row?.orderId){setNotice(`Regularização localizada no pedido ${row.number}. Nenhuma nova venda foi enviada.`);setSelected(null);await refreshAll();}
  else setError('Ainda não foi localizado um pedido para esta origem. A aprovação não foi reenviada. Consulte novamente.');
 }catch{setError('Consulta indisponível. Nenhuma aprovação reenviada.');}finally{setBusy(false);inflight.current=false;}}
 const field='w-full rounded-md border border-input bg-background p-2 text-sm';
 return <section className="rounded-xl border border-amber-500/30 bg-card p-5 space-y-4">
  <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Vendas anteriores: conferência e regularização</h2><p className="mt-1 text-xs text-muted-foreground">Registros do checkout antigo. Revise pagamento e baixa de estoque antes de incorporá-los ao ERP. Não refaça essas vendas como pedidos novos.</p></div><button type="button" className="text-sm underline" onClick={()=>q.refetch()}>Atualizar conferência</button></header>
  {q.data?.reconciliation&&!q.data.reconciliation.canReconcile&&<p role="status" className="rounded-md border border-amber-500/40 p-3 text-sm">{q.data.reconciliation.message}</p>}
  {notice&&<p role="status" className="rounded-md border p-3 text-sm">{notice}</p>}
  {q.error?<p role="alert" className="text-sm text-destructive">{q.error instanceof Error?q.error.message:'Falha na conferência.'}</p>:q.isLoading?<p role="status" className="text-sm">Conferindo registros anteriores...</p>:!rows.length?<p className="text-sm text-muted-foreground">Nenhum registro do checkout antigo encontrado.</p>:<>
   <p className="text-xs text-muted-foreground">{rows.filter(r=>!r.alreadyReconciled).length} aguardando revisão · {rows.filter(r=>r.alreadyReconciled).length} já vinculados ao ERP. Estes valores não são recebimentos confirmados.</p>
   <div className="space-y-3">{rows.map(r=><article key={r.row.source.leadId} className="rounded-lg border p-4 space-y-2">
    <div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{r.row.source.name}</strong><span className="font-semibold text-sm">{r.valueCents===null?'Valor inválido':formatOrderCents(r.valueCents)}</span></div>
    <p className="text-xs text-muted-foreground">Origem: {r.row.source.leadId} · {new Date(r.row.source.createdAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p>
    {r.row.source.items.map(item=><p key={item.linkId} className="text-xs">{item.productName||'Produto não disponível'} · Quantidade registrada: {String(item.quantity)} · Preço líquido registrado: {String(item.unitPrice??'não informado')} · Estoque atual: {String(item.stock??'indisponível')}</p>)}
    {r.alreadyReconciled?<p className="text-sm">Vinculado ao pedido <strong>{r.row.number}</strong> ({r.row.orderStatus==='cancelled'?'cancelado':'confirmado'}). Não será importado outra vez.</p>:r.problems.length?<div role="status" className="text-xs text-destructive">{r.problems.map(msg=><p key={msg}>{msg}</p>)}</div>:<button type="button" onClick={()=>open(r.row)} className="rounded-md border px-3 py-2 text-sm">Revisar e regularizar</button>}
   </article>)}</div>
  </>}
  <Dialog open={Boolean(selected)} onOpenChange={open=>{if(!open&&!busy)setSelected(null);}}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Regularizar venda anterior</DialogTitle><DialogDescription>A ação preserva a origem e cria um único registro de pedido. Confira os dados que o checkout antigo não registrava.</DialogDescription></DialogHeader>
   {selected&&target&&<div className="space-y-4"><p className="text-sm"><strong>{selected.source.name}</strong> · {target.valueCents===null?'Valor inválido':formatOrderCents(target.valueCents)}</p>
    <fieldset disabled={busy||uncertain} className="space-y-3">
     <label className="block text-sm">Forma de pagamento<select className={field} value={method} onChange={e=>{setMethod(e.target.value);setInstallments(1);setApproved(false);}}><option value="">Selecione após conferir</option>{LEGACY_METHODS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
     <label className="block text-sm">Situação do pagamento<select className={field} value={paymentStatus} onChange={e=>{setPaymentStatus(e.target.value);setApproved(false);}}><option value="">Selecione após conferir</option><option value="pending">Ainda pendente</option><option value="paid">Recebimento confirmado por mim</option></select></label>
     {method==='credit_card'&&<label className="block text-sm">Parcelas<input className={field} type="number" min={1} max={24} value={installments} onChange={e=>{setInstallments(Number(e.target.value));setApproved(false);}}/></label>}
     <label className="block text-sm">Estoque<select className={field} value={stockMode} onChange={e=>{setStockMode(e.target.value);setApproved(false);}}><option value="">Selecione após conferir o saldo</option><option value="apply_missing" disabled={!target.canApplyStock}>A baixa ainda não foi feita: reduzir o saldo agora</option><option value="already_accounted">O saldo atual já considera esta venda: não baixar novamente</option></select></label>
     {!target.canApplyStock&&<p className="text-xs text-destructive">O saldo atual não permite aplicar uma baixa pendente. Corrija a divergência antes de prosseguir.</p>}
     <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/><span>Conferi esta venda, o pagamento e a situação da baixa. Autorizo a regularização única.</span></label>
    </fieldset>
    <p className="text-xs text-muted-foreground">O preço usado é o do vínculo original, não o preço atual do catálogo. Não ocorre cobrança, reembolso bancário ou envio de WhatsApp.</p>
    {q.data?.reconciliation&&!q.data.reconciliation.canReconcile&&<p className="text-sm">{q.data.reconciliation.message}</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {uncertain?<button type="button" disabled={busy} onClick={()=>void recover()} className="w-full rounded-md border p-3 text-sm">Consultar resultado sem reenviar</button>:<button type="button" disabled={busy||!approved||!method||!paymentStatus||!stockMode||!target.canReview||!q.data?.reconciliation.canReconcile} onClick={()=>void confirm()} className="w-full rounded-md bg-primary p-3 font-semibold text-sm text-primary-foreground disabled:opacity-50">{busy?'Confirmando...':'Confirmar regularização'}</button>}
   </div>}
  </DialogContent></Dialog>
 </section>;
}

// SLIM_LEGACY_READINESS_HOLD
