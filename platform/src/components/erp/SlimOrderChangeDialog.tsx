import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useBlocker} from '@tanstack/react-router';
import {useServerFn} from '@tanstack/react-start';
import {useQuery} from '@tanstack/react-query';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {getSlimOrderChangeContext,confirmSlimOrderChange,lookupSlimOrderChange} from '@/lib/slim-order-changes.functions';
import {finishOrderChangeRecovery,orderChangeDeadline,orderChangeReason,validateOrderChangeResult,type OrderChangeContext,type OrderChangeIdentity,type OrderChangeOperation,type OrderChangeResult} from '@/lib/slim-order-changes.core';
import {orderChangeJournal,type OrderChangeAttemptRef} from '@/lib/slim-order-changes-journal.core';
import {CheckoutRejected,type CheckoutTransport} from '@/lib/slim-checkout-session.core';
import {formatCheckoutCents,type CheckoutDraft,type CheckoutQuote} from '@/lib/slim-checkout.core';
import {erpReadableError} from '@/lib/slim-erp-release.core';
import {SlimCheckout} from './SlimCheckout';

export type SlimOrderChangeTarget={orderId:string;operation:OrderChangeOperation};
type Props={workspaceId:string;actorId:string;target:SlimOrderChangeTarget|null;onClose:()=>void;onCompleted:(result:OrderChangeResult)=>void|Promise<void>;onDocument:(orderId:string)=>void|Promise<void>;onLockChange:(blocked:boolean)=>void};
const button='rounded-md border px-4 py-2 text-sm disabled:opacity-50';

