export type ReceiptIntent={workspaceId:string;orderId:string;sessionId:string;requestId:string;expectedSha256:string;expectedPhone:string;approved:true};
export type ReceiptOffer={workspaceId:string;orderId:string;actorId:string;number:string;customerName:string;phone:string;sha256:string;filename:string;pdfBase64:string;sessions:Array<{id:string;phone:string}>};
export type ReceiptDispatchResult={requestId:string;status:'pending'|'accepted'|'rejected'|'uncertain';messageId?:string|null;code?:string|null;reused?:boolean};
export type ReceiptReservation={id:string;fresh:boolean;result:ReceiptDispatchResult};
export type ReceiptDispatchDependencies={
 actorId:string;prepare:()=>Promise<ReceiptOffer>;reserve:(offer:ReceiptOffer,intent:ReceiptIntent)=>Promise<ReceiptReservation>;
 recheck:(offer:ReceiptOffer,intent:ReceiptIntent)=>Promise<boolean>;
 send:(offer:ReceiptOffer,intent:ReceiptIntent)=>Promise<{ok:boolean;status:number;messageId?:string}>;
 recordInbox:(offer:ReceiptOffer,intent:ReceiptIntent,messageId:string,deliveryId:string)=>Promise<void>;
 finish:(reservation:ReceiptReservation,result:ReceiptDispatchResult)=>Promise<void>;
};
export function receiptConsentMaterial(documentId:string,sha256:string,orderId:string,sessionId:string,phone:string,requestId:string){return [documentId,sha256,orderId,sessionId,phone,requestId].join('|');}
export function assertReceiptIntent(offer:ReceiptOffer,intent:ReceiptIntent,actorId:string){
 if(intent.approved!==true)throw new Error('Confirme o envio antes de continuar.');
 if(offer.workspaceId!==intent.workspaceId||offer.orderId!==intent.orderId||offer.actorId!==actorId)throw new Error('A empresa ou o pedido mudou. Reabra o documento.');
 if(offer.sha256!==intent.expectedSha256||offer.phone!==intent.expectedPhone)throw new Error('O documento ou o telefone mudou. Revise a aprovação.');
 if(!offer.sessions.some(s=>s.id===intent.sessionId))throw new Error('Selecione um canal conectado desta empresa.');
 if(!/^\+[1-9]\d{7,14}$/.test(offer.phone)||!/^pedido-[A-Za-z0-9_-]+\.pdf$/.test(offer.filename)||!offer.pdfBase64||offer.pdfBase64.length>4000000)throw new Error('Documento ou destinatário inválido.');
}
export async function dispatchApprovedReceipt(intent:ReceiptIntent,d:ReceiptDispatchDependencies):Promise<ReceiptDispatchResult>{
 if(intent.approved!==true)throw new Error('Aprovação explícita obrigatória.');
 const offer=await d.prepare();assertReceiptIntent(offer,intent,d.actorId);
 const reservation=await d.reserve(offer,intent);
 if(!reservation.fresh)return {...reservation.result,reused:true};
 let attempted=false;
 let result:ReceiptDispatchResult={requestId:intent.requestId,status:'rejected',code:'PRECONDITION_CHANGED'};
 try{
  if(await d.recheck(offer,intent)){
   attempted=true;const response=await d.send(offer,intent);
   if(!response.ok)result={requestId:intent.requestId,status:response.status>=500||response.status===408?'uncertain':'rejected',code:`PROVIDER_${response.status}`};
   else if(!response.messageId)result={requestId:intent.requestId,status:'uncertain',code:'MISSING_PROVIDER_RECEIPT'};
   else{
    result={requestId:intent.requestId,status:'accepted',messageId:response.messageId};
    try{await d.recordInbox(offer,intent,response.messageId,reservation.id);}catch{result.code='INBOX_HISTORY_UNAVAILABLE';}
   }
  }
 }catch{result={requestId:intent.requestId,status:attempted?'uncertain':'rejected',code:attempted?'PROVIDER_RESULT_UNKNOWN':'PRECONDITION_UNAVAILABLE'};}
 try{await d.finish(reservation,result);return result;}catch{return {...result,status:'uncertain',code:result.status==='accepted'?'RECEIPT_LOG_UNCONFIRMED':'ATTEMPT_LOG_UNCONFIRMED'};}
}
