import { Buffer } from 'node:buffer';
import { decodeSlimMedia, SLIM_MEDIA_BYTES } from './slim-media-transport.server.ts';

export const SLIM_EVOLUTION_READ_DEADLINE_MS = 30_000;
export const SLIM_EVOLUTION_RESPONSE_MAX_BYTES = 4 * Math.ceil(SLIM_MEDIA_BYTES / 3) + 128 * 1024;

function extractProviderString(input: unknown, keys: string[]): string | null {
  const wanted = new Set(keys.map(key => key.toLowerCase()));
  const stack: Array<{value:unknown;depth:number}> = [{value:input,depth:0}];
  while (stack.length) {
    const item = stack.pop()!;
    if (!item.value || typeof item.value !== 'object' || item.depth>12) continue;
    for (const [key,value] of Object.entries(item.value as Record<string,unknown>)) {
      if (typeof value === 'string' && wanted.has(key.toLowerCase()) && value.trim()) return value.trim();
      if (value && typeof value === 'object') stack.push({value,depth:item.depth+1});
    }
  }
  return null;
}

export function safeRecoveredMediaType(value: unknown, fallback: string): {mimeType:string;extension:string} {
  let suggested = typeof value === 'string' ? value.toLowerCase().trim() : '';
  if (!/^(?:image|audio|video)\/[a-z0-9.+-]+(?:;\s*[a-z0-9-]+=[a-z0-9.+-]+)?$/.test(suggested) &&
      !/^application\/(?:pdf|octet-stream)$/.test(suggested)) {
    suggested=fallback;
  }
  if (!/^(?:image|audio|video)\/[a-z0-9.+-]+(?:;\s*[a-z0-9-]+=[a-z0-9.+-]+)?$/.test(suggested) &&
      !/^application\/(?:pdf|octet-stream)$/.test(suggested)) {
    suggested='application/octet-stream';
  }
  const main=suggested.split(';')[0];
  const byMime:Record<string,string>={
    'application/pdf':'pdf','application/octet-stream':'bin',
    'image/webp':'webp','image/jpeg':'jpg','image/png':'png','image/gif':'gif',
    'audio/ogg':'ogg','audio/mpeg':'mp3','audio/mp4':'m4a','audio/wav':'wav',
    'video/mp4':'mp4','video/webm':'webm'
  };
  return {mimeType:suggested,extension:byMime[main]??'bin'};
}

function fallbackMimeFromMessageType(messageType:string|null|undefined):string {
  const kind=String(messageType??'').toLowerCase();
  if(kind.includes('audio')||kind.includes('ptt'))return 'audio/ogg';
  if(kind.includes('video'))return 'video/mp4';
  if(kind.includes('document')||kind.includes('pdf'))return 'application/pdf';
  return 'image/webp';
}

export async function downloadRecoveredEvolutionMedia(args:{
  url:string; apiKey:string; key:Record<string,unknown>;
  declaredMimeType?:string|null; messageType?:string|null;
}, opts:{fetcher?:typeof fetch;timeoutMs?:number;maxResponseBytes?:number}={}):
  Promise<{bytes:Buffer;mimeType:string;extension:string}> {
  const max=opts.maxResponseBytes??SLIM_EVOLUTION_RESPONSE_MAX_BYTES;
  const controller=new AbortController();
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{
    controller.abort();
    void reader?.cancel().catch(()=>{});
    reject(new Error('A recuperação da mídia demorou demais. Tente novamente mais tarde.'));
  },opts.timeoutMs??SLIM_EVOLUTION_READ_DEADLINE_MS);});
  const task=(async()=>{
    const response=await (opts.fetcher??fetch)(args.url,{
      method:'POST',
      headers:{'Content-Type':'application/json',apikey:args.apiKey},
      body:JSON.stringify({message:{key:args.key},convertToMp4:false}),
      signal:controller.signal,
    });
    if(!response.ok)throw new Error('O WhatsApp não disponibilizou esse arquivo.');
    const estimated=Number(response.headers.get('content-length'));
    if(Number.isFinite(estimated)&&estimated>max)throw new Error('A mídia é maior que o limite de recuperação.');
    const chunks:Uint8Array[]=[];let size=0;
    if(!response.body)throw new Error('O WhatsApp não retornou o conteúdo do arquivo.');
    reader=response.body.getReader();
    for(;;) {
      const part=await reader.read();
      if(part.done)break;
      size+=part.value.byteLength;
      if(size>max){controller.abort();void reader.cancel().catch(()=>{});throw new Error('A mídia é maior que o limite de recuperação.');}
      chunks.push(part.value);
    }
    let json:unknown;
    try{json=JSON.parse(Buffer.concat(chunks,size).toString('utf8'));}
    catch{throw new Error('O arquivo retornado pelo WhatsApp está inválido.');}
    const raw=extractProviderString(json,['base64','mediaBase64']);
    if(!raw)throw new Error('O WhatsApp não retornou um arquivo recuperável.');
    let base64=raw.replace(/^data:[^,]+;base64,/i,'').replace(/\s/g,'');
    if(base64.length>4*Math.ceil(SLIM_MEDIA_BYTES/3)+4)throw new Error('Arquivo acima do limite de 16 MB.');
    if(base64.length%4===2||base64.length%4===3)base64+='='.repeat(4-base64.length%4);
    const bytes=decodeSlimMedia(base64);
    const mime=extractProviderString(json,['mimetype','mimeType'])??args.declaredMimeType;
    const safe=safeRecoveredMediaType(mime,fallbackMimeFromMessageType(args.messageType));
    return {...safe,bytes};
  })();
  try{return await Promise.race([task,timeout]);}
  catch(e){
    const msg=e instanceof Error?e.message:'';
    if(/limite de recuperação|limite de 16 MB|não disponibilizou|não retornou|inválido|demorou demais/i.test(msg))throw new Error(msg);
    throw new Error('Falha de conexão ao recuperar mídia do WhatsApp. Tente novamente mais tarde.');
  } finally {
    if(timer)clearTimeout(timer);
    controller.abort();
  }
}
