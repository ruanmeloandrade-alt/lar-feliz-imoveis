import { verifyCheckoutReceipt, type CheckoutQuote, type ConfirmedCheckout } from './slim-checkout.core.ts';
export class CheckoutRejected extends Error {}
export type CheckoutState = 'review'|'submitting'|'uncertain'|'confirmed'|'rejected';
export type CheckoutResolution = {state:'confirmed'; receipt:unknown}|{state:'pending'|'not_found'}|{state:'rejected'; message:string};
export type CheckoutTransport = {
  confirm: (requestId:string,quote:CheckoutQuote)=>Promise<unknown>;
  lookup: (requestId:string,workspaceId:string)=>Promise<CheckoutResolution>;
};
/** Only a complete persisted receipt means success. Never auto-repeat a write after a timeout. */
export function createCheckoutSession(quote:CheckoutQuote, transport:CheckoutTransport, id=crypto.randomUUID()) {
  const snapshot=structuredClone(quote);
  let state:CheckoutState='review',receipt:ConfirmedCheckout|null=null,pending:Promise<void>|null=null,error='';
  const verify=(r:unknown)=>{receipt=verifyCheckoutReceipt(snapshot,id,r);state='confirmed';error='';};
  return {
    get:()=>({state,receipt:receipt?{...receipt}:null,error,requestId:id,quote:structuredClone(snapshot)}),
    approve():Promise<void>{
      if(state==='confirmed')return Promise.resolve();
      if(pending)return pending;
      if(state!=='review')return Promise.reject(new Error('Consulte o resultado antes de tentar novamente.'));
      state='submitting';
      pending=(async()=>{
        try{verify(await Promise.resolve().then(()=>transport.confirm(id,structuredClone(snapshot))));}
        catch(e){if(e instanceof CheckoutRejected){state='rejected';error=e.message;}else{state='uncertain';error='Não foi possível confirmar o resultado. Consulte este pedido antes de refazê-lo.';}}
        finally{pending=null;}
      })();
      return pending;
    },
    async reconcile():Promise<void>{
      if(state==='confirmed')return;
      if(state!=='uncertain')throw new Error('Não há confirmação pendente para consultar.');
      if(pending)return pending;
      pending=(async()=>{
        try{
          const r=await Promise.resolve().then(()=>transport.lookup(id,snapshot.workspaceId));
          if(r.state==='confirmed')verify(r.receipt);
          else if(r.state==='rejected'){state='rejected';error=r.message||'Pedido rejeitado sem gravação.';}
          else error='Resultado ainda não confirmado. Nenhuma nova venda foi enviada.';
        }catch{error='Consulta indisponível. Não refaça o pedido sem confirmar o resultado anterior.';}
        finally{pending=null;}
      })();
      return pending;
    },
  };
}

// SLIM_ERP_RELEASE_V1
