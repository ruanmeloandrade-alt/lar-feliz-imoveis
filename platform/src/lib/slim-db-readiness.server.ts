import {dbWorkerMayRun,recordDbError,recordDbRecovery} from './slim-db-worker-backoff.core.ts';

/** Only a cheap SELECT may verify DB readiness; never attempt to claim/send from the probe. */
export type SlimDbProbeState = {
  healthyUntil:number;
  retryAfter:number;
  failures:number;
  pending:Promise<boolean>|null;
};
export function newSlimDbProbeState():SlimDbProbeState {
  return {healthyUntil:0,retryAfter:0,failures:0,pending:null};
}
const globalRoot=globalThis as typeof globalThis&{__slimDbReadinessProbe?:SlimDbProbeState};
export function sharedSlimDbProbeState():SlimDbProbeState {
  return globalRoot.__slimDbReadinessProbe??=newSlimDbProbeState();
}
type DbRead={from:(name:string)=>any};

/**
 * Probe before activating any automatic queue worker. A failed or hanging DB
 * receives one bounded, shared, READ-ONLY request rather than competing
 * audience, Inbox and CRM job claims. Workers resume automatically on success.
 */
export async function probeSlimDbReadiness(
  db:DbRead,
  state:SlimDbProbeState=sharedSlimDbProbeState(),
  clock:()=>number=Date.now,
):Promise<boolean> {
  if(state.pending)return state.pending;
  const now=clock();
  if(!dbWorkerMayRun(now))return false;
  if(now<state.healthyUntil)return true;
  if(now<state.retryAfter)return false;

  const promise=(async():Promise<boolean>=>{
    try {
      const result=await db.from('workspaces')
        .select('id').limit(1).abortSignal(AbortSignal.timeout(3_500));
      if(!result||result.error)throw new Error('Consulta de disponibilidade do banco falhou.');
      state.failures=0;
      state.retryAfter=0;
      state.healthyUntil=clock()+15_000;
      recordDbRecovery();
      return true;
    } catch {
      state.healthyUntil=0;
      state.failures=Math.min(8,state.failures+1);
      state.retryAfter=clock()+Math.min(300_000,15_000*2**(state.failures-1));
      recordDbError('Database readiness probe connection timeout');
      return false;
    }
  })();
  state.pending=promise;
  try{return await promise;}
  finally {if(state.pending===promise)state.pending=null;}
}
export async function dbReadyForQueue(db:DbRead):Promise<boolean> {
  return probeSlimDbReadiness(db);
}
