import {useEffect,useRef,useState} from 'react';
import {Mic,FileText,Square,X,Send,Loader2} from 'lucide-react';
import {supabase} from '@/integrations/supabase/client';
import {assertInboxAudio,chooseRecordingMime,recordingExtension} from '@/lib/slim-inbox-ui.core';
type Props={workspaceId:string;actorId:string;disabled?:boolean;onAudio:(file:File)=>Promise<unknown>;onText:(text:string)=>void;onInteractionStateChange?:(state:{dirty:boolean;pending:boolean})=>void};
export function SlimInboxVoiceControls({workspaceId,actorId,disabled=false,onAudio,onText,onInteractionStateChange}:Props){
 const [mode,setMode]=useState<'audio'|'text'|null>(null),[starting,setStarting]=useState(false),[seconds,setSeconds]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<File|null>(null),[previewUrl,setPreviewUrl]=useState('');
 const recorder=useRef<MediaRecorder|null>(null),alive=useRef(true),cancelled=useRef(false),startLock=useRef(false),timer=useRef<ReturnType<typeof setInterval>|null>(null),abort=useRef<AbortController|null>(null),sendLock=useRef(false);
 useEffect(()=>{onInteractionStateChange?.({dirty:Boolean(starting||mode||preview),pending:busy});},[onInteractionStateChange,starting,mode,preview,busy]);
 function stopClock(){if(timer.current){clearInterval(timer.current);timer.current=null;}}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;cancelled.current=true;stopClock();abort.current?.abort();const rec=recorder.current;if(rec){rec.onstop=null;if(rec.state!=='inactive')rec.stop();rec.stream.getTracks().forEach(t=>t.stop());}};},[]);
 useEffect(()=>{if(!preview){setPreviewUrl('');return;}const url=URL.createObjectURL(preview);setPreviewUrl(url);return()=>URL.revokeObjectURL(url);},[preview]);
 async function transcribe(file:File){
  setBusy(true);setError('');const controller=new AbortController();abort.current=controller;
  try{
   const {data}=await supabase.auth.getSession();const session=data.session;
   if(!session||session.user.id!==actorId)throw new Error('A sessão mudou. Reabra a conversa.');
   const profile=await supabase.from('profiles').select('current_workspace_id').eq('id',actorId).maybeSingle();
   if(profile.error||profile.data?.current_workspace_id!==workspaceId)throw new Error('A empresa ativa mudou. Reabra a conversa.');
   if(!alive.current)return;
   const body=new FormData();body.append('file',file);
   const response=await fetch(`/api/social/transcribe-audio?workspaceId=${encodeURIComponent(workspaceId)}`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},body,signal:controller.signal});
   if(!response.ok)throw new Error(response.status===401||response.status===403?'Transcrição não autorizada. Confira a sessão e a integração de IA.':'Não foi possível transcrever. Confira a integração de IA da empresa. O áudio não foi enviado ao lead.');
   const result=await response.json();const text=typeof result?.text==='string'?result.text.trim():'';
   if(!text)throw new Error('Não foi identificada fala. Grave novamente.');
   if(alive.current)onText(text);
  }catch(e){if(alive.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Falha na transcrição.');}
  finally{if(alive.current)setBusy(false);}
 }
 async function start(next:'audio'|'text'){
  if(disabled||startLock.current||busy||mode||preview)return;
  startLock.current=true;setStarting(true);setError('');let stream:MediaStream|undefined;
  try{
   if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Gravação indisponível neste navegador. Use uma conexão HTTPS e permita o microfone.');
   stream=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!alive.current){stream.getTracks().forEach(t=>t.stop());return;}
   const mime=chooseRecordingMime(t=>MediaRecorder.isTypeSupported(t));
   const rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);const chunks:Blob[]=[];
   cancelled.current=false;recorder.current=rec;
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   rec.onerror=()=>{cancelled.current=true;stopClock();rec.stream.getTracks().forEach(t=>t.stop());if(alive.current){setMode(null);setError('A gravação falhou. Nenhum áudio foi enviado.');}};
   rec.onstop=()=>{
    stopClock();rec.stream.getTracks().forEach(t=>t.stop());if(!alive.current)return;setMode(null);
    if(cancelled.current)return;
    try{
     const type=rec.mimeType||mime;const blob=new Blob(chunks,{type});assertInboxAudio(blob.size,type);
     const file=new File([blob],`audio-${Date.now()}.${recordingExtension(type)}`,{type});
     if(next==='text')void transcribe(file);else setPreview(file);
    }catch(e){setError(e instanceof Error?e.message:'Gravação inválida.');}
   };
   rec.start(250);setMode(next);setSeconds(0);const began=Date.now();
   timer.current=setInterval(()=>{const elapsed=Math.floor((Date.now()-began)/1000);if(alive.current)setSeconds(elapsed);if(elapsed>=300&&rec.state==='recording')rec.stop();},1000);
  }catch(e){stream?.getTracks().forEach(t=>t.stop());if(alive.current)setError(e instanceof Error&&e.name==='NotAllowedError'?'Permita o microfone no navegador para gravar.':e instanceof Error?e.message:'Não foi possível acessar o microfone.');}
  finally{startLock.current=false;if(alive.current)setStarting(false);}
 }
 function stop(cancel=false){cancelled.current=cancel;const rec=recorder.current;if(rec&&rec.state!=='inactive')rec.stop();}
 async function send(){if(!preview||busy||disabled||sendLock.current)return;sendLock.current=true;setBusy(true);setError('');try{await onAudio(preview);if(alive.current)setPreview(null);}catch(e){if(alive.current)setError(e instanceof Error?e.message:'O envio não foi confirmado. Confira a conversa antes de reenviar.');}finally{sendLock.current=false;if(alive.current)setBusy(false);}}
 const button='inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40';
 return <div className="relative flex shrink-0 items-center gap-1" data-slim-voice-controls>
  <button type="button" className={button} aria-label={mode==='audio'?'Parar e revisar áudio':'Gravar áudio'} title="Gravar áudio para enviar" disabled={disabled||starting||busy||mode==='text'||Boolean(preview)} onClick={()=>mode==='audio'?stop():void start('audio')}>{mode==='audio'?<Square className="h-4 w-4 text-red-500"/>:<Mic className="h-4 w-4"/>}</button>
  <button type="button" className={button} aria-label={mode==='text'?'Parar e transcrever':'Transcrever minha fala'} title="Ditado: transformar fala em texto sem enviar áudio" disabled={disabled||starting||busy||mode==='audio'||Boolean(preview)} onClick={()=>mode==='text'?stop():void start('text')}>{mode==='text'?<Square className="h-4 w-4 text-red-500"/>:busy&&!preview?<Loader2 className="h-4 w-4 animate-spin"/>:<FileText className="h-4 w-4"/>}</button>
  {(mode||starting||preview||error||busy)&&<div className="absolute bottom-full right-0 z-50 mb-3 w-[min(340px,calc(100vw-24px))] space-y-3 rounded-xl border bg-card p-4 text-foreground shadow-xl">
   {starting&&<p role="status" className="text-sm">Aguardando permissão do microfone...</p>}
   {mode&&<div className="flex items-center justify-between gap-2"><p role="status" className="text-sm">{mode==='text'?'Ditando':'Gravando áudio'} · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</p><button type="button" onClick={()=>stop(true)} className="text-xs underline">Cancelar</button></div>}
   {mode&&<button type="button" className="w-full rounded-md border px-3 py-2 text-sm" onClick={()=>stop()}>{mode==='text'?'Parar e transcrever':'Parar e revisar'}</button>}
   {preview&&<><p className="text-xs text-muted-foreground">Revise antes de enviar. Nenhum áudio é enviado automaticamente.</p>{previewUrl&&<audio controls src={previewUrl} className="w-full"/>}<div className="flex justify-end gap-2"><button type="button" aria-label="Descartar gravação" disabled={busy} onClick={()=>{setPreview(null);setError('');}} className="rounded-md border px-3 py-2"><X className="h-4 w-4"/></button><button type="button" disabled={busy||disabled} onClick={()=>void send()} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}Enviar áudio</button></div></>}
   {busy&&!preview&&<p role="status" className="text-sm">Transcrevendo para o campo de mensagem...</p>}
   {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
   {error&&!mode&&!preview&&!busy&&<button type="button" className="text-xs underline" onClick={()=>setError('')}>Fechar</button>}
  </div>}
 </div>;
}
