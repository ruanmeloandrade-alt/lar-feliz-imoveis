export type SlimDbBackoffState = { failures:number; retryAfter:number; lastWarningAt:number };
export function newSlimDbBackoffState():SlimDbBackoffState {return {failures:0,retryAfter:0,lastWarningAt:0};}
export function dbBackoffActive(state:SlimDbBackoffState,now=Date.now()):boolean{return now<state.retryAfter;}
export function isDbTransportError(input:unknown):boolean {
 const object=input&&typeof input==='object'?input as {message?:unknown;details?:unknown;code?:unknown;status?:unknown}:null;
 const value=[object?.message,object?.details,object?.code,object?.status,typeof input==='string'?input:null]
   .filter(v=>typeof v==='string'||typeof v==='number').join(' ');
 return /\b(?:502|503|504|522|57014|57P03|PGRST003|08006|08001|08003|08P01)\b|connection|connect(?:ion)? reset|socket|timeout|timed? out|canceling statement|failed to fetch|fetch failed|network error|ECONNRESET|ECONNREFUSED|ETIMEDOUT/i.test(value);
}
export function noteDbFailure(state:SlimDbBackoffState,error:unknown,now=Date.now()):boolean {
 if(!isDbTransportError(error))return false;
 state.failures=Math.min(8,state.failures+1);
 const delay=Math.min(300_000,5_000*2**(state.failures-1));
 state.retryAfter=Math.max(state.retryAfter,now+delay);
 return true;
}
export function noteDbSuccess(state:SlimDbBackoffState):boolean {
 if(!state.failures)return false;
 state.failures=0;state.retryAfter=0;state.lastWarningAt=0;
 return true;
}
const root=globalThis as typeof globalThis&{__slimDbWorkerBackoff?:SlimDbBackoffState};
export function sharedSlimDbBackoff():SlimDbBackoffState {
 return root.__slimDbWorkerBackoff??=newSlimDbBackoffState();
}
export function dbWorkerMayRun(now=Date.now()):boolean{return !dbBackoffActive(sharedSlimDbBackoff(),now);}
export function recordDbError(error:unknown):void {
 const state=sharedSlimDbBackoff(),now=Date.now();
 if(!noteDbFailure(state,error,now))return;
 if(state.lastWarningAt===0||now-state.lastWarningAt>=60_000) {
   state.lastWarningAt=now;
   console.warn('[Vanessa Simoni] Banco indisponível ou com timeout; verificações automáticas das filas temporariamente espaçadas, sem descartar tarefas.');
 }
}
export function recordDbRecovery():void {
 const state=sharedSlimDbBackoff();
 if(noteDbSuccess(state))console.info('[Vanessa Simoni] Consulta de fila voltou a responder; verificações retomadas.');
}
