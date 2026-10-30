import {useEffect,useRef,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {useQuery} from '@tanstack/react-query';
import {prepareSlimReceiptDispatch,approveSlimReceiptDispatch,lookupSlimReceiptDispatch} from '@/lib/slim-receipt-dispatch.functions';
import type {ReceiptDispatchResult} from '@/lib/slim-receipt-dispatch.core';
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s);
const messages={pending:'Envio registrado e ainda sem resultado final. Consulte sem reenviar.',accepted:'Arquivo aceito pelo WhatsApp conectado. Isso não confirma leitura pelo cliente.',rejected:'O envio não foi aceito. Confira o motivo antes de preparar outra tentativa.',uncertain:'O resultado não pôde ser confirmado. Não reenvie automaticamente; confira a conversa e consulte esta tentativa.'};
export function SlimReceiptDispatch({workspaceId,orderId,actorId}:{workspaceId:string;orderId:string;actorId:string}){
 const prepare=useServerFn(prepareSlimReceiptDispatch),send=useServerFn(approveSlimReceiptDispatch),lookup=useServerFn(lookupSlimReceiptDispatch);
 const q=useQuery({queryKey:['slim-receipt-offer',workspaceId,orderId,actorId],queryFn:()=>prepare({data:{workspaceId,orderId}}),retry:1,staleTime:0,refetchOnWindowFocus:false});
 const [sessionId,setSessionId]=useState(''),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<ReceiptDispatchResult|null>(null),[requestId,setRequestId]=useState('');
 const [localBlocked,setLocalBlocked]=useState(false);
 const lock=useRef(false),live=useRef(true);useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const offer=q.data?.actorId===actorId?q.data:undefined;const key=offer?`saude-slim:receipt-attempt:${workspaceId}:${orderId}:${offer.actorId}`:'';
 useEffect(()=>{
  if(!offer||!key)return;
  try{const saved=window.localStorage.getItem(key);if(saved){if(!uuid(saved))throw new Error('Referência local inválida. Confira o histórico de envios.');setRequestId(saved);setResult({requestId:saved,status:'pending',code:'LOCAL_ATTEMPT'});}else if(offer.unresolved){setRequestId(offer.unresolved.requestId);setResult(offer.unresolved);}}
  catch(e){setLocalBlocked(true);setError(e instanceof Error?e.message:'Não foi possível conferir a tentativa anterior.');}
 },[key,offer?.unresolved?.requestId]);
 function applyResult(r:ReceiptDispatchResult){
  if(!uuid(r.requestId)||!['pending','accepted','rejected','uncertain'].includes(r.status))throw new Error('Resposta de envio inválida. Não reenvie o documento.');
  if(live.current){setRequestId(r.requestId);setResult(r);setApproved(false);}
  if((r.status==='accepted'||r.status==='rejected')&&key&&window.localStorage.getItem(key)===r.requestId)window.localStorage.removeItem(key);
 }
 async function approveSend(){
  if(lock.current||localBlocked||!offer||!approved||!sessionId||result||offer.unresolved||q.error)return;
  lock.current=true;setBusy(true);setError('');const id=requestId||crypto.randomUUID();let registered=false;
  try{
   window.localStorage.setItem(key,id);if(window.localStorage.getItem(key)!==id)throw new Error('Não foi possível preservar a referência de envio.');registered=true;setRequestId(id);
   const r=await send({data:{workspaceId,orderId,sessionId,requestId:id,expectedPhone:offer.phone,expectedSha256:offer.sha256,approved:true}});applyResult(r);
  }catch(e){if(live.current){setError(e instanceof Error?e.message:'Falha ao consultar o envio.');if(registered)setResult({requestId:id,status:'uncertain',code:'RESPONSE_UNAVAILABLE'});}}
  finally{lock.current=false;if(live.current)setBusy(false);}
 }
 async function checkResult(){
  const id=requestId||offer?.unresolved?.requestId;if(!id||lock.current)return;lock.current=true;setBusy(true);setError('');
  try{const r=await lookup({data:{workspaceId,orderId,requestId:id}});applyResult(r);}catch(e){if(live.current)setError(e instanceof Error?e.message:'Resultado indisponível; não reenvie.');}
  finally{lock.current=false;if(live.current)setBusy(false);}
 }
 async function newIntent(){if(lock.current)return;setApproved(false);setSessionId('');setRequestId('');setResult(null);setError('');await q.refetch();}
 const unavailable=q.error||!offer;
 return <section className="space-y-3 rounded-lg border border-border p-3" aria-label="Envio do comprovante por WhatsApp">
  <h3 className="font-medium text-sm">Deseja enviar este comprovante pelo WhatsApp?</h3>
  {unavailable?<><p className="text-sm" role={q.error?'alert':'status'}>{q.error instanceof Error?q.error.message:q.error?'Não foi possível preparar o envio.':'Conferindo cliente, arquivo e canais...'}</p>{q.error&&<button type="button" className="text-sm underline" onClick={()=>q.refetch()}>Conferir novamente</button>}</>:<>
   <div className="text-sm space-y-1"><p><strong>Cliente:</strong> {offer.customerName}</p><p><strong>Destino:</strong> {offer.phone}</p><p className="break-all"><strong>Arquivo:</strong> {offer.filename}</p></div>
   <p className="text-xs text-muted-foreground">O arquivo será arquivado com a versão desta venda. Nenhum envio ocorre sem sua confirmação. Cancelar o pedido não recolhe uma mensagem já enviada.</p>
   {result?<div className="rounded-md border p-3 space-y-2" role="status"><p className="text-sm">{messages[result.status]}</p>{result.code&&<p className="break-words text-xs text-muted-foreground">Diagnóstico: {result.code}</p>}{result.messageId&&<p className="break-all text-xs">Protocolo: {result.messageId}</p>}{['pending','uncertain'].includes(result.status)?<button type="button" disabled={busy} className="text-sm underline" onClick={()=>void checkResult()}>{busy?'Consultando...':'Consultar resultado sem reenviar'}</button>:<button type="button" disabled={busy} className="text-sm underline" onClick={()=>void newIntent()}>Preparar outro envio com nova aprovação</button>}</div>:<>
    <label className="grid gap-1 text-sm">Canal de envio<select className="rounded-md border border-input bg-background p-2" value={sessionId} disabled={busy||Boolean(offer.unresolved)} onChange={e=>{setSessionId(e.target.value);setApproved(false);}}><option value="">Selecione o WhatsApp conectado</option>{offer.sessions.map(s=><option key={s.id} value={s.id}>{s.phone}</option>)}</select></label>
    {!offer.sessions.length&&<p className="text-sm">Nenhum WhatsApp conectado está disponível para esta empresa.</p>}
    <label className="flex gap-2 items-start text-sm"><input type="checkbox" className="mt-1" checked={approved} disabled={busy||Boolean(offer.unresolved)} onChange={e=>setApproved(e.target.checked)}/><span>Conferi o cliente, o número, o arquivo e o canal. Aprovo este envio.</span></label>
    <button type="button" disabled={busy||localBlocked||!approved||!sessionId||Boolean(offer.unresolved)} onClick={()=>void approveSend()} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy?'Registrando e enviando...':'Confirmar e enviar comprovante'}</button>
   </>}
   {!!offer.attempts.length&&<details className="text-xs"><summary className="cursor-pointer">Envios anteriores deste documento</summary><div className="mt-2 space-y-2">{offer.attempts.map(a=><p key={a.requestId}>{new Date(a.createdAt).toLocaleString('pt-BR')} · {a.phone} · {messages[a.status]} {a.code??''}</p>)}</div></details>}
  </>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </section>;
}

// SLIM_RECEIPT_UI_IDENTITY_V1
