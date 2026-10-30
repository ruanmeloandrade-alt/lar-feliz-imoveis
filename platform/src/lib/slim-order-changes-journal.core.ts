/** Persist only opaque change identifiers, independently from the new-order checkout journal. */
import {orderChangeIdentity,type OrderChangeIdentity,type OrderChangeOperation} from './slim-order-changes.core.ts';
import {orderUuid} from './slim-order-read.core.ts';
export type OrderChangeAttemptRef={version:1}&OrderChangeIdentity;
type Attempt={orderId:string;requestId:string;operation:OrderChangeOperation};
type Store={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void;removeItem:(key:string)=>void};
export function orderChangeJournal(store:Store,workspaceId:string,actorId:string){
 const ws=orderUuid(workspaceId,'Empresa'),actor=orderUuid(actorId,'Operador');
 const key=`saude-slim:erp:change-pending:${ws}:${actor}`;
 const identity=(attempt:Attempt)=>{
  const supplied=attempt as Partial<OrderChangeIdentity>;
  if((supplied.workspaceId!==undefined&&supplied.workspaceId!==ws)||(supplied.actorId!==undefined&&supplied.actorId!==actor))throw new Error('A referência pertence a outra empresa ou operador.');
  return orderChangeIdentity({...attempt,workspaceId:ws,actorId:actor});
 };
 const same=(a:Attempt,b:Attempt)=>a.orderId===b.orderId&&a.requestId===b.requestId&&a.operation===b.operation;
 function read():OrderChangeAttemptRef|null {
  const raw=store.getItem(key);if(raw===null)return null;
  const value=JSON.parse(raw),r=orderChangeIdentity(value);
  if(value.version!==1||r.workspaceId!==ws||r.actorId!==actor||Object.keys(value).some(key=>!['version','workspaceId','actorId','orderId','requestId','operation'].includes(key)))throw new Error('Referência de alteração inválida. Confira a tentativa antes de continuar.');
  return {version:1,...r};
 }
 return {read,
  begin(attempt:Attempt){
   const r=identity(attempt),old=read();
   if(old&&!same(old,r))throw new Error('Existe uma alteração pendente. Consulte-a antes de confirmar outra.');
   store.setItem(key,JSON.stringify({version:1,...r}));
   const saved=read();if(!saved||!same(saved,r))throw new Error('Não foi possível preservar a referência. Nenhuma alteração foi enviada.');
  },
  clear(attempt:Attempt){
   const r=identity(attempt),old=read();
   if(!old)return;
   if(!same(old,r))throw new Error('Outra alteração está pendente. Sua referência foi preservada.');
   store.removeItem(key);
   if(read())throw new Error('Não foi possível limpar a referência confirmada. Consulte a tentativa antes de continuar.');
  },
 };
}