/** Mounting reads only the local reference. The ledger is queried only by an explicit recovery button. */
export function SlimOrderChangeDialog({workspaceId,actorId,target,onClose,onCompleted,onDocument,onLockChange}:Props){
 const [ready,setReady]=useState(false),[pending,setPending]=useState<OrderChangeAttemptRef|null>(null),[journalError,setJournalError]=useState('');
 const [restored,setRestored]=useState<OrderChangeAttemptRef|null>(null);
 const readPending=useCallback(()=>{
  try{setPending(orderChangeJournal(window.localStorage,workspaceId,actorId).read());setJournalError('');}
  catch(e){setJournalError(erpReadableError(e));}
  finally{setReady(true);}
 },[workspaceId,actorId]);
 useEffect(()=>{readPending();},[readPending]);
 useEffect(()=>{onLockChange(!ready||Boolean(pending)||Boolean(journalError));},[ready,pending,journalError,onLockChange]);
 const active=restored??target;
 const anotherPending=Boolean(active&&pending&&(active.orderId!==pending.orderId||active.operation!==pending.operation));
 function close(){setRestored(null);onClose();}
 return <>
  {journalError&&<section role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-3 text-sm"><p>{journalError}</p><button type="button" className={button} onClick={readPending}>Conferir referência local</button></section>}
  {pending&&<section className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm"><p>Há uma {pending.operation==='edit'?'edição':'exclusão'} de pedido a conferir. A referência foi preservada.</p><p className="break-all text-xs">Referência: {pending.requestId}</p><button type="button" className={button} onClick={()=>setRestored(structuredClone(pending))}>Conferir alteração pendente</button></section>}
  {anotherPending&&<p role="alert" className="text-sm text-destructive">Consulte a alteração pendente antes de iniciar outra.</p>}
  {ready&&active&&!anotherPending&&<SlimOrderChangeEditor key={`${workspaceId}:${actorId}:${active.orderId}:${active.operation}`} workspaceId={workspaceId} actorId={actorId} target={active} startingReference={pending} journalError={journalError} onJournalChanged={readPending} onClose={close} onCompleted={onCompleted} onDocument={onDocument}/>}
 </>;
}

type EditorProps=Omit<Props,'target'|'onLockChange'>&{target:SlimOrderChangeTarget;startingReference:OrderChangeAttemptRef|null;journalError:string;onJournalChanged:()=>void};
export function SlimOrderChangeEditor({workspaceId,actorId,target,startingReference,journalError,onJournalChanged,onClose,onCompleted,onDocument}:EditorProps){
 const loadContext=useServerFn(getSlimOrderChangeContext),confirm=useServerFn(confirmSlimOrderChange),lookup=useServerFn(lookupSlimOrderChange);
 const [initialReference]=useState(()=>startingReference?structuredClone(startingReference):null);
 const [attempt,setAttempt]=useState<OrderChangeIdentity|null>(initialReference),[uncertain,setUncertain]=useState(Boolean(initialReference));
 const [result,setResult]=useState<OrderChangeResult|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [reason,setReason]=useState(''),[deleteReview,setDeleteReview]=useState<{reason:string;requestId:string}|null>(null);
 const flight=useRef(false),live=useRef(true),notified=useRef('');
 const interaction=useRef({dirty:false,pending:false,uncertain:false});
 const onInteractionStateChange=useCallback((state:{dirty:boolean;pending:boolean;uncertain:boolean})=>{interaction.current=state;},[]);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const contextQ=useQuery({queryKey:['slim-order-change-context',workspaceId,actorId,target.orderId,target.operation],queryFn:()=>loadContext({data:{workspaceId,orderId:target.orderId,operation:target.operation}}),enabled:!initialReference,retry:1,staleTime:Infinity,refetchOnWindowFocus:false});
 const candidate=contextQ.data as OrderChangeContext|undefined;
 const context=candidate?.workspaceId===workspaceId&&candidate.actorId===actorId&&candidate.order.workspaceId===workspaceId&&candidate.order.orderId===target.orderId?candidate:undefined;
 const contextError=contextQ.error?erpReadableError(contextQ.error):candidate&&!context?'A empresa, o operador ou o pedido mudou. Feche esta revisão e abra novamente.':'';
 const journal=()=>orderChangeJournal(window.localStorage,workspaceId,actorId);
 const identity=(requestId:string):OrderChangeIdentity=>({workspaceId,actorId,orderId:target.orderId,requestId,operation:target.operation});
 function canLeave(){
  if(flight.current||(!uncertain&&!result&&interaction.current.pending)){setError('Aguarde a resposta da alteração antes de sair.');return false;}
  if(result||attempt)return true;
  return !(interaction.current.dirty||reason.trim())||window.confirm('Descartar os ajustes desta revisão e fechar? O pedido ainda não foi alterado.');
 }
 useBlocker({enableBeforeUnload:()=>flight.current||(!result&&!attempt&&(interaction.current.dirty||Boolean(reason.trim()))),shouldBlockFn:()=>!canLeave()});
 function close(){if(canLeave())onClose();}
 async function completed(value:OrderChangeResult){
  if(!live.current)return;
  setResult(value);setUncertain(false);setError('');
  if(notified.current===value.requestId)return;notified.current=value.requestId;
  try{await onCompleted(value);}catch{if(live.current)setNotice('O resultado foi confirmado, mas a atualização da lista falhou. Atualize o histórico sem repetir a alteração.');}
 }
 async function commit(expected:OrderChangeIdentity,fingerprint:string,quote:CheckoutQuote|null,approvedReason:string){
  if(flight.current)throw new CheckoutRejected('Aguarde a alteração em andamento.');
  flight.current=true;setBusy(true);setError('');setNotice('');
  try{
   try{journal().begin(expected);}catch(e){onJournalChanged();throw new CheckoutRejected(erpReadableError(e));}
   setAttempt(expected);onJournalChanged();
   let value:OrderChangeResult;
   try{value=validateOrderChangeResult(await orderChangeDeadline(()=>confirm({data:{...expected,fingerprint,quote,reason:approvedReason,approved:true}})),expected,quote?.totalCents);}
   catch(e){if(live.current){setUncertain(true);setError(erpReadableError(e));}throw e;}
   try{journal().clear(expected);}catch{if(live.current)setNotice('Alteração confirmada. A referência local continua pendente; consulte-a antes de iniciar outra alteração.');}
   if(live.current)onJournalChanged();
   await completed(value);return value;
  }finally{flight.current=false;if(live.current)setBusy(false);}
 }
 async function recover(expected:OrderChangeIdentity){
  if(flight.current)throw new Error('Aguarde a consulta em andamento.');
  flight.current=true;setBusy(true);setError('');setNotice('');
  try{
   const value=await finishOrderChangeRecovery({approved:true,expected,journal:journal(),send:()=>lookup({data:{...expected,approved:true}})});
   if(live.current)onJournalChanged();await completed(value);return value;
  }catch(e){if(live.current){setUncertain(true);setError(erpReadableError(e));}throw e;}
  finally{flight.current=false;if(live.current)setBusy(false);}
 }
 function createEditTransport(value:string):CheckoutTransport{
  if(!context||target.operation!=='edit'||context.order.status!=='confirmed'||context.order.change)throw new Error('Reabra um pedido confirmado e vigente para revisar.');
  const reviewedReason=orderChangeReason(value),fingerprint=context.fingerprint;
  return {
   confirm:async(requestId,quote)=>{const value=await commit(identity(requestId),fingerprint,quote,reviewedReason);if(!value.receipt)throw new CheckoutRejected(value.state==='closed'?'Tentativa encerrada sem alteração.':'Alteração concluída; o pedido substituto já está cancelado.');return value.receipt;},
   lookup:async(requestId)=>{const value=await recover(identity(requestId));return value.receipt?{state:'confirmed' as const,receipt:value.receipt}:{state:'rejected' as const,message:value.state==='closed'?'Tentativa encerrada sem alteração.':'Alteração concluída; consulte o histórico do pedido substituto.'};},
  };
 }
 const initialDraft=useMemo<CheckoutDraft|null>(()=>{
  if(!context)return null;const order=context.order;
  return {customer:{kind:'existing',id:order.customer.id},items:order.items.map(item=>({productId:item.productId,quantity:item.quantity})),discount:{kind:'amount',cents:order.discountCents},payment:{...order.payment,method:order.payment.method as CheckoutDraft['payment']['method']},notes:order.notes,...(order.fulfillment?{fulfillment:structuredClone(order.fulfillment)}:{}),...(order.shippingCents!==undefined?{shippingCents:order.shippingCents}:{})};
 },[context]);
 function reviewDelete(){try{if(!context)throw new Error('Carregue o pedido antes de revisar a exclusão.');setDeleteReview({reason:orderChangeReason(reason),requestId:crypto.randomUUID()});setError('');}catch(e){setError(erpReadableError(e));}}
 async function deleteOrder(){if(!deleteReview||!context||flight.current)return;try{await commit(identity(deleteReview.requestId),context.fingerprint,null,deleteReview.reason);}catch(e){if(live.current)setError(erpReadableError(e));}}
 const operation=target.operation==='edit'?'edição':'exclusão';
 return <Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent className={target.operation==='edit'&&!uncertain&&!result?'max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-6xl overflow-y-auto':'max-h-[90dvh] overflow-y-auto'}><DialogHeader><DialogTitle>{target.operation==='edit'?'Alterar pedido':'Excluir pedido da lista'}</DialogTitle><DialogDescription>{target.operation==='edit'?'Revise os dados e confirme a substituição do pedido.':'Confira o efeito e informe o motivo antes de excluir da lista operacional.'}</DialogDescription></DialogHeader>
  {notice&&<p role="status" className="rounded-lg border p-3 text-sm">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {busy&&<p role="status" className="text-sm">{uncertain?'Consultando a referência...':'Aguardando o registro da alteração...'}</p>}
  {result?<section role="status" className="space-y-3 rounded-lg border border-emerald-500/40 p-4">
   <h3 className="font-semibold">{result.state==='closed'?'Tentativa encerrada sem alteração':result.operation==='delete'?'Pedido excluído da lista operacional':'Alteração do pedido concluída'}</h3>
   <p className="text-sm">{result.state==='closed'?'Esta referência foi encerrada. Uma confirmação atrasada com a mesma referência não será aceita. Você pode abrir uma nova revisão.':result.operation==='delete'?'O pedido e seu documento original continuam na aba Alterações. O estoque foi tratado conforme a situação do pedido, sem apagar o histórico.':result.replacementStatus==='cancelled'?'A revisão foi concluída anteriormente e o pedido substituto está cancelado. Consulte o histórico; esta alteração não será repetida.':'O pedido substituto está confirmado. O original, o motivo e o documento foram preservados na aba Alterações.'}</p>
   {result.receipt&&<p className="text-sm font-medium">Pedido {result.receipt.number} · {formatCheckoutCents(result.receipt.totalCents)}</p>}
   <p className="break-all text-xs">Referência: {result.requestId}</p>{result.replacementOrderId&&<p className="break-all text-xs">Pedido substituto: {result.replacementOrderId}</p>}
   <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={()=>{onClose();void onDocument(result.orderId);}}>Documento original</button>{result.replacementOrderId&&<button type="button" className={button} onClick={()=>{onClose();void onDocument(result.replacementOrderId!);}}>Documento do substituto</button>}<button type="button" className={button} onClick={onClose}>Fechar</button></div>
  </section>:uncertain&&attempt?<section className="space-y-3 rounded-lg border border-amber-500/40 p-4"><h3 className="font-semibold">Conferir {operation} pendente</h3><p className="text-sm">Consulte esta referência para recuperar uma alteração já concluída. Se ela ainda não foi registrada, a tentativa será encerrada para impedir que uma confirmação atrasada a execute. Esta consulta não repete a alteração.</p><p className="break-all text-xs">Pedido: {attempt.orderId}</p><p className="break-all text-xs">Referência: {attempt.requestId}</p><button type="button" className={button} disabled={busy||Boolean(journalError)} onClick={()=>void recover(attempt).catch(()=>{})}>Consultar resultado sem repetir</button><button type="button" className={`${button} ml-2`} disabled={busy} onClick={close}>Fechar e manter referência</button></section>:
   contextError?<section className="space-y-3"><p role="alert" className="text-sm text-destructive">{contextError}</p>{!candidate&&<button type="button" className={button} onClick={()=>void contextQ.refetch()}>Tentar carregar novamente</button>}</section>:!context||!initialDraft?<p role="status">Carregando o pedido para revisão...</p>:
   target.operation==='edit'?<SlimCheckout workspaceId={workspaceId} catalog={context.catalog} customers={context.customers} initialDraft={initialDraft} transport={null} loadError={journalError||undefined} revision={{orderNumber:context.order.number,originalTotalCents:context.order.totalCents,createTransport:createEditTransport}} onInteractionStateChange={onInteractionStateChange} onConfirmed={()=>{}}/>:
   <section className="space-y-4"><div className="rounded-lg border p-4 text-sm space-y-2"><h3 className="font-semibold">Pedido {context.order.number} · {context.order.customer.name}</h3><p>Total registrado: {formatCheckoutCents(context.order.totalCents)}</p><p>{context.order.status==='confirmed'?'Ao confirmar, o pedido será cancelado, suas quantidades voltarão ao estoque uma única vez e ele sairá da lista operacional.':'Este pedido já está cancelado. Ao confirmar, ele sairá da lista operacional sem um novo estorno de estoque.'}</p><p>O pedido, o motivo e o PDF original continuarão disponíveis na aba Alterações. Esta ação não executa reembolso bancário.</p></div>
    <label className="block text-sm font-medium">Motivo da exclusão<input aria-label="Motivo da exclusão" className="mt-2 w-full rounded-md border border-input bg-background p-2 font-normal" value={reason} onChange={e=>setReason(e.target.value)} disabled={Boolean(deleteReview)||busy||Boolean(journalError)} maxLength={500} required/></label>
    {deleteReview?<><p className="break-words text-sm">Motivo revisado: {deleteReview.reason}</p><div className="flex flex-wrap gap-2"><button type="button" className={`${button} border-destructive/40 text-destructive`} disabled={busy||Boolean(journalError)} onClick={()=>void deleteOrder()}>Confirmar exclusão</button><button type="button" className={button} disabled={busy} onClick={()=>setDeleteReview(null)}>Voltar e corrigir</button></div></>:<button type="button" className={button} disabled={busy||Boolean(journalError)} onClick={reviewDelete}>Revisar exclusão</button>}
   </section>}
 </DialogContent></Dialog>;
}
