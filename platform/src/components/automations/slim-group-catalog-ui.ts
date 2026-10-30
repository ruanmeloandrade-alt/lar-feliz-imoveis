import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {supabase} from '@/integrations/supabase/client';
import {listWorkspaceChannels} from '@/lib/channels.functions';
import {listWorkspaceGroups,listGroupSalesbots,syncSessionGroups} from '@/lib/whatsapp-groups.functions';

const uuid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
export type SlimGroupCatalogRow={id:string;workspace_id:string;session_id:string;group_jid:string;name:string|null;description:string|null;picture_url:string|null;participants_count:number;is_admin:boolean;active_bot_id:string|null;active_ai_agent_id:string|null;rules:Record<string,unknown>|null;last_synced_at:string|null};
export function slimGroupSyncMessage(value:unknown):string {
 const v=value as Record<string,unknown>;
 if(!v||!['evolution','history'].includes(String(v.provider))||!['synced','recovered','total'].every(k=>Number.isInteger(v[k])&&Number(v[k])>=0))throw new Error('A sincronização não foi confirmada. Consulte a lista antes de tentar novamente.');
 const warning=typeof v.warning==='string'?v.warning.trim():'';
 return v.provider==='history'?`${v.total} grupo(s) disponíveis pelo histórico. ${warning||'Não foi possível atualizar os metadados do WhatsApp agora.'}`:`${v.synced} grupo(s) atualizados pelo WhatsApp; ${v.recovered} recuperado(s) do histórico. ${v.total} disponíveis nesta sessão.${warning?` ${warning}`:''}`;
}
export async function slimGroupUiDeadline<T>(run:()=>Promise<T>,ms=35_000):Promise<T>{let timer:ReturnType<typeof setTimeout>;try{return await Promise.race([run(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('A consulta demorou além do esperado. Confira a lista antes de sincronizar novamente.')),ms);})]);}finally{clearTimeout(timer!);}}
export function useSlimGroupCatalog(){
 const qc=useQueryClient(),list=useServerFn(listWorkspaceGroups),botsFn=useServerFn(listGroupSalesbots),channelsFn=useServerFn(listWorkspaceChannels),syncFn=useServerFn(syncSessionGroups);
 const [selectedSessionId,setSelectedSessionId]=useState<string|null>(null),[syncing,setSyncing]=useState(false),[notice,setNotice]=useState(''),[syncError,setSyncError]=useState('');
 const flight=useRef(false),epoch=useRef(0),mounted=useRef(true);
 const scopeQ=useQuery({queryKey:['slim-group-catalog-scope'],retry:false,staleTime:0,queryFn:()=>slimGroupUiDeadline(async()=>{const u=await supabase.auth.getUser();if(u.error||!u.data.user)throw new Error('Não foi possível confirmar a conta da Central de Grupos.');const p=await supabase.from('profiles').select('current_workspace_id').eq('id',u.data.user.id).maybeSingle();if(p.error||!uuid.test(p.data?.current_workspace_id??''))throw new Error('Não foi possível confirmar a empresa da Central de Grupos.');return{workspaceId:p.data.current_workspace_id,actorId:u.data.user.id};},10_000)});
 const scope=scopeQ.isFetchedAfterMount&&!scopeQ.isError?scopeQ.data:null,workspaceId=scope?.workspaceId??null,scopeKey=scope?`${scope.workspaceId}:${scope.actorId}`:'';
 const currentScope=useRef(scopeKey);currentScope.current=scopeKey;
 useEffect(()=>{epoch.current++;flight.current=false;setSyncing(false);setNotice('');setSyncError('');setSelectedSessionId(null);},[scopeKey]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;}},[]);
 useEffect(()=>{if(!scope)return;const channel=supabase.channel(`slim-group-scope-${scope.actorId}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles',filter:`id=eq.${scope.actorId}`},()=>void qc.invalidateQueries({queryKey:['slim-group-catalog-scope']})).subscribe();return()=>{void supabase.removeChannel(channel)};},[scope?.actorId,qc]);
 const channels=useQuery({queryKey:['slim-group-channels',scopeKey],enabled:!!scope,retry:false,queryFn:()=>channelsFn()});
 const groupsQ=useQuery({queryKey:['ws-groups',workspaceId,selectedSessionId,scope?.actorId],enabled:!!scope,retry:false,queryFn:async()=>{const rows=await list({data:{workspaceId:workspaceId!,sessionId:selectedSessionId??undefined}});if(!Array.isArray(rows)||rows.some((r:any)=>!uuid.test(r.id)||r.workspace_id!==workspaceId||(selectedSessionId&&r.session_id!==selectedSessionId)))throw new Error('A lista de grupos não corresponde à empresa e sessão selecionadas.');return rows as SlimGroupCatalogRow[];}});
 const botsQ=useQuery({queryKey:['group-bots',workspaceId,scope?.actorId],enabled:!!scope,retry:false,queryFn:async()=>await botsFn({data:{workspaceId:workspaceId!}}) as Array<{id:string;nome:string;ativo:boolean}>});
 const refresh=()=>Promise.all([qc.invalidateQueries({queryKey:['ws-groups']}),qc.invalidateQueries({queryKey:['group-exact-schedule-groups']}),qc.invalidateQueries({queryKey:['group-exact-schedule-status']})]);
 async function sync(){if(flight.current||!workspaceId||!selectedSessionId)return;flight.current=true;setSyncing(true);setNotice('');setSyncError('');const version=epoch.current,key=scopeKey;const live=()=>mounted.current&&epoch.current===version&&currentScope.current===key;try{const result=await slimGroupUiDeadline(()=>syncFn({data:{workspaceId,sessionId:selectedSessionId}}));if(!live())return;setNotice(slimGroupSyncMessage(result));await refresh();}catch(error){if(live()){setSyncError(error instanceof Error?error.message:'Não foi possível sincronizar os grupos.');await refresh();}}finally{if(live()){flight.current=false;setSyncing(false);}}}
 return{scopeQ,scopeKey,workspaceId,selectedSessionId,setSelectedSessionId,channels,groupsQ,botsQ,sync,syncing,notice,syncError,refresh};
}
export function useSlimGroupRulesDraft<T extends Record<string,unknown>>(groups:Array<{id:string;rules:Record<string,unknown>|null}>,initialGroupId?:string){
 const [wanted,setWanted]=useState(initialGroupId??''),[,render]=useState(0),drafts=useRef(new Map<string,{base:string;value:T;previousServer?:string}>());
 useEffect(()=>{if(initialGroupId)setWanted(initialGroupId)},[initialGroupId]);
 const selectedGroupId=groups.some(g=>g.id===wanted)?wanted:groups[0]?.id??'',g=groups.find(g=>g.id===selectedGroupId);
 const incoming=JSON.stringify(g?.rules??{});let entry=drafts.current.get(selectedGroupId);
 if(entry?.previousServer!==undefined&&entry.previousServer!==incoming){entry={...entry,previousServer:undefined};drafts.current.set(selectedGroupId,entry);}
 if(!entry||(JSON.stringify(entry.value)===entry.base&&entry.previousServer!==incoming)){if(!entry||entry.base!==incoming){entry={base:incoming,value:structuredClone(g?.rules??{}) as T};drafts.current.set(selectedGroupId,entry);}}
 const local=entry!.value,dirty=JSON.stringify(local)!==entry!.base;
 const setLocal=(value:T)=>{drafts.current.set(selectedGroupId,{...entry!,value});render(v=>v+1)};
 const markSaved=(groupId:string,snapshot:T)=>{const old=drafts.current.get(groupId);if(old)drafts.current.set(groupId,{...old,base:JSON.stringify(snapshot),previousServer:JSON.stringify(groups.find(g=>g.id===groupId)?.rules??{})});render(v=>v+1)};
 return{selectedGroupId,setSelectedGroupId:setWanted,g,local,setLocal,dirty,markSaved};
}
