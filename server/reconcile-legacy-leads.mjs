const workspace='2a0e0d29-4e23-47e6-bd9f-30aa8e15e698';
const origin='https://fnuhmypmhcwecziswbat.supabase.co';

// Runs before the new deployment becomes healthy, after the retained volume is
// mounted. Idempotent IDs close the window for forms received during the build.
export async function reconcileLegacyLeads(store){
  const rows=store.all('leads');if(!rows.length)return {checked:0,added:0};
  if(process.env.SUPABASE_URL!==origin)throw Error('Destino exclusivo obrigatório.');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)throw Error('Credencial de migração ausente.');
  const headers={apikey:key,...(!key.startsWith('sb_secret_')?{Authorization:`Bearer ${key}`}:{}) ,'Content-Type':'application/json'};
  const call=async(path,method='GET',body)=>{
    const result=await fetch(origin+'/rest/v1/'+path,{method,headers:{...headers,...(method==='POST'?{Prefer:'resolution=ignore-duplicates,return=minimal'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
    if(!result.ok)throw Error('Reconciliação interrompida: '+result.status);
    const text=await result.text();return text?JSON.parse(text):null;
  };
  const [existing,pipelines,forms]=await Promise.all([
    call('leads?select=id&workspace_id=eq.'+workspace),
    call('pipelines?select=id,crm_source_id&workspace_id=eq.'+workspace+'&order=position.asc&limit=1'),
    call('crm_forms?select=id,campos&workspace_id=eq.'+workspace+'&slug=eq.vanessa-pre-analise'),
  ]);
  const pipeline=pipelines[0],form=forms[0];if(!pipeline||!form)throw Error('Funil/formulário de destino ausente.');
  const stages=await call('pipeline_stages?select=id&workspace_id=eq.'+workspace+'&pipeline_id=eq.'+pipeline.id+'&order=position.asc&limit=1');
  if(!stages[0])throw Error('Etapa de destino ausente.');
  const known=new Set(existing.map(l=>l.id));const missing=rows.filter(l=>!known.has(l.id));
  if(missing.length)await call('leads?on_conflict=id','POST',missing.map(l=>({id:l.id,workspace_id:workspace,crm_source_id:pipeline.crm_source_id,pipeline_id:pipeline.id,stage_id:stages[0].id,name:l.nome,email:l.email??null,phone:l.whatsapp,phone_normalized:String(l.whatsapp??'').replace(/\D/g,''),value:0,status:'active',source:'site',custom_data:{vanessa_original:l},created_at:l.created_at})));
  await call('crm_form_submissions?on_conflict=id','POST',rows.map(l=>({id:l.id,workspace_id:workspace,form_id:form.id,lead_id:l.id,values:Object.fromEntries(Object.entries(l).filter(([k])=>!['id','created_at'].includes(k))),created_at:l.created_at})));
  const values=[];
  for(const lead of rows)for(const field of form.campos??[])if(field.customFieldId&&lead[field.id]!=null)values.push({workspace_id:workspace,lead_id:lead.id,field_id:field.customFieldId,value:{display:String(lead[field.id]),raw:[String(lead[field.id])],source:'form',form_id:form.id}});
  if(values.length)await call('lead_custom_field_values?on_conflict=lead_id,field_id','POST',values);
  return {checked:rows.length,added:missing.length};
}
