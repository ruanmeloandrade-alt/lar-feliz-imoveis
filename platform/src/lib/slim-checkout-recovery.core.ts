export type RecoveryIdentity = {workspaceId:string;requestId:string;actorId:string};
export type RecoveryResult = RecoveryIdentity & (
 | {state:'processing'}
 | {state:'closed'}
 | {state:'existing';orderId:string;number:string;status:'confirmed'|'cancelled';totalCents:number}
);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v);
export function validateCheckoutRecovery(raw:unknown,expected:RecoveryIdentity):RecoveryResult {
 const r=raw as Record<string,unknown>|null;
 for(const key of ['workspaceId','requestId','actorId'] as const){
  if(!uuid(expected[key])||!r||r[key]!==expected[key])throw new Error('Identificação da recuperação divergente. A referência foi preservada.');
 }
 if(r!.state==='closed'||r!.state==='processing')return {...expected,state:r!.state};
 if(r!.state==='existing'&&uuid(r!.orderId)&&typeof r!.number==='string'&&/^SL-\d{8,}$/.test(r!.number)&&(r!.status==='confirmed'||r!.status==='cancelled')&&Number.isSafeInteger(r!.totalCents)&&Number(r!.totalCents)>=0&&Number(r!.totalCents)<=99999999999999){
  return {...expected,state:'existing',orderId:r!.orderId,number:r!.number,status:r!.status,totalCents:Number(r!.totalCents)};
 }
 throw new Error('Resultado da recuperação não confirmado. Consulte novamente sem criar outra venda.');
}
export type RecoveryJournal={clear:(requestId:string)=>void;read:()=>{requestId:string}|null};
export async function finishCheckoutRecovery(args:{approved:boolean;expected:RecoveryIdentity;send:()=>Promise<unknown>;journal:RecoveryJournal}):Promise<RecoveryResult>{
 if(args.approved!==true)throw new Error('Confirme o encerramento da tentativa antes de continuar.');
 const result=validateCheckoutRecovery(await args.send(),args.expected);
 if(result.state!=='processing'){
  const current=args.journal.read();
  if(current&&current.requestId!==args.expected.requestId)throw new Error('Outra tentativa foi aberta. Recarregue sem repetir a venda.');
  args.journal.clear(args.expected.requestId);
  if(args.journal.read())throw new Error('Não foi possível limpar a referência local. O pedido não deve ser repetido.');
 }
 return result;
}
