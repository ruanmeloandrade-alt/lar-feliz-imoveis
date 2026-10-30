type Db={from:(table:string)=>any;rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:any;error:any}>};
type Enqueue=(db:Db,input:any)=>Promise<Array<{ok:boolean;error?:string;skipped?:boolean;queuedFor?:string}>>;
const MAX_ATTEMPTS=5;
const BATCH_SIZE=4;
const LEASE_MS=120000;

export async function dispatchSlimStageMove(db:Db,event:any,enqueue:Enqueue):Promise<'dispatched'|'skipped'>{
 const r=await db.from('leads').select('id,stage_id,pipeline_id,merged_into_id,status').eq('id',event.lead_id).eq('workspace_id',event.workspace_id).maybeSingle();
 if(r.error)throw new Error('Não foi possível conferir o cliente da movimentação.');
 const lead=r.data;
 if(!lead||lead.merged_into_id||['deleted','archived','merged'].includes(lead.status)||lead.stage_id!==event.to_stage_id||lead.pipeline_id!==event.pipeline_id)return 'skipped';
 // Keep the original event identity when a lease is recovered. Creating a lead
 // differs from moving it only in trigger matching, never in delivery retries.
 const results=await enqueue(db,{workspaceId:event.workspace_id,leadId:event.lead_id,pipelineId:event.pipeline_id,stageId:event.to_stage_id,fromStageId:event.from_stage_id,event:event.event_kind==='created'?'created':'moved',eventId:'slim-stage-move:'+event.id,deferExecution:true});
 if(!Array.isArray(results)||results.some(r=>!r.ok))throw new Error('O evento foi preservado, mas um dos gatilhos não pôde ser enfileirado.');
 return 'dispatched';
}

async function saveClaimResult(db:Db,event:any,patch:Record<string,unknown>):Promise<boolean>{
 const saved=await db.from('slim_stage_move_events').update(patch)
  .eq('id',event.id).eq('workspace_id',event.workspace_id)
  .eq('status','dispatching').eq('attempts',event.attempts)
  .select('id').maybeSingle();
 if(saved.error)throw new Error('Não foi possível confirmar o registro da movimentação.');
 // A lost lease is not a successful write. Its current owner keeps control.
 return saved.data?.id===event.id;
}

async function closeExhaustedLeases(db:Db,stale:string):Promise<void>{
 const expired=await db.from('slim_stage_move_events').select('id,workspace_id,attempts,started_at')
  .eq('status','dispatching').gte('attempts',MAX_ATTEMPTS).lt('started_at',stale)
  .order('started_at').limit(BATCH_SIZE);
 if(expired.error)throw new Error('Não foi possível conferir as tentativas interrompidas.');
 for(const event of expired.data??[]){
  const saved=await db.from('slim_stage_move_events').update({
   status:'error',finished_at:new Date().toISOString(),
   last_error:'A última tentativa de enfileiramento foi interrompida. Confira os gatilhos antes de repetir.',
  }).eq('id',event.id).eq('workspace_id',event.workspace_id)
   .eq('status','dispatching').eq('attempts',event.attempts).eq('started_at',event.started_at)
   .lt('started_at',stale).select('id').maybeSingle();
  if(saved.error)throw new Error('Não foi possível encerrar a tentativa interrompida.');
  // A zero-row CAS means another owner changed the event. Do not overwrite it
  // or reset it to pending: a job may already have performed its side effect.
 }
}

export async function processSlimStageMoveEvents(db:Db,enqueue:Enqueue):Promise<number>{
 const stale=new Date(Date.now()-LEASE_MS).toISOString();
 await closeExhaustedLeases(db,stale);
 const list=await db.from('slim_stage_move_events').select('id').or(`status.eq.pending,and(status.eq.dispatching,started_at.lt.${stale})`).lt('attempts',MAX_ATTEMPTS).order('created_at').limit(BATCH_SIZE);
 if(list.error)throw new Error('Fila de movimentações indisponível.');let processed=0;
 for(const item of list.data??[]){
  const claim=await db.rpc('slim_claim_stage_move',{_id:item.id});if(claim.error)throw new Error('Não foi possível reservar a movimentação.');const event=claim.data?.[0];if(!event)continue;
  let outcome:'dispatched'|'skipped';
  try{outcome=await dispatchSlimStageMove(db,event,enqueue);}
  catch{
   const exhausted=event.attempts>=MAX_ATTEMPTS;
   await saveClaimResult(db,event,{
    status:exhausted?'error':'pending',finished_at:exhausted?new Date().toISOString():null,
    last_error:'Enfileiramento não concluído. O evento foi preservado para conferência.',
   });
   continue;
  }
  // A failed acknowledgement keeps the lease for recovery. Only enqueueing is
  // retried with its stable dedupe key; no provider action runs in this worker.
  if(await saveClaimResult(db,event,{status:outcome,finished_at:new Date().toISOString(),last_error:null}))processed++;
 }
 return processed;
}
