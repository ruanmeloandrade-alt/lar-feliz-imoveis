type Db={from:(table:string)=>any};
export type AcknowledgedMedia={workspaceId:string;actorId:string;leadId:string;sessionId:string;remoteJid:string;messageId:string;kind:'image'|'video'|'audio'|'document';caption?:string;mediaUrl:string;deliveryStatus:string;occurredAt:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateMediaReceipt(value:AcknowledgedMedia):void{
 for(const id of [value.workspaceId,value.actorId,value.leadId,value.sessionId])if(typeof id!=='string'||!UUID.test(id))throw new Error('Referência do envio inválida.');
 if(typeof value.messageId!=='string'||!value.messageId.trim()||value.messageId.length>256||typeof value.remoteJid!=='string'||!/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(value.remoteJid))throw new Error('Confirmação da mensagem inválida.');
 if(!['image','video','audio','document'].includes(value.kind)||!['pending','sent','delivered','read','played'].includes(value.deliveryStatus))throw new Error('Estado da mídia inválido.');
 if(value.caption!==undefined&&(typeof value.caption!=='string'||value.caption.length>2000))throw new Error('Legenda inválida.');
 const url=new URL(value.mediaUrl);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Endereço do arquivo inválido.');
 if(!Number.isFinite(Date.parse(value.occurredAt)))throw new Error('Data da mensagem inválida.');
}
/** Internal persistence only: accepts a provider-confirmed receipt, never a client request to send. */
export async function insertAcknowledgedMedia(db:Db,value:AcknowledgedMedia):Promise<{recorded:true;existing:boolean}>{
 validateMediaReceipt(value);
 const stored={workspace_id:value.workspaceId,session_id:value.sessionId,remote_jid:value.remoteJid,to_jid:value.remoteJid,message_id:value.messageId,from_me:true,message_type:value.kind,body:value.caption??null,media_url:value.mediaUrl,delivery_status:value.deliveryStatus,received_at:value.occurredAt,raw:{source:'slim_inbox_media',actor_id:value.actorId,lead_id:value.leadId,key:{id:value.messageId,remoteJid:value.remoteJid,fromMe:true}}};
 const inserted=await db.from('whatsapp_web_messages').insert(stored);
 if(!inserted.error)return {recorded:true,existing:false};
 if(inserted.error.code!=='23505')throw new Error('O registro da mídia não foi confirmado.');
 const current=await db.from('whatsapp_web_messages').select('session_id,remote_jid,message_id,from_me').eq('workspace_id',value.workspaceId).eq('message_id',value.messageId).maybeSingle();
 if(current.error||!current.data||current.data.session_id!==value.sessionId||current.data.remote_jid!==value.remoteJid||current.data.message_id!==value.messageId||current.data.from_me!==true)throw new Error('O registro existente não corresponde à confirmação desta conversa.');
 // The webhook may already have inserted the same provider event. Never overwrite it.
 return {recorded:true,existing:true};
}
