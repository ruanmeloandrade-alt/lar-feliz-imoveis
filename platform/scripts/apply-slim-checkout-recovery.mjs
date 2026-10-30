import fs from 'node:fs';
const root=new URL('../',import.meta.url),MARK='// SLIM_CHECKOUT_RECOVERY_V1';const plans=[];
function edit(path,run){let code=fs.readFileSync(new URL(path,root),'utf8');if(code.includes(MARK))return;const first=code.split('\n')[0];
 const once=(a,b)=>{if(code.split(a).length!==2)throw new Error(`${path}: recovery anchor changed: ${a.slice(0,90)}`);code=code.replace(a,()=>b);};run(once);
 if(first.startsWith('//')&&!code.startsWith(first+'\n'))throw new Error('Existing transform header must be preserved.');
 plans.push([path,code+'\n'+MARK+'\n']);}
edit('src/components/erp/SlimErpWorkspace.tsx',once=>{
 once("import {useEffect,useMemo,useRef,useState} from 'react';",`import {useEffect,useMemo,useRef,useState} from 'react';
import {closeSlimCheckoutAttempt} from '@/lib/slim-checkout-recovery.functions';
import {finishCheckoutRecovery} from '@/lib/slim-checkout-recovery.core';`);
 once(" const contextQ=useQuery({queryKey:['slim-erp-context'",` const closeAttempt=useServerFn(closeSlimCheckoutAttempt);
 const [closing,setClosing]=useState(false);const recoveryFlight=useRef(false);
 const contextQ=useQuery({queryKey:['slim-erp-context'`);
 once(' const transport=useMemo<CheckoutTransport>(()=>({',` async function closeInterruptedAttempt(){
  if(recoveryFlight.current||recovering||!pendingRequest)return;
  if(!window.confirm('Conferir e encerrar esta tentativa interrompida? Se o pedido já existir, ele será recuperado sem cancelamento. Se ainda não houver pedido, esta referência será encerrada antes de liberar uma nova venda.'))return;
  recoveryFlight.current=true;setClosing(true);setOperationError('');const requestId=pendingRequest;
  try{
   const result=await finishCheckoutRecovery({approved:true,expected:{workspaceId,actorId,requestId},journal:journal(),send:()=>closeAttempt({data:{workspaceId,requestId,approved:true}})});
   if(!live.current)return;
   if(result.state==='processing'){setOperationError('A confirmação original ainda está em processamento. Nenhum pedido foi cancelado; consulte novamente em instantes.');return;}
   setPendingRequest('');
   if(result.state==='existing'){
    if(result.status==='confirmed')setReceipt({requestId,workspaceId,orderId:result.orderId,number:result.number,status:'confirmed',totalCents:result.totalCents});
    else setReceipt(null);
    setNotice('Pedido '+result.number+' recuperado. Situação: '+(result.status==='confirmed'?'confirmado':'cancelado')+'. Nenhuma nova venda ou movimentação de estoque foi criada.');
   }else{setReceipt(null);setCheckoutKey(n=>n+1);setNotice('Tentativa encerrada sem pedido. A chegada atrasada dessa confirmação será rejeitada. Você pode revisar e iniciar uma nova venda.');}
   void refresh().catch(()=>{if(live.current)setOperationError('A recuperação foi concluída, mas a atualização da tela falhou. Atualize sem repetir a venda.');});
  }catch(e){if(live.current)setOperationError(erpReadableError(e));}
  finally{recoveryFlight.current=false;if(live.current)setClosing(false);}
 }
 const transport=useMemo<CheckoutTransport>(()=>({`);
 once("lookup:async(requestId)=>{const result=await lookup({data:{workspaceId,requestId}});if(result.state==='confirmed'||result.state==='rejected')clearJournal(requestId);return result;}","lookup:async(requestId)=>{const result=await lookup({data:{workspaceId,requestId}});if(result.state==='confirmed'||result.state==='rejected')clearJournal(requestId);else if(live.current)setPendingRequest(requestId);return result;}");
 once('disabled={recovering} className="rounded-md border px-4 py-2 text-sm" onClick={()=>void recover(pendingRequest)}>Consultar sem reenviar</button><Link',`disabled={recovering||closing} className="rounded-md border px-4 py-2 text-sm" onClick={()=>void recover(pendingRequest)}>Consultar sem reenviar</button><button type="button" disabled={recovering||closing||!pendingRequest} className="ml-3 rounded-md border px-4 py-2 text-sm disabled:opacity-50" onClick={()=>void closeInterruptedAttempt()}>{closing?'Conferindo tentativa...':'Encerrar tentativa sem pedido'}</button><Link`);
});
edit('src/lib/slim-erp-release.functions.ts',once=>{
 once('const {sb,ws,actor}=await scope(context,data.workspaceId);return lookupErpAttempt(sb,ws,actor,data.requestId);',`const {sb,ws,actor}=await scope(context,data.workspaceId);
  const outcome=await lookupErpAttempt(sb,ws,actor,data.requestId);if(outcome.state!=='not_found')return outcome;
  const closure=await sb.from('slim_checkout_attempt_closures').select('request_id').eq('workspace_id',ws).eq('request_id',data.requestId).eq('actor_id',actor).maybeSingle();
  if(closure.error)throw new Error('Não foi possível consultar o encerramento. A referência foi preservada.');
  return closure.data?{state:'rejected' as const,message:'Esta tentativa foi encerrada sem pedido. Uma confirmação atrasada com a mesma referência não será aceita.'}:outcome;`);
});
for(const [path,code]of plans)fs.writeFileSync(new URL(path,root),code);
console.log(`[Slim checkout recovery] ${plans.length} source files updated. No database command or order mutation executed by this build script.`);
