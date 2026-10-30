type Client={from:(name:string)=>any};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Uses the request's verified bearer client and its RLS, never a service-role client or a revoked legacy RPC. */
export async function assertSlimChatMembership(sb:Client,workspaceId:string,userId:string,now=Date.now()):Promise<void>{
 if(!UUID.test(workspaceId)||!UUID.test(userId))throw new Error('Sessão ou operação Vanessa Simoni inválida.');
 let workspace,member;
 try{
  [workspace,member]=await Promise.all([
   sb.from('workspaces').select('id,owner_id').eq('id',workspaceId).maybeSingle(),
   sb.from('workspace_members').select('workspace_id,user_id,access_expires_at').eq('workspace_id',workspaceId).eq('user_id',userId).maybeSingle(),
  ]);
 }catch{throw new Error('Não foi possível verificar o acesso à operação Vanessa Simoni.');}
 if(workspace.error||member.error)throw new Error('Não foi possível verificar o acesso à operação Vanessa Simoni.');
 if(workspace.data?.id!==workspaceId)throw new Error('Sem acesso à operação Vanessa Simoni.');
 if(workspace.data.owner_id===userId)return;
 const m=member.data;
 const active=m?.access_expires_at==null||Date.parse(m.access_expires_at)>now;
 if(!m||m.workspace_id!==workspaceId||m.user_id!==userId||!active)throw new Error('Sem acesso à operação Vanessa Simoni.');
}
