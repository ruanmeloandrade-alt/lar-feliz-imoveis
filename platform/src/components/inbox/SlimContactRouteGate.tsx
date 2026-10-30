import {useEffect,useState,type ReactNode} from 'react';
import {useNavigate} from '@tanstack/react-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {supabase} from '@/integrations/supabase/client';
import {resolveSlimInboxContact} from '@/lib/slim-contact-route.functions';
export function SlimContactRouteGate({leadId,children}:{leadId:string;children:ReactNode}){
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(leadId))return <>{children}</>;
 return <DirectContactGate key={leadId} leadId={leadId}>{children}</DirectContactGate>;
}
function DirectContactGate({leadId,children}:{leadId:string;children:ReactNode}){
 const navigate=useNavigate(),queryClient=useQueryClient(),resolve=useServerFn(resolveSlimInboxContact);const [epoch,setEpoch]=useState(0);
 useEffect(()=>{const {data}=supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'){queryClient.removeQueries({queryKey:['slim-contact-route']});setEpoch(e=>e+1);}});return()=>data.subscription.unsubscribe();},[queryClient]);
 const q=useQuery({queryKey:['slim-contact-route',leadId,epoch],queryFn:()=>resolve({data:{leadId}}),staleTime:0,gcTime:0,retry:1,refetchOnWindowFocus:true});
 useEffect(()=>{if(q.data?.leadId&&q.data.leadId!==leadId&&!q.error)void navigate({to:'/inbox/leads/$leadId',params:{leadId:q.data.leadId},replace:true});},[q.data,leadId,navigate,q.error]);
 if(q.error)return <div role="alert" className="p-6 text-sm"><p>Não foi possível conferir o contato. Nenhum cadastro foi criado.</p><button className="mt-3 rounded border px-3 py-2" onClick={()=>void q.refetch()}>Tentar novamente</button></div>;
 if(!q.data||q.data.leadId!==leadId)return <p role="status" className="p-6 text-sm text-muted-foreground">Abrindo a conversa original...</p>;
 return <div key={q.data.workspaceId+':'+q.data.actorId} className="contents">{children}</div>;
}
