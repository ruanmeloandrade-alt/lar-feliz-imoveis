import type {ContactDb} from './slim-contact-identity.core';
type Activity={id:string;lead_id:string;type:string;payload:Record<string,any>|null;occurred_at:string};
type Input={limit:number;cursor?:{occurredAt:string;id:string};before?:string;after?:string};
export function canonicalContactHistory(rows:readonly Activity[],canonicalId:string,input:Input){
 const byMessage=new Map<string,Activity>();
 for(const row of rows){if(!Number.isFinite(Date.parse(row.occurred_at)))throw new Error('Data de mensagem inválida.');const p=row.payload??{},key=typeof p.whatsapp_message_id==='string'&&p.whatsapp_message_id?'wa:'+row.type+':'+p.whatsapp_message_id:'id:'+row.id;const old=byMessage.get(key);if(!old||(old.lead_id!==canonicalId&&row.lead_id===canonicalId))byMessage.set(key,row);}
 let unique=[...byMessage.values()].filter(row=>row.type!=='conversation_read');
 if(input.cursor)unique=unique.filter(row=>Date.parse(row.occurred_at)<Date.parse(input.cursor!.occurredAt)||(Date.parse(row.occurred_at)===Date.parse(input.cursor!.occurredAt)&&row.id<input.cursor!.id));
 else if(input.before)unique=unique.filter(row=>Date.parse(row.occurred_at)<Date.parse(input.before!));else if(input.after)unique=unique.filter(row=>Date.parse(row.occurred_at)>Date.parse(input.after!));
 const isDelta=Boolean(input.after);unique.sort((a,b)=>{const cmp=Date.parse(a.occurred_at)-Date.parse(b.occurred_at)||a.id.localeCompare(b.id);return isDelta?cmp:-cmp;});
 const hasMore=unique.length>input.limit,limited=unique.slice(0,input.limit),page=isDelta?limited:limited.slice().reverse();
 const activities=page.map(a=>{const p=a.payload??{};return {id:a.id,type:a.type,text:typeof p.text==='string'?p.text:null,mediaUrl:p.media_url??null,mediaType:p.media_type??null,mimeType:p.mime_type??null,fileName:p.file_name??null,durationSeconds:typeof p.duration_seconds==='number'?p.duration_seconds:null,whatsappMessageId:p.whatsapp_message_id??null,reactions:Array.isArray(p.reactions)?p.reactions:[],deletedForMe:p.deleted_for_me===true,deletedForAll:p.deleted_for_all===true,from:a.type==='message_out'||a.type==='note'?'us' as const:'lead' as const,occurredAt:a.occurred_at,error:typeof p.error==='string'?p.error:null};});
 const oldest=page[0];return {activities,hasMore,earliestAt:oldest?.occurred_at??null,nextCursor:!isDelta&&hasMore&&oldest?{occurredAt:oldest.occurred_at,id:oldest.id}:null};
}
export async function readSlimContactHistory(db:ContactDb,workspaceId:string,canonicalId:string,family:string[],input:Input){
 const rows:Activity[]=[];
 for(;;){const result=await db.from('lead_activities').select('id,lead_id,type,payload,occurred_at').eq('workspace_id',workspaceId).in('lead_id',family).order('id').range(rows.length,rows.length+499);if(result.error||!Array.isArray(result.data))throw new Error('Não foi possível carregar o histórico completo. Nenhuma mensagem foi apagada.');rows.push(...result.data);if(result.data.length<500)break;if(rows.length>100000)throw new Error('Histórico excede o limite de consulta. Nenhum histórico parcial foi apresentado.');}
 return canonicalContactHistory(rows,canonicalId,input);
}
