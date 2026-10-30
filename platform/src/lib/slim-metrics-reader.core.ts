export async function readCompleteMetricRows(db:{from:(table:string)=>any},workspaceId:string,table:string,columns:string,configure:(q:any)=>any=(q)=>q,maxRows=200000):Promise<any[]>{
 if(!workspaceId)throw new Error('Empresa ativa não identificada.');
 const rows:any[]=[];let last:string|null=null;
 for(;;){let q=db.from(table).select(columns).eq('workspace_id',workspaceId).order('id',{ascending:true}).limit(500);if(last)q=q.gt('id',last);q=configure(q);
  let res;try{res=await q;}catch{throw new Error('Não foi possível consultar as métricas. Nenhum total parcial foi apresentado.');}
  if(res.error)throw Object.assign(new Error('Não foi possível consultar as métricas. Nenhum total parcial foi apresentado.'),{code:res.error.code});
  if(!Array.isArray(res.data))throw new Error('Resposta inválida nas métricas.');
  if(!res.data.length)return rows;
  for(const row of res.data){if(typeof row.id!=='string'||!row.id||(last&&row.id<=last))throw new Error('Paginação inconsistente nas métricas.');last=row.id;rows.push(row);}
  if(rows.length>maxRows)throw new Error('Métricas excederam o limite de leitura. Nenhum total truncado foi apresentado.');
 }
}
