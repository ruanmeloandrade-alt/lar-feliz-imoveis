import {slimInvitationDeadline,slimInvitationIdentity,validateSlimInvitationListItem,type SlimInvitationIdentity,type SlimInvitationListItem} from '@/lib/slim-invitations.core';

export type SlimInvitationDatabase={from:(table:string)=>any;rpc:(name:string,args:Record<string,unknown>)=>any};
export const SLIM_INVITATION_LIST_COLUMNS='id,workspace_id,email,role_type,is_partner,access_role,access_days,status,expires_at,created_at,accepted_at';
const unavailable='Serviço de convites indisponível. Não foi possível confirmar o resultado.';

export function assertSlimInvitationSignal(signal:AbortSignal){if(signal.aborted)throw new Error('A consulta de convites excedeu o prazo. Consulte o resultado da mesma tentativa.');}
export async function withSlimInvitationRequest<T>(work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
 const controller=new AbortController();
 try{return await slimInvitationDeadline(()=>work(controller.signal),{timeoutMs:20000});}
 finally{controller.abort();}
}
async function query(query:any,signal:AbortSignal){assertSlimInvitationSignal(signal);const result=await query.retry(false).abortSignal(signal);assertSlimInvitationSignal(signal);return result;}

/** Read-only guard: never resolves a fallback company, cleans memberships, or updates a profile. */
export async function requireSlimInvitationOwner(sb:SlimInvitationDatabase,userId:string,expected:SlimInvitationIdentity,signal:AbortSignal):Promise<SlimInvitationIdentity>{
 const identity=slimInvitationIdentity(expected);
 if(userId!==identity.actorId)throw new Error('O usuário mudou. Atualize a página antes de gerenciar convites.');
 const [profile,workspace]=await Promise.all([
  query(sb.from('profiles').select('current_workspace_id').eq('id',identity.actorId).maybeSingle(),signal),
  query(sb.from('workspaces').select('id,owner_id').eq('id',identity.workspaceId).maybeSingle(),signal),
 ]);
 if(profile.error||workspace.error)throw new Error('Não foi possível conferir a empresa e o dono. Nenhuma alteração foi enviada.');
 if(profile.data?.current_workspace_id!==identity.workspaceId)throw new Error('A empresa ativa mudou. Atualize a página antes de gerenciar convites.');
 if(workspace.data?.id!==identity.workspaceId||workspace.data?.owner_id!==identity.actorId)throw new Error('Apenas o dono da Vanessa Simoni pode gerenciar convites.');
 return identity;
}

export async function readSlimInvitations(sb:SlimInvitationDatabase,workspaceId:string,signal:AbortSignal):Promise<SlimInvitationListItem[]>{
 const items:SlimInvitationListItem[]=[],seen=new Set<string>();
 // Stop only on an empty page; a configured PostgREST cap must not truncate the list silently.
 for(let offset=0;offset<10000;){
  const result=await query(sb.from('workspace_invitations').select(SLIM_INVITATION_LIST_COLUMNS).eq('workspace_id',workspaceId).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499),signal);
  if(result.error||!Array.isArray(result.data))throw new Error('Não foi possível carregar os convites. Atualize a lista antes de continuar.');
  if(!result.data.length)return items;
  for(const row of result.data){
   if(row.workspace_id!==workspaceId)throw new Error('A lista de convites pertence a outra empresa.');
   const item=validateSlimInvitationListItem({id:row.id,email:row.email,roleType:row.role_type,isPartner:row.is_partner,accessRole:row.access_role,accessDays:row.access_days,status:row.status,expiresAt:row.expires_at,createdAt:row.created_at,acceptedAt:row.accepted_at});
   if(seen.has(item.id))throw new Error('A lista de convites mudou durante a consulta. Atualize a lista.');
   seen.add(item.id);items.push(item);
  }
  offset+=result.data.length;
 }
 throw new Error('A lista de convites excedeu o limite de leitura. Nenhuma lista parcial foi apresentada.');
}

export async function slimInvitationRpc(sb:SlimInvitationDatabase,name:string,args:Record<string,unknown>,signal:AbortSignal,changing=false):Promise<unknown>{
 try{
  const result=await query(sb.rpc(name,args),signal);
  if(result.error||result.data==null)throw new Error(unavailable);
  return result.data;
 }catch{
  throw new Error(changing?'Não foi possível confirmar a operação do convite. Consulte o resultado da mesma tentativa antes de continuar.':unavailable);
 }
}
