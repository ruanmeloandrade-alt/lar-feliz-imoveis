export async function assertSlimOperator(sb:any,ws:string,userId:string){
 if(!ws||!userId)throw new Error('Sessão ou empresa não identificada.');
 const [wr,mr]=await Promise.all([
  sb.from('workspaces').select('owner_id').eq('id',ws).maybeSingle(),
  sb.from('workspace_members').select('role_type,access_expires_at').eq('workspace_id',ws).eq('user_id',userId).maybeSingle(),
 ]);
 if(wr.error||mr.error)throw new Error('Não foi possível verificar a permissão de automação.');
 if(wr.data?.owner_id===userId)return;
 const m=mr.data;
 if(!m||m.role_type==='visualizador'||(m.access_expires_at&&Date.parse(m.access_expires_at)<=Date.now()))throw new Error('Sem permissão para executar automações nesta empresa.');
}
