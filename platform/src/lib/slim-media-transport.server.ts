import { Buffer } from 'node:buffer';
export const SLIM_MEDIA_BYTES = 16 * 1024 * 1024;
export class MediaSendUncertain extends Error {
  constructor() { super('Envio não confirmado. A requisição pode ter chegado ao WhatsApp. Confira a conversa antes de reenviar.'); this.name='MediaSendUncertain'; }
}
export function decodeSlimMedia(base64: string): Buffer {
  if (typeof base64 !== 'string' || !base64.length || base64.length > 4*Math.ceil(SLIM_MEDIA_BYTES/3)
    || base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(base64) || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('Arquivo inválido ou acima do limite de 16 MB.');
  const bytes=Buffer.from(base64,'base64');
  if (!bytes.length || bytes.length>SLIM_MEDIA_BYTES || bytes.toString('base64')!==base64) throw new Error('Arquivo inválido ou incompleto.');
  return bytes;
}
/** Deadline includes reading the provider body; never retries a POST. */
export async function boundedMediaRequest(args: {url:string;apiKey:string;payload:Record<string,unknown>}, options: {fetcher?:typeof fetch;timeoutMs?:number;maxBodyBytes?:number}={}): Promise<{response:Response;body:unknown}> {
  const controller=new AbortController(),limit=options.maxBodyBytes??256*1024;
  let timer:ReturnType<typeof setTimeout>|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();void reader?.cancel().catch(()=>{});reject(new MediaSendUncertain());},options.timeoutMs??45_000);});
  const task=(async()=>{
    const response=await (options.fetcher??fetch)(args.url,{method:'POST',headers:{'Content-Type':'application/json',apikey:args.apiKey},body:JSON.stringify(args.payload),signal:controller.signal});
    if (Number(response.headers.get('content-length')??0)>limit) {void response.body?.cancel().catch(()=>{});throw new MediaSendUncertain();}
    let size=0;const chunks:Uint8Array[]=[];
    if(response.body){reader=response.body.getReader();for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){controller.abort();void reader.cancel().catch(()=>{});throw new MediaSendUncertain();}chunks.push(part.value);}}
    let body:unknown=null;try{body=JSON.parse(Buffer.concat(chunks,size).toString('utf8'));}catch{if(response.ok)throw new MediaSendUncertain();}
    return {response,body};
  })();
  try{return await Promise.race([task,timeout]);}
  catch {throw new MediaSendUncertain();}
  finally {if(timer)clearTimeout(timer);}
}
/** Used only before the send. A late upload may finish but cannot start delivery. */
export async function mediaPreparation<T>(task:PromiseLike<T>,label:string,ms=25_000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([Promise.resolve(task),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} demorou demais. Nenhuma requisição de envio ao WhatsApp foi iniciada nesta tentativa.`)),ms);})]);}
 finally{if(timer)clearTimeout(timer);}
}
