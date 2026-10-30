import {supabaseAdmin} from '@/integrations/supabase/client.server';
import {processSlimStageMoveEvents} from './slim-stage-move-worker.core';
const root=globalThis as typeof globalThis&{__slimStageMoveWork?:{busy:boolean;last:number}};
const state=root.__slimStageMoveWork??={busy:false,last:0};
export async function tickSlimStageMoveEvents(){
 if(state.busy||Date.now()-state.last<5000)return;state.busy=true;state.last=Date.now();
 try{const {enqueueLeadAutomationEvent}=await import('./stage-automation-engine.server');await processSlimStageMoveEvents(supabaseAdmin as any,enqueueLeadAutomationEvent);}
 catch{console.error('[Vanessa Simoni etapas] Enfileiramento não concluído; conferir fila de movimentações.');}
 finally{state.busy=false;}
}
