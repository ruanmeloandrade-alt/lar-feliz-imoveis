/** Read-only stock projection. Monetary arithmetic stays in integer cents. */
export type StockProductRow = {id:string;workspace_id:string;catalog_id:string|null;name:string;sku:string|null;category:string|null;price:string|number;promo_price:string|number|null;stock:number;active:boolean;stock_known?:boolean;minimum_stock?:number|null};
export type StockCatalogRow = {id:string;workspace_id:string;name:string};
export type StockMovementRow = {id:string;workspace_id:string;order_id:string;product_id:string;kind:'sale'|'reversal';quantity:number;balance_after:number;created_at:string};
export type StockOrderRow = {id:string;workspace_id:string;snapshot:unknown};
export type StockDb = {from:(table:string)=>any};
export type StockProduct = {id:string;name:string;sku:string;category:string;catalogName:string;stock:number;active:boolean;priceCents:number;stockKnown?:boolean;minStock?:number|null};
export type StockMovement = {id:string;orderId:string;orderNumber:string;productId:string;productName:string;sku:string;kind:'sale'|'reversal';quantity:number;recordedOnly?:boolean;balanceBefore:number;balanceAfter:number;createdAt:string};
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
export function stockStatus(p:StockProduct):string{return !p.active?'Inativo':p.stockKnown===false?'Não informado':p.stock<0?'Saldo negativo':p.stock===0?'Sem estoque':p.stock<=(p.minStock??5)?'Baixo estoque':'Disponível';}
function id(s:unknown){if(!uuid(s))throw new Error('Identificador de estoque inválido.');return s;}
function int(n:unknown,min=0,max=Number.MAX_SAFE_INTEGER):number{if(typeof n!=='number'||!Number.isSafeInteger(n)||n<min||n>max)throw new Error('Quantidade ou saldo inválido.');return n;}
function money(n:unknown):number{
 const s=String(n);if((typeof n!=='string'&&typeof n!=='number')||!/^\d+(?:\.\d{1,2})?$/.test(s))throw new Error('Preço do estoque inválido.');
 const [a,b='']=s.split('.');const cents=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));
 if(cents>99999999999999n)throw new Error('Preço acima do limite.');return Number(cents);
}
export function formatStockCents(cents:number):string{int(cents,-Number.MAX_SAFE_INTEGER);const signed=BigInt(cents),n=signed<0n?-signed:signed;return `${signed<0n?'−':''}R$ ${String(n/100n).replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${String(n%100n).padStart(2,'0')}`;}
function scoped<T extends {id:string;workspace_id:string}>(rows:T[],workspaceId:string):T[]{
 id(workspaceId);if(!Array.isArray(rows))throw new Error('Resposta de estoque incompleta.');const seen=new Set<string>();
 for(const row of rows){if(!row||row.workspace_id!==workspaceId||seen.has(id(row.id)))throw new Error('Dados de estoque duplicados ou de outra empresa.');seen.add(row.id);}return rows;
}
export function buildStockCatalog(workspaceId:string,products:StockProductRow[],catalogs:StockCatalogRow[]){
 const byCatalog=new Map(scoped(catalogs,workspaceId).map(c=>[c.id,c.name]));
 const rows:StockProduct[]=scoped(products,workspaceId).map(p=>{
  if(typeof p.name!=='string'||!p.name.trim()||typeof p.active!=='boolean')throw new Error('Cadastro do produto inválido.');
  return {id:p.id,name:p.name,sku:p.sku??'',category:p.category??'',catalogName:byCatalog.get(p.catalog_id??'')??'Sem catálogo disponível',stock:int(p.stock,-2147483648,2147483647),active:p.active,priceCents:money(p.promo_price??p.price),stockKnown:p.stock_known!==false,minStock:p.minimum_stock==null?null:int(p.minimum_stock,0,2147483647)};
 }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||a.id.localeCompare(b.id));
 let units=0n,value=0n,active=0,low=0,out=0,unknown=0,negative=0;
 for(const p of rows)if(p.active){active++;if(!p.stockKnown){unknown++;continue;}units+=BigInt(p.stock);value+=BigInt(p.stock)*BigInt(p.priceCents);if(p.stock<0)negative++;if(p.stock<=0)out++;else if(p.stock<=(p.minStock??5))low++;}
 const limit=BigInt(Number.MAX_SAFE_INTEGER);
 if(units>limit||units< -limit||value>limit||value< -limit)throw new Error('Total de estoque excedeu o limite de cálculo seguro.');
 return {workspaceId,complete:true as const,products:rows,totals:{activeProducts:active,units:Number(units),valueCents:Number(value),lowStock:low,outOfStock:out,unknownStockProducts:unknown,negativeStockProducts:negative}};
}
const iso=(s:unknown):s is string=>typeof s==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));
export function buildStockMovements(workspaceId:string,movements:StockMovementRow[],orders:StockOrderRow[]){
 const byOrder=new Map(scoped(orders,workspaceId).map(o=>[o.id,o]));const duplicate=new Set<string>();
 const rows:StockMovement[]=scoped(movements,workspaceId).map(m=>{
  id(m.order_id);id(m.product_id);if(!['sale','reversal'].includes(m.kind)||!iso(m.created_at))throw new Error('Tipo ou data da movimentação inválidos.');
  const qty=int(m.quantity,1,2147483647),after=int(m.balance_after,0,2147483647),key=`${m.order_id}:${m.product_id}:${m.kind}`;
  if(duplicate.has(key))throw new Error('Movimentação duplicada por pedido e produto.');duplicate.add(key);
  const o=byOrder.get(m.order_id),s=o?.snapshot as any;
  if(!s||s.orderId!==m.order_id||s.workspaceId!==workspaceId||typeof s.number!=='string'||!s.number||!Array.isArray(s.items))throw new Error('Pedido de origem da movimentação indisponível.');
  const matches=s.items.filter((i:any)=>i.productId===m.product_id);
  if(matches.length!==1||matches[0].quantity!==qty||typeof matches[0].name!=='string'||!matches[0].name.trim())throw new Error('Item da movimentação diverge do pedido registrado.');
  const recordedOnly=m.kind==='sale'&&s.legacy?.stockMode==='already_accounted';
  const before=recordedOnly?after:m.kind==='sale'?after+qty:after-qty;int(before,0,2147483647);
  return {id:m.id,orderId:m.order_id,orderNumber:s.number,productId:m.product_id,productName:matches[0].name,sku:matches[0].sku??'',kind:m.kind,quantity:qty,...(recordedOnly?{recordedOnly:true}:{}),balanceBefore:before,balanceAfter:after,createdAt:m.created_at};
 }).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.id.localeCompare(b.id));
 return {workspaceId,complete:true as const,movements:rows};
}
export async function readStockRows(db:StockDb,workspaceId:string,table:string,columns:string){
 id(workspaceId);const rows:any[]=[];
 for(;;){const r=await db.from(table).select(columns).eq('workspace_id',workspaceId).order('id',{ascending:true}).range(rows.length,rows.length+499);
  if(r.error||!Array.isArray(r.data))throw new Error('Não foi possível consultar o estoque completo. Nenhum saldo parcial foi apresentado.');
  if(!r.data.length)return rows;rows.push(...r.data);if(rows.length>100000)throw new Error('Consulta de estoque excedeu 100 mil registros.');
 }
}
export function stockMatches(product:StockProduct,query:string):boolean{const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');const q=fold(query.trim());return !q||[product.name,product.sku,product.category,product.catalogName].some(s=>fold(s).includes(q));}

// SLIM_LEGACY_ACCEPTED_STOCK_V1
