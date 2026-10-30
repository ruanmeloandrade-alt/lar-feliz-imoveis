type Client={from:(table:string)=>any};
/** Reuse only a source from the authenticated Vanessa Simoni workspace. Never create a source while adding a supplier. */
export async function resolveSlimCompanySource(sb:Client,ws:string):Promise<string|null>{
  if(!ws)throw new Error('Operação Vanessa Simoni não identificada.');
  const {data,error}=await sb.from('crm_sources').select('id,workspace_id,provider,is_default,created_at').eq('workspace_id',ws).order('is_default',{ascending:false}).order('created_at',{ascending:true});
  if(error)throw new Error('Não foi possível consultar a origem da operação Vanessa Simoni. O fornecedor não foi salvo.');
  if(!Array.isArray(data))throw new Error('Resposta inválida ao consultar a origem Vanessa Simoni.');
  const local=data.filter(s=>s.workspace_id===ws&&['manual','saude_slim','mkton'].includes(s.provider));
  const selected=local.find(s=>s.is_default&&s.provider==='manual')??local.find(s=>s.is_default)??local.find(s=>s.provider==='manual')??local[0];
  // companies.crm_source_id is nullable. A supplier does not need an external CRM integration.
  return selected?.id??null;
}
