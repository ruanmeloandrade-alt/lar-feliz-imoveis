import {createHash} from 'node:crypto';
import {requireActiveWorkspace} from '@/lib/workspace-resolver.server';
import {assertSlimOperator} from '@/lib/slim-workspace-operator.server';
import {checked,loadErpOrder,quoteFromOrder,receiptFromOrder} from '@/lib/slim-erp-data.server';
import {validateOrderSnapshot} from '@/lib/slim-order-read.core';
import {buildSlimOrderReceiptPdf} from '@/lib/slim-order-receipt.server';
import {normalizeInternationalPhone,directWhatsappJidFromCanonicalDigits} from '@/lib/whatsapp-identity';
import {dispatchApprovedReceipt,receiptConsentMaterial,type ReceiptIntent,type ReceiptOffer,type ReceiptDispatchResult,type ReceiptReservation} from './slim-receipt-dispatch.core';
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const DELIVERY='id,workspace_id,document_id,request_id,actor_id,session_id,phone,status,message_id,last_error,consent_sha256,created_at,finished_at';
async function scope(context:any,expected:string){const sb=context.supabase,ws=await requireActiveWorkspace(sb,context.userId,{createIfMissing:false});if(ws!==expected)throw new Error('A empresa ativa mudou. Reabra o documento.');await assertSlimOperator(sb,ws,context.userId);return {sb,ws,actor:context.userId as string};}
async function offerFor(sb:any,ws:string,actor:string,orderId:string):Promise<ReceiptOffer>{
 const {row,order}=await loadErpOrder(sb,ws,orderId);if(order.status!=='confirmed')throw new Error('Este pedido foi cancelado. Envio não liberado.');
 const original=validateOrderSnapshot(row.snapshot,ws);
 const lead=checked(await sb.from('leads').select('id,name,phone,status,merged_into_id,custom_data').eq('workspace_id',ws).eq('id',order.customer.id).maybeSingle(),'Não foi possível conferir o cliente.');
 if(!lead||lead.merged_into_id||['archived','deleted','merged'].includes(lead.status)||['opt_out','do_not_contact','whatsapp_opt_out'].some(k=>[true,'true'].includes(lead.custom_data?.[k])))throw new Error('Cliente indisponível ou com bloqueio de contato.');
 const phone=normalizeInternationalPhone(String(lead.phone??''),{allowTrustedBare:true});if(!phone.ok)throw new Error('Cadastre o telefone completo do cliente com código do país antes de enviar.');
 const sessions=checked(await sb.from('whatsapp_web_sessions').select('id,phone_number,status,metadata').eq('workspace_id',ws).eq('provider','evolution').eq('status','conectado'),'Não foi possível consultar os canais.');
 const pdf=Buffer.from(buildSlimOrderReceiptPdf({quote:quoteFromOrder(original),receipt:receiptFromOrder(original),issuer:original.issuer,customer:original.customer,createdAt:original.confirmedAt}));
 if(pdf.length>3000000)throw new Error('Documento acima do limite de envio.');
 return {workspaceId:ws,orderId,actorId:actor,number:order.number,customerName:lead.name,phone:'+'+phone.digits,sha256:hash(pdf),filename:`pedido-${order.number}.pdf`,pdfBase64:pdf.toString('base64'),sessions:(sessions??[]).filter((s:any)=>s.metadata?.deleted!==true&&s.metadata?.deleted!=='true').map((s:any)=>({id:s.id,phone:s.phone_number||'WhatsApp conectado'}))};
}
function resultFor(row:any):ReceiptDispatchResult{if(!row||!['pending','accepted','rejected','uncertain'].includes(row.status))throw new Error('Resultado do envio inválido.');return {requestId:row.request_id,status:row.status,messageId:row.message_id??null,code:row.last_error??null};}
async function storedDocument(sb:any,offer:ReceiptOffer){
 let row=checked(await sb.from('slim_order_documents').select('id,order_id,workspace_id,sha256,filename,pdf_base64,version').eq('workspace_id',offer.workspaceId).eq('order_id',offer.orderId).maybeSingle(),'Documento arquivado indisponível.');
 if(!row){const r=await sb.from('slim_order_documents').insert({order_id:offer.orderId,workspace_id:offer.workspaceId,requested_by:offer.actorId,version:1,sha256:offer.sha256,filename:offer.filename,pdf_base64:offer.pdfBase64}).select('id,order_id,workspace_id,sha256,filename,pdf_base64,version').single();
  if(r.error&&r.error.code!=='23505')throw new Error('Não foi possível arquivar o documento. Nenhum envio foi iniciado.');
  row=r.data??checked(await sb.from('slim_order_documents').select('id,order_id,workspace_id,sha256,filename,pdf_base64,version').eq('workspace_id',offer.workspaceId).eq('order_id',offer.orderId).single(),'Documento concorrente indisponível.');
 }
 if(row.workspace_id!==offer.workspaceId||row.order_id!==offer.orderId||row.version!==1||row.sha256!==offer.sha256||row.filename!==offer.filename||hash(Buffer.from(row.pdf_base64,'base64'))!==offer.sha256)throw new Error('A versão arquivada não corresponde ao comprovante deste pedido. O envio foi interrompido.');
 return row;
}
export async function prepareReceiptDispatch(context:any,input:{workspaceId:string;orderId:string}){
 const {sb,ws,actor}=await scope(context,input.workspaceId);const offer=await offerFor(sb,ws,actor,input.orderId);
 const doc=checked(await sb.from('slim_order_documents').select('id').eq('workspace_id',ws).eq('order_id',input.orderId).maybeSingle(),'Não foi possível conferir o arquivo.');
 const attempts=doc?checked(await sb.from('slim_order_document_deliveries').select(DELIVERY).eq('workspace_id',ws).eq('document_id',doc.id).order('created_at',{ascending:false}).limit(10),'Histórico de envios indisponível.'):[];
 const unresolved=(attempts??[]).find((a:any)=>a.status==='pending'||a.status==='uncertain');
 const {pdfBase64,...safe}=offer;return {...safe,attempts:(attempts??[]).map((a:any)=>({...resultFor(a),createdAt:a.created_at,phone:a.phone})),unresolved:unresolved?resultFor(unresolved):null};
}
export async function lookupReceiptDispatch(context:any,input:{workspaceId:string;orderId:string;requestId:string}){
 const {sb,ws}=await scope(context,input.workspaceId);await loadErpOrder(sb,ws,input.orderId);
 const row=checked(await sb.from('slim_order_document_deliveries').select(DELIVERY).eq('workspace_id',ws).eq('request_id',input.requestId).maybeSingle(),'Resultado indisponível. Não reenvie o arquivo.');
 if(!row)return {requestId:input.requestId,status:'uncertain' as const,code:'NOT_CONFIRMED'};
 const doc=checked(await sb.from('slim_order_documents').select('order_id').eq('workspace_id',ws).eq('id',row.document_id).maybeSingle(),'Documento do envio indisponível.');
 if(doc?.order_id!==input.orderId)throw new Error('Tentativa de outro pedido.');return resultFor(row);
}
export async function sendReceiptDispatch(context:any,intent:ReceiptIntent){
 const {sb,ws,actor}=await scope(context,intent.workspaceId);let credentials:any;
 return dispatchApprovedReceipt(intent,{
  actorId:actor,prepare:()=>offerFor(sb,ws,actor,intent.orderId),
  reserve:async offer=>{
   const doc=await storedDocument(sb,offer),consent=hash(receiptConsentMaterial(doc.id,offer.sha256,offer.orderId,intent.sessionId,offer.phone,intent.requestId));
   const existing=checked(await sb.from('slim_order_document_deliveries').select(DELIVERY).eq('workspace_id',ws).eq('request_id',intent.requestId).maybeSingle(),'Não foi possível verificar a tentativa anterior.');
   const reuse=(r:any):ReceiptReservation=>{if(r.document_id!==doc.id||r.actor_id!==actor||r.consent_sha256!==consent)throw new Error('Referência já utilizada com outra aprovação.');return {id:r.id,fresh:false,result:resultFor(r)};};
   if(existing)return reuse(existing);
   const r=await sb.from('slim_order_document_deliveries').insert({workspace_id:ws,document_id:doc.id,request_id:intent.requestId,actor_id:actor,session_id:intent.sessionId,phone:offer.phone,status:'pending',consent_sha256:consent}).select(DELIVERY).single();
   if(r.error){if(r.error.code==='23505'){
     const duplicate=checked(await sb.from('slim_order_document_deliveries').select(DELIVERY).eq('workspace_id',ws).eq('request_id',intent.requestId).maybeSingle(),'Tentativa duplicada indisponível.');if(duplicate)return reuse(duplicate);
     throw new Error('Já existe um envio pendente ou incerto deste documento. Consulte o resultado antes de reenviar.');
    }throw new Error('Não foi possível reservar o envio. Consulte o histórico antes de tentar novamente.');}
   return {id:r.data.id,fresh:true,result:resultFor(r.data)};
  },
  recheck:async offer=>{
   const current=await offerFor(sb,ws,actor,offer.orderId);
   if(current.phone!==offer.phone||current.sha256!==offer.sha256||!current.sessions.some(s=>s.id===intent.sessionId))return false;
   const key=process.env.INTEGRATION_ENCRYPTION_KEY;if(!key)throw new Error('Cofre indisponível.');
   credentials=checked(await sb.rpc('get_evolution_credentials',{_session_id:intent.sessionId,_key:key}),'Credencial da sessão indisponível.');
   return Boolean(credentials?.workspace_id===ws&&credentials?.status==='conectado'&&credentials?.instance_name&&credentials?.api_key);
  },
  send:async offer=>{
   const base=process.env.EVOLUTION_BASE_URL;if(!base)throw new Error('Canal não configurado.');
   const url=new URL(base);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Endpoint inválido.');
   const response=await fetch(`${base.replace(/\/+$/,'')}/message/sendMedia/${encodeURIComponent(credentials.instance_name)}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:credentials.api_key},body:JSON.stringify({number:offer.phone.slice(1),mediatype:'document',mimetype:'application/pdf',fileName:offer.filename,caption:`Comprovante do pedido ${offer.number} · Vanessa Simoni`,media:offer.pdfBase64}),signal:AbortSignal.timeout(30000)});
   const json=await response.json().catch(()=>null);return {ok:response.ok,status:response.status,messageId:typeof json?.key?.id==='string'?json.key.id:undefined};
  },
  recordInbox:async(offer,_intent,messageId,deliveryId)=>{
   const jid=directWhatsappJidFromCanonicalDigits(offer.phone.slice(1));if(!jid)throw new Error('Destinatário inválido.');
   const r=await sb.from('whatsapp_web_messages').insert({workspace_id:ws,session_id:intent.sessionId,remote_jid:jid,to_jid:jid,message_id:messageId,from_me:true,message_type:'document',body:offer.filename,delivery_status:'sent',raw:{source:'slim_order_receipt',order_id:offer.orderId,delivery_id:deliveryId,document_sha256:offer.sha256},received_at:new Date().toISOString()});
   if(r.error&&r.error.code!=='23505')throw new Error('Histórico da conversa indisponível.');
  },
  finish:async(reservation,result)=>{
   const row=checked(await sb.from('slim_order_document_deliveries').update({status:result.status,message_id:result.messageId??null,last_error:result.code??null,finished_at:new Date().toISOString()}).eq('id',reservation.id).eq('workspace_id',ws).eq('actor_id',actor).eq('status','pending').select(DELIVERY).maybeSingle(),'Registro do resultado não confirmado.');
   if(!row||row.status!==result.status)throw new Error('Registro do resultado não confirmado.');
  },
 });
}
