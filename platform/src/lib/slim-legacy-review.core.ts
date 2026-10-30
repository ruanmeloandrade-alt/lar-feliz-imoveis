/** Read-only validation of the original sale. It never changes prices, clients or stock. */
export type LegacyItem={linkId:string;productId:string;productName:string|null;quantity:number|string;unitPrice:number|string|null;stock:number|null;soldAt:string|null;active:boolean|null};
export type LegacySource={leadId:string;workspaceId:string;name:string;status:string;mergedIntoId:string|null;value:number|string|null;createdAt:string;items:LegacyItem[]};
export type LegacyReview={source:LegacySource;fingerprint:string;orderId?:string|null;number?:string|null;orderStatus?:string|null};
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function legacyCents(value:unknown):number{
 if(typeof value!=='string'&&typeof value!=='number')throw new Error('Valor original ausente.');
 const v=String(value);if(!/^\d+(?:\.\d{1,2})?$/.test(v))throw new Error('Valor original inválido.');
 const [whole,decimal='']=v.split('.');const n=BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'));
 if(n>99999999999999n)throw new Error('Valor original excede o limite.');return Number(n);
}
export function assessLegacyReview(row:LegacyReview,workspaceId:string,now=Date.now()){
 const s=row?.source;
 if(!s||s.workspaceId!==workspaceId||!UUID.test(s.leadId)||!/^[a-f0-9]{64}$/.test(row.fingerprint)||!Array.isArray(s.items))throw new Error('Resposta de conferência inválida. Nenhuma regularização liberada.');
 const problems:string[]=[];let valueCents:number|null=null;let itemCents=0n;const seen=new Set<string>();
 try{valueCents=legacyCents(s.value);}catch{problems.push('O valor original não está registrado corretamente.');}
 if(s.mergedIntoId||['lost','deleted','archived','merged'].includes(s.status))problems.push('Cliente/negociação mesclado, arquivado ou perdido exige revisão individual.');
 if(!s.items.length)problems.push('Não há produto vinculado. Não é possível inventar o item ou baixar estoque.');
 if(s.items.length>100)problems.push('Quantidade de itens acima do limite de conferência.');
 let canApplyStock=true;
 for(const item of s.items){
  const qty=Number(item.quantity);
  if(!UUID.test(item.productId)||seen.has(item.productId))problems.push('Produto inválido ou repetido.');seen.add(item.productId);
  if(!Number.isSafeInteger(qty)||qty<1||qty>999999){problems.push('Quantidade original inválida; frações não serão arredondadas.');continue;}
  try{itemCents+=BigInt(legacyCents(item.unitPrice))*BigInt(qty);}catch{problems.push('Preço original do item não registrado corretamente.');}
  if(!item.productName||!Number.isSafeInteger(item.stock)||item.stock!<0)problems.push('Produto ou saldo atual não disponível.');
  if(item.stock===null||item.stock<qty)canApplyStock=false;
  if(!item.soldAt||!Number.isFinite(Date.parse(item.soldAt))||Date.parse(item.soldAt)>now)problems.push('Data original da compra ausente ou inválida.');
 }
 if(itemCents>99999999999999n)problems.push('Total dos itens acima do limite.');
 if(s.items.length&&valueCents!==null&&itemCents!==BigInt(valueCents))problems.push('O valor do registro difere da soma dos itens. Confira individualmente.');
 if(!Number.isFinite(Date.parse(s.createdAt))||Date.parse(s.createdAt)>now)problems.push('Data de criação inválida.');
 return {row,valueCents,itemCents:itemCents<=99999999999999n?Number(itemCents):null,problems:[...new Set(problems)],canApplyStock,alreadyReconciled:Boolean(row.orderId),canReview:!row.orderId&&problems.length===0};
}
export const LEGACY_METHODS=[['pix','PIX'],['cash','Dinheiro'],['debit_card','Cartão de débito'],['credit_card','Cartão de crédito'],['bank_transfer','Transferência'],['boleto','Boleto'],['other','Outro']] as const;
export function validateLegacyApproval(method:string,status:string,installments:number,stockMode:string,approved:boolean){
 if(!approved)throw new Error('Confirme a revisão dos dados.');
 if(!LEGACY_METHODS.some(([key])=>key===method)||!['paid','pending'].includes(status))throw new Error('Informe forma e situação do pagamento.');
 if(!Number.isInteger(installments)||installments<1||installments>24||(method!=='credit_card'&&installments!==1))throw new Error('Parcelamento inválido.');
 if(!['apply_missing','already_accounted'].includes(stockMode))throw new Error('Informe a situação da baixa de estoque.');
 return {method,status,installments,stockMode,approved:true as const};
}
export function metricPurchasesIncludingErp(legacy:any[]|null,orders:any[]|null):Array<{id:string;lead_id:string;kind:string;sold_at:string}>|null{
 if(legacy===null||orders===null)return null;
 const linked=new Set<string>();const normalized=new Map<string,any>();
 for(const o of orders){
  if(!UUID.test(o.id)||!UUID.test(o.customer_id)||!['confirmed','cancelled'].includes(o.status)||!Number.isFinite(Date.parse(o.confirmed_at)))throw new Error('Pedido inválido na fonte de métricas.');
  if(o.legacy_lead_id){if(!UUID.test(o.legacy_lead_id))throw new Error('Referência histórica inválida.');linked.add(o.legacy_lead_id);}
  const id='erp:'+o.id;const prior=normalized.get(id);
  if(prior&&JSON.stringify(prior)!==JSON.stringify(o))throw new Error('Pedido duplicado com estados divergentes.');normalized.set(id,o);
 }
 const result=new Map<string,{id:string;lead_id:string;kind:string;sold_at:string}>();
 for(const p of legacy){if(linked.has(p.lead_id)||p.kind!=='comprou')continue;if(!UUID.test(p.id)||!UUID.test(p.lead_id)||!p.sold_at||!Number.isFinite(Date.parse(p.sold_at)))continue;const id='legacy:'+p.id;result.set(id,{id,lead_id:p.lead_id,kind:'comprou',sold_at:p.sold_at});}
 for(const [id,o]of normalized)if(o.status==='confirmed')result.set(id,{id,lead_id:o.customer_id,kind:'comprou',sold_at:o.confirmed_at});
 return [...result.values()];
}
