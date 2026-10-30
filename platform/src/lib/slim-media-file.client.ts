export function readSlimMediaFile(file:File):Promise<string>{
 if(!Number.isSafeInteger(file.size)||file.size<1||file.size>16*1024*1024)return Promise.reject(new Error('Selecione um arquivo de até 16 MB.'));
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();let settled=false;
  const finish=(error?:Error,value?:string)=>{if(settled)return;settled=true;clearTimeout(timer);reader.onload=null;reader.onerror=null;reader.onabort=null;error?reject(error):resolve(value!);};
  const timer=setTimeout(()=>{finish(new Error('Não foi possível ler o arquivo a tempo. Nenhum envio foi iniciado.'));reader.abort();},15_000);
  reader.onload=()=>{const value=typeof reader.result==='string'?reader.result:'';const comma=value.indexOf(',');if(comma<0||!value.slice(0,comma).endsWith(';base64'))return finish(new Error('Arquivo não reconhecido.'));finish(undefined,value.slice(comma+1));};
  reader.onerror=()=>finish(new Error('Falha ao ler o arquivo. Nenhum envio foi iniciado.'));
  reader.onabort=()=>finish(new Error('Leitura cancelada. Nenhum envio foi iniciado.'));
  try{reader.readAsDataURL(file);}catch{finish(new Error('Não foi possível preparar o arquivo.'));}
 });
}
/** Release the composer on an unresponsive request, without retrying it. */
export async function sendSlimMediaOnce<T>(send:(signal:AbortSignal)=>Promise<T>,ms=90_000):Promise<T>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([send(controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('O envio não foi confirmado a tempo. Confira o WhatsApp antes de reenviar; o arquivo pode ter sido recebido.'));},ms);})]);}
 finally{if(timer)clearTimeout(timer);}
}
