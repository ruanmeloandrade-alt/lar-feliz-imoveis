import {useMemo,useState} from 'react';
import {Link} from '@tanstack/react-router';
import {useServerFn} from '@tanstack/react-start';
import {useQuery} from '@tanstack/react-query';
import {getSlimErpIdentity} from '@/lib/slim-erp-release.functions';
import {getSlimStockCatalog,getSlimStockMovements} from '@/lib/slim-stock-view.functions';
import {formatStockCents,stockMatches,stockStatus,type StockMovement} from '@/lib/slim-stock-view.core';
import {erpReadableError} from '@/lib/slim-erp-release.core';
const field='rounded-md border border-input bg-background px-3 py-2 text-sm';
const when=(iso:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(iso));
export function SlimStockWorkspace(){
 const identify=useServerFn(getSlimErpIdentity);
 const identity=useQuery({queryKey:['slim-erp-identity'],queryFn:()=>identify(),retry:1,staleTime:0,refetchInterval:30000,refetchOnWindowFocus:true});
 if(identity.error||!identity.data)return <section className="rounded-xl border bg-card p-5"><h1 className="text-xl font-semibold">Controle de estoque</h1><p className="mt-3 text-sm" role={identity.error?'alert':'status'}>{identity.error?erpReadableError(identity.error):'Confirmando acesso à empresa ativa...'}</p>{identity.error&&<button type="button" className="mt-3 text-sm underline" onClick={()=>identity.refetch()}>Tentar novamente</button>}</section>;
 return <Stock key={`${identity.data.workspaceId}:${identity.data.actorId}`} workspaceId={identity.data.workspaceId} actorId={identity.data.actorId}/>;
}
function Stock({workspaceId,actorId}:{workspaceId:string;actorId:string}){
 const catalog=useServerFn(getSlimStockCatalog),movements=useServerFn(getSlimStockMovements);
 const stock=useQuery({queryKey:['slim-stock-catalog',workspaceId,actorId],queryFn:()=>catalog({data:{workspaceId}}),staleTime:0,retry:1,refetchInterval:15000,refetchOnWindowFocus:true});
 const ledger=useQuery({queryKey:['slim-stock-movements',workspaceId,actorId],queryFn:()=>movements({data:{workspaceId}}),staleTime:0,retry:1,refetchInterval:15000,refetchOnWindowFocus:true});
 const [search,setSearch]=useState(''),[page,setPage]=useState(1),[movementSearch,setMovementSearch]=useState(''),[kind,setKind]=useState('all'),[movementPage,setMovementPage]=useState(1);
 const data=!stock.error&&stock.data?.workspaceId===workspaceId?stock.data:null;
 const moves=!ledger.error&&ledger.data?.workspaceId===workspaceId?ledger.data:null;
 const products=useMemo(()=>data?.products.filter(p=>stockMatches(p,search))??[],[data,search]);
 const filteredMoves=useMemo(()=>{const text=movementSearch.trim().toLocaleLowerCase('pt-BR');return moves?.movements.filter(m=>(kind==='all'||m.kind===kind)&&(!text||[m.orderNumber,m.productName,m.sku].some(s=>s.toLocaleLowerCase('pt-BR').includes(text))))??[];},[moves,movementSearch,kind]);
 const pages=Math.max(1,Math.ceil(products.length/25)),current=Math.min(page,pages),mpages=Math.max(1,Math.ceil(filteredMoves.length/25)),mcurrent=Math.min(movementPage,mpages);
 const refresh=()=>Promise.all([stock.refetch(),ledger.refetch()]);
 const totals=data?.totals;
 return <div className="space-y-5">
  <header className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-5">
   <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Gestão ERP</p><h1 className="mt-2 text-2xl font-semibold">Controle de estoque</h1><p className="mt-2 text-sm text-muted-foreground">Saldo atual dos produtos e movimentações registradas pelos pedidos. Atualização a cada 15 segundos enquanto esta página estiver ativa.</p></div>
   <div className="flex flex-wrap gap-3 text-sm"><Link className={field} to="/crm/empresas">Fornecedores</Link><Link className={field} to="/crm/produtos">Abrir produtos</Link><button type="button" className={field} disabled={stock.isFetching||ledger.isFetching} onClick={()=>void refresh()}>{stock.isFetching||ledger.isFetching?'Atualizando...':'Atualizar estoque'}</button></div>
  </header>
  {stock.error?<p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{erpReadableError(stock.error)} Os totais não foram recalculados a partir dessa falha.</p>:!totals?<p role="status" className="p-4">Carregando o estoque completo...</p>:<>
   <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <Metric label="Produtos ativos" value={String(totals.activeProducts)}/><Metric label="Estoque total ativo" value={String(totals.units)}/><Metric label="Baixo estoque / sem estoque" value={`${totals.lowStock} / ${totals.outOfStock}`}/><Metric label="Valor de venda em estoque" value={formatStockCents(totals.valueCents)}/>
   </section>
   <p className="text-xs text-muted-foreground">Valorização pelo preço de venda vigente, considerando promoção quando cadastrada. Não é custo de aquisição nem receita realizada.</p>
   {(totals.unknownStockProducts>0||totals.negativeStockProducts>0)&&<p className="rounded-md border border-amber-500/40 p-3 text-sm">{totals.unknownStockProducts} produto(s) sem estoque informado e {totals.negativeStockProducts} com saldo negativo. Os totais consideram somente saldos conhecidos, incluindo os déficits informados.</p>}
   <section className="overflow-hidden rounded-lg border bg-card">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Produtos em estoque</h2><p className="text-xs text-muted-foreground">{products.length} de {data?.products.length} produtos · Ativos e inativos na listagem</p></div><label className="grid gap-1 text-xs">Buscar produto, SKU, catálogo ou categoria<input className={field} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label></div>
    {!products.length?<p className="p-6 text-sm">{data?.products.length?'Nenhum produto corresponde à busca.':'Nenhum produto cadastrado nesta empresa.'}</p>:<div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-muted/30 text-xs"><tr><th className="p-3">Produto / SKU</th><th className="p-3">Catálogo</th><th className="p-3 text-right">Quantidade</th><th className="p-3 text-right">Preço unitário</th><th className="p-3">Situação</th></tr></thead><tbody>{products.slice((current-1)*25,current*25).map(p=><tr className="border-t" key={p.id}><td className="p-3"><strong>{p.name}</strong><p className="text-xs text-muted-foreground">{p.sku||'Sem SKU'} · {p.category||'Sem categoria'}</p></td><td className="p-3">{p.catalogName}</td><td className="p-3 text-right tabular-nums">{p.stockKnown===false?'Não informado':p.stock.toLocaleString('pt-BR')}</td><td className="p-3 text-right tabular-nums">{formatStockCents(p.priceCents)}</td><td className="p-3"><span className={`rounded-md border px-2 py-1 text-xs ${!p.active||p.stockKnown===false?'text-muted-foreground':p.stock<=0?'text-destructive':p.stock<=(p.minStock??5)?'text-amber-700':'text-emerald-700'}`}>{stockStatus(p)}</span></td></tr>)}</tbody></table></div>}
    <Pager page={current} pages={pages} setPage={setPage}/>
   </section>
  </>}
  <section className="overflow-hidden rounded-lg border bg-card">
   <div className="space-y-3 border-b p-4"><div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">Movimentações por pedido</h2><Link className="text-sm underline" to="/saude-slim">Abrir Histórico de Vendas</Link></div><p className="text-xs text-muted-foreground">Saídas e estornos do ERP. O saldo da linha é o registrado naquele movimento, não o saldo atual. Edições manuais de estoque e vendas antigas ainda não regularizadas não são inventadas neste histórico.</p>
    <div className="flex flex-wrap gap-3"><label className="grid gap-1 text-xs">Pedido, produto ou SKU<input className={field} value={movementSearch} onChange={e=>{setMovementSearch(e.target.value);setMovementPage(1);}}/></label><label className="grid gap-1 text-xs">Tipo de movimento<select className={field} value={kind} onChange={e=>{setKind(e.target.value);setMovementPage(1);}}><option value="all">Saídas e estornos</option><option value="sale">Saídas por venda</option><option value="reversal">Estornos por cancelamento</option></select></label></div>
   </div>
   {ledger.error?<p role="alert" className="p-4 text-sm text-destructive">{erpReadableError(ledger.error)} Não foi possível confirmar o histórico de movimentações.</p>:!moves?<p role="status" className="p-4">Consultando as movimentações...</p>:!filteredMoves.length?<p className="p-6 text-sm">{moves.movements.length?'Nenhum movimento corresponde ao filtro.':'Nenhuma saída ou estorno de pedido registrado no ERP.'}</p>:<div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm text-left"><thead className="bg-muted/30 text-xs"><tr><th className="p-3">Data / pedido</th><th className="p-3">Produto na venda</th><th className="p-3">Tipo</th><th className="p-3 text-right">Quantidade</th><th className="p-3 text-right">Saldo anterior</th><th className="p-3 text-right">Saldo após</th></tr></thead><tbody>{filteredMoves.slice((mcurrent-1)*25,mcurrent*25).map(m=><MovementRow key={m.id} row={m}/>)}</tbody></table></div>}
   {moves&&<Pager page={mcurrent} pages={mpages} setPage={setMovementPage}/>}
  </section>
 </div>;
}
function MovementRow({row:m}:{row:StockMovement}){return <tr className="border-t"><td className="p-3"><strong>{m.orderNumber}</strong><p className="text-xs text-muted-foreground">{when(m.createdAt)} · Brasília</p></td><td className="p-3">{m.productName}<p className="text-xs text-muted-foreground">{m.sku||'Sem SKU'}</p></td><td className="p-3">{m.recordedOnly?'Registro histórico, sem nova baixa':m.kind==='sale'?'Saída por venda':'Estorno de cancelamento'}</td><td className="p-3 text-right tabular-nums">{m.recordedOnly?`0 (${m.quantity} unidades já contabilizadas)`: `${m.kind==='sale'?'−':'+'}${m.quantity}`}</td><td className="p-3 text-right tabular-nums">{m.balanceBefore}</td><td className="p-3 text-right tabular-nums">{m.balanceAfter}</td></tr>;}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums break-words">{value}</p></div>;}
function Pager({page,pages,setPage}:{page:number;pages:number;setPage:(n:number)=>void}){return <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-sm"><span>Página {page} de {pages}</span><div className="flex gap-2"><button type="button" className={field} disabled={page<=1} onClick={()=>setPage(page-1)}>Anterior</button><button type="button" className={field} disabled={page>=pages} onClick={()=>setPage(page+1)}>Próxima</button></div></div>;}

// SLIM_LEGACY_ACCEPTED_STOCK_V1
