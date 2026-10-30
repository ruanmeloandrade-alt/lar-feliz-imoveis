import {resolveSlimWhatsappEntry, type PendingWhatsappCreation} from './slim-whatsapp-entry.core.ts';
export type ContactDb={from:(table:string)=>any;rpc?:(name:string,args:Record<string,unknown>)=>PromiseLike<any>};
export type IdentityContact={id:string;workspace_id:string;name:string;phone:string|null;source:string|null;status:string;merged_into_id:string|null;created_at:string;custom_data:Record<string,unknown>|null;pipeline_id?:string|null;stage_id?:string|null};
export function contactPhoneKey(phone:unknown):string|null{if(typeof phone!=='string'||!/^\+?[0-9().\s-]+$/.test(phone.trim()))return null;const digits=phone.replace(/[^0-9]/g,'');return digits.length>=8&&digits.length<=15?digits:null;}
export function contactWhatsappSession(custom:unknown):string|null{if(!custom||typeof custom!=='object'||Array.isArray(custom))return null;const value=(custom as Record<string,unknown>).whatsapp_session_id;return typeof value==='string'&&value.trim()?value.trim():null;}
export function whatsappContactKey(phone:string,sessionId:string){return sessionId+':'+phone;}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function buildContactIdentityIndex(rows:readonly IdentityContact[],workspaceId:string){
 const all=new Map<string,IdentityContact>();for(const row of rows){if(row.workspace_id!==workspaceId||!UUID.test(row.id)||all.has(row.id))throw new Error('Resposta de identidade inconsistente.');all.set(row.id,row);}
 const active=rows.filter(l=>!l.merged_into_id&&!['deleted','merged','archived'].includes(l.status));
 const byPhone=new Map<string,IdentityContact[]>();for(const row of active){const key=contactPhoneKey(row.phone);if(key){const group=byPhone.get(key)??[];group.push(row);byPhone.set(key,group);}}
 const canonical=new Map<string,string>();for(const row of active)canonical.set(row.id,row.id);
 for(const group of byPhone.values()){
  // A legacy order row is not another person. Never combine names, numbers with another DDI, groups or unrelated social identities.
  const originals=group.filter(r=>r.source!=='pedido_saude_slim'&&!['whatsapp_group','instagram','facebook','messenger'].includes(r.source??''));
  originals.sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
  for(const alias of group){const session=contactWhatsappSession(alias.custom_data);if(alias.source!=='pedido_saude_slim'||!session)continue;const original=originals.find(row=>contactWhatsappSession(row.custom_data)===session);if(original)canonical.set(alias.id,original.id);}
 }
 function resolve(id:string):string{
  const seen=new Set<string>();let current=id;
  for(let depth=0;depth<21;depth++){
   if(seen.has(current))throw new Error('Vínculo circular de contato.');seen.add(current);const row=all.get(current);
   if(!row)throw new Error('Contato não encontrado nesta empresa.');
   if(row.merged_into_id){current=row.merged_into_id;continue;}
   const result=canonical.get(current);if(!result)throw new Error('Contato indisponível.');return result;
  }
  throw new Error('Vínculo de contato excede o limite.');
 }
 function family(id:string){const target=resolve(id);return rows.filter(r=>{try{return resolve(r.id)===target;}catch{return false;}}).map(r=>r.id);}
 function forPhone(phone:string,sessionId?:string|null){const key=contactPhoneKey(phone);if(!key)return null;const group=byPhone.get(key)??[];let candidates=[...new Set(group.map(r=>resolve(r.id)))].map(id=>all.get(id)!);if(sessionId){const exact=candidates.filter(row=>contactWhatsappSession(row.custom_data)===sessionId);candidates=exact.length?exact:candidates.length===1&&!contactWhatsappSession(candidates[0].custom_data)?candidates:[];}else if(new Set(candidates.map(row=>contactWhatsappSession(row.custom_data)).filter(Boolean)).size>1)throw new Error('Este telefone possui atendimentos em mais de um WhatsApp. Selecione o card da origem correta.');candidates.sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));return candidates[0]??null;}
 return {resolve,family,forPhone,canonical,rows:active.filter(r=>canonical.get(r.id)===r.id)};
}
export async function loadContactIdentityIndex(db:ContactDb,workspaceId:string){
 if(!UUID.test(workspaceId))throw new Error('Empresa inválida.');const rows:IdentityContact[]=[];
 for(;;){const result=await db.from('leads').select('id,workspace_id,name,phone,source,status,merged_into_id,created_at,custom_data,pipeline_id,stage_id').eq('workspace_id',workspaceId).order('id').range(rows.length,rows.length+499);if(result.error||!Array.isArray(result.data))throw new Error('Não foi possível conferir a identidade dos contatos. Nenhum cadastro foi criado.');rows.push(...result.data);if(result.data.length<500)break;if(rows.length>100000)throw new Error('Limite de leitura dos contatos atingido.');}
 return buildContactIdentityIndex(rows,workspaceId);
}
export async function findSlimContact(db:ContactDb,workspaceId:string,phone:string,sessionId?:string|null){const index=await loadContactIdentityIndex(db,workspaceId);const row=index.forPhone(phone,sessionId);return row?{...row,phone_normalized:contactPhoneKey(row.phone)}:null;}
export async function resolveSlimContactId(db:ContactDb,workspaceId:string,leadId:string):Promise<string>{if(!UUID.test(leadId))throw new Error('Referência inválida.');return (await loadContactIdentityIndex(db,workspaceId)).resolve(leadId);}
// Only trusted server handlers call this creation routine. Serializes these entry points in the running application process.
const contactLocks=new Map<string,Promise<void>>();
export async function createSlimCanonicalContact(db:ContactDb,workspaceId:string,data:Record<string,unknown>):Promise<{id:string;created:boolean}>{
 if(typeof window!=='undefined')throw new Error('Criação de contato deve ser executada pelo servidor autenticado.');
 if(!UUID.test(workspaceId))throw new Error('Empresa inválida.');const key=contactPhoneKey(data.phone),sessionId=contactWhatsappSession(data.custom_data),lockKey=workspaceId+':'+(key??String(data.requestId??crypto.randomUUID()))+':'+(sessionId??'');
 const previous=contactLocks.get(lockKey)??Promise.resolve();let release!:()=>void;const gate=new Promise<void>(done=>{release=done;});const tail=previous.then(()=>gate);contactLocks.set(lockKey,tail);await previous;
 try{
  if(key){const existing=await findSlimContact(db,workspaceId,String(data.phone),sessionId);if(existing)return {id:existing.id,created:false};}
  const name=typeof data.name==='string'?data.name.trim():'';if(!name||name.length>200)throw new Error('Nome inválido.');
  if(data.phone&&!key)throw new Error('Informe o telefone completo. Identificadores de grupo não são números de cliente.');
  const result=await db.from('leads').insert({workspace_id:workspaceId,crm_source_id:data.crm_source_id??null,pipeline_id:data.pipeline_id??null,stage_id:data.stage_id??null,name,email:data.email||null,phone:data.phone||null,phone_normalized:key,value:data.value??0,source:data.source==='whatsapp'?'whatsapp':'cadastro_manual_saude_slim',status:'active',custom_data:data.custom_data??{},tags:[],last_message_from:data.last_message_from??'none'}).select('id').single();
  if(result.error){if(result.error.code==='23505'&&key){const existing=await findSlimContact(db,workspaceId,String(data.phone),sessionId);if(existing)return {id:existing.id,created:false};}throw new Error(result.error.message??'Cadastro não confirmado.');}
  if(!result.data||!UUID.test(result.data.id))throw new Error('O servidor não confirmou o contato.');return {id:result.data.id,created:true};
 }finally{release();if(contactLocks.get(lockKey)===tail)contactLocks.delete(lockKey);}
}
export async function prepareSlimInboxContactMap(db:ContactDb,workspaceId:string,byPhone:Map<string,any[]>){
 const index=await loadContactIdentityIndex(db,workspaceId),leadByPhone=new Map<string,string>(),customDataByLead=new Map<string,Record<string,unknown>>(),pendingCreated:PendingWhatsappCreation[]=[];let leadsCreated=0;
 const entries=[...byPhone].map(([key,messages])=>({key,messages,phone:key.includes(':')?key.slice(key.indexOf(':')+1):key,sessionId:messages[0]?.session_id as string|undefined}));
 for(const entry of entries){if(entry.messages.some(m=>m.session_id!==entry.sessionId))throw new Error('A sincronização tentou misturar números de WhatsApp.');const row=index.forPhone(entry.phone,entry.sessionId);if(row){leadByPhone.set(entry.key,row.id);customDataByLead.set(row.id,row.custom_data??{});if(row.source==='whatsapp'&&row.custom_data?.crm_created_dispatched===false&&entry.sessionId)pendingCreated.push({id:row.id,sessionId:entry.sessionId});}}
 const missing=entries.filter(entry=>!leadByPhone.has(entry.key)&&entry.messages.some(m=>!m.from_me));
 if(missing.length){const entrance=await resolveSlimWhatsappEntry(db,workspaceId);
  for(const {key,phone,messages,sessionId} of missing){const inbound=messages.find(m=>!m.from_me&&m.sender_name?.trim()),latest=messages[0],custom={...(sessionId?{whatsapp_session_id:sessionId}:{}),whatsapp_name_source:inbound?'inbound_push_name':'phone_fallback',crm_created_dispatched:false};const result=await createSlimCanonicalContact(db,workspaceId,{...entrance,name:inbound?.sender_name?.trim()||'+'+phone,phone:'+'+phone,source:'whatsapp',custom_data:custom,last_message_from:latest?.from_me?'us':'lead'});const persisted=await findSlimContact(db,workspaceId,phone,sessionId);if(!persisted||persisted.id!==result.id)throw new Error('Identidade mudou durante a sincronização.');leadByPhone.set(key,result.id);customDataByLead.set(result.id,persisted.custom_data??{});if(result.created)leadsCreated++;if(sessionId&&persisted.custom_data?.crm_created_dispatched===false)pendingCreated.push({id:result.id,sessionId});}
 }
 return {leadByPhone,customDataByLead,leadsCreated,pendingCreated};
}
export function dedupeContactMessages<T extends {id:string;type?:string;occurredAt?:string;payload?:Record<string,any>;whatsappMessageId?:string|null}>(rows:readonly T[]):T[]{
 const seen=new Set<string>();return rows.filter(row=>{const provider=row.whatsappMessageId??row.payload?.whatsapp_message_id;const kind=row.type??'';const key=provider?'whatsapp:'+kind+':'+provider:'activity:'+row.id;if(seen.has(key))return false;seen.add(key);return true;});
}
