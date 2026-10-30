export type ConversationAutomation = { botActive: boolean; aiActive: boolean };
export type ConversationIndicator = { kind: 'unread'|'unanswered'|'bot'|'ai'; color: string; label: string };
export function conversationIndicator(input: {lastMessageFrom?:string;unreadCount?:number;opened?:boolean;automation?:ConversationAutomation}):ConversationIndicator|null {
  if(input.automation?.aiActive)return {kind:'ai',color:'#ffffff',label:'IA ativa nesta conversa'};
  if(input.automation?.botActive)return {kind:'bot',color:'#000080',label:'SalesBot ativo nesta conversa'};
  if(input.lastMessageFrom!=='them')return null;
  if(!input.opened&&(input.unreadCount??0)>0)return {kind:'unread',color:'#f59e0b',label:'Mensagem ainda não lida'};
  return {kind:'unanswered',color:'#ef4444',label:'Conversa aberta, aguardando nossa resposta'};
}
export const ACTIVE_INBOX_BOT_STATES=['queued','pending','running','waiting','waiting_timer','waiting_message'] as const;
export function chooseRecordingMime(supported:(mime:string)=>boolean):string {
  for(const mime of ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4','audio/webm'])if(supported(mime))return mime;
  return '';
}
export function recordingExtension(mime:string):string {
  if(mime.includes('mp4'))return 'm4a';if(mime.includes('ogg'))return 'ogg';if(mime.includes('wav'))return 'wav';return 'webm';
}
export const INBOX_MEDIA_LIMIT=16*1024*1024;
export function assertInboxAudio(size:number,mime:string):void {
  if(!Number.isSafeInteger(size)||size<256)throw new Error('Gravação muito curta. Grave novamente.');
  if(size>INBOX_MEDIA_LIMIT)throw new Error('A gravação ultrapassou o limite de 16 MB deste envio.');
  if(!mime.toLowerCase().startsWith('audio/'))throw new Error('Formato de gravação não reconhecido pelo navegador.');
}
export function uniqueConversationRows<T extends {id:string;lastMessageAt:string}>(rows:readonly T[]):T[] {
  const byId=new Map<string,T>();
  for(const row of rows){const old=byId.get(row.id);if(!old||Date.parse(row.lastMessageAt)>Date.parse(old.lastMessageAt))byId.set(row.id,row);}
  return [...byId.values()].sort((a,b)=>Date.parse(b.lastMessageAt)-Date.parse(a.lastMessageAt));
}
