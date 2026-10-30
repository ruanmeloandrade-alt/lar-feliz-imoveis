/** The browser stores only an opaque attempt reference, not customer data or payment details. */
export type CheckoutAttemptRef={version:1;workspaceId:string;actorId:string;requestId:string};
type Store={getItem:(k:string)=>string|null;setItem:(k:string,v:string)=>void;removeItem:(k:string)=>void};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v);
export function checkoutJournal(store:Store,workspaceId:string,actorId:string){
 if(!uuid(workspaceId)||!uuid(actorId))throw new Error('Sessão inválida para registrar a tentativa.');
 const key=`saude-slim:erp:pending:${workspaceId}:${actorId}`;
 function read():CheckoutAttemptRef|null{
  const raw=store.getItem(key);if(!raw)return null;
  const r=JSON.parse(raw);
  if(r?.version!==1||r.workspaceId!==workspaceId||r.actorId!==actorId||!uuid(r.requestId))throw new Error('Referência pendente inválida. Não finalize outro pedido antes de conferir o histórico.');
  return {version:1,workspaceId,actorId,requestId:r.requestId};
 }
 return {read,
  begin(requestId:string){if(!uuid(requestId))throw new Error('Referência inválida.');const old=read();if(old&&old.requestId!==requestId)throw new Error('Existe uma tentativa pendente. Consulte-a antes de finalizar outro pedido.');store.setItem(key,JSON.stringify({version:1,workspaceId,actorId,requestId}));if(read()?.requestId!==requestId)throw new Error('Não foi possível preservar a referência. Pedido não enviado.');},
  clear(requestId:string){if(read()?.requestId===requestId)store.removeItem(key);},
 };
}
