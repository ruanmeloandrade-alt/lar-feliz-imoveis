import {SlimStockWorkspace} from "@/components/erp/SlimStockWorkspace";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Package, RefreshCw, Search, ShoppingCart, Truck, type LucideIcon } from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DbProduct } from "@/lib/products.functions";
import { listSaudeSlimCatalogs } from "@/lib/saude-slim-orders-client";
import { formatBRL } from "@/lib/crm-mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/crm/estoque")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Estoque · Vanessa Simoni" },
      { name: "description", content: "Controle de estoque real da Vanessa Simoni a partir dos produtos cadastrados." },
    ],
  }),
  component: EstoqueErpPage,
});

function EstoqueErpPage(){return <div className="flex min-h-[100dvh] w-full bg-muted/20 text-foreground md:h-screen md:overflow-hidden"><AppSidebar/><main className="min-w-0 flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-screen-2xl space-y-5 p-4 md:p-6"><SlimStockWorkspace/></div></main></div>;}

type StockProduct = DbProduct & { catalogName: string };

function EstoquePage() {
  const [query, setQuery] = useState("");

  const catalogsQuery = useQuery({
    queryKey: ["saude-slim", "estoque", "catalogs"],
    queryFn: listSaudeSlimCatalogs,
    retry: 1,
    staleTime: 30_000,
  });

  const products = useMemo<StockProduct[]>(
    () =>
      (catalogsQuery.data ?? []).flatMap((catalog) =>
        catalog.products.map((product) => ({ ...product, catalogName: catalog.name })),
      ),
    [catalogsQuery.data],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return products;
    return products.filter((product) =>
      [product.name, product.sku, product.category, product.catalogName]
        .some((value) => (value ?? "").toLocaleLowerCase("pt-BR").includes(needle)),
    );
  }, [products, query]);

  const activeProducts = products.filter((product) => product.active);
  const totalStock = activeProducts.reduce((sum, product) => sum + product.stock, 0);
  const lowStock = activeProducts.filter((product) => product.stock > 0 && product.stock <= 5);
  const outOfStock = activeProducts.filter((product) => product.stock <= 0);
  const stockValue = activeProducts.reduce((sum, product) => sum + product.stock * (product.promoPrice ?? product.price), 0);

  return (
    <div className="flex min-h-[100dvh] w-full bg-muted/20 text-foreground md:h-screen md:overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5 px-4 py-5 md:px-6">
          <header className="rounded-lg border border-border bg-background p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  <Package className="h-4 w-4" />
                  Estoque
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Controle de estoque</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Quantidade, preço e status saem dos produtos reais cadastrados. Se não houver cadastro, a tela mostra estado vazio e aponta para Produtos.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/crm/empresas"><Truck className="h-4 w-4" /> Fornecedores</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/crm/produtos"><ShoppingCart className="h-4 w-4" /> Abrir produtos</Link>
                </Button>
              </div>
            </div>
          </header>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StockMetric icon={Package} label="Produtos ativos" value={activeProducts.length.toLocaleString("pt-BR")} />
            <StockMetric icon={CheckCircle2} label="Estoque total" value={totalStock.toLocaleString("pt-BR")} />
            <StockMetric icon={AlertTriangle} label="Baixo estoque" value={lowStock.length.toLocaleString("pt-BR")} tone="warning" />
            <StockMetric icon={ShoppingCart} label="Valor em estoque" value={formatBRL(stockValue)} />
          </section>

          <section className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border bg-muted/25 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-semibold">Produtos em estoque</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {filtered.length.toLocaleString("pt-BR")} de {products.length.toLocaleString("pt-BR")} produto(s)
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative sm:w-[320px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto, SKU, categoria..." className="h-10 bg-background pl-9" />
                </div>
                <Button variant="ghost" size="sm" onClick={() => catalogsQuery.refetch()} disabled={catalogsQuery.isFetching}>
                  <RefreshCw className={cn("h-4 w-4", catalogsQuery.isFetching && "animate-spin")} /> Atualizar
                </Button>
              </div>
            </div>

            {catalogsQuery.error instanceof Error && (
              <div className="m-4 rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">{catalogsQuery.error.message}</div>
            )}

            {catalogsQuery.isLoading ? (
              <div className="px-4 py-16 text-center text-sm text-muted-foreground">Carregando estoque real...</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <Package className="mx-auto h-10 w-10 text-muted-foreground/35" />
                <p className="mt-3 text-sm font-semibold">{products.length === 0 ? "Nenhum produto cadastrado" : "Nenhum produto encontrado"}</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                  {products.length === 0
                    ? "Cadastre produtos para liberar quantidade, preço, baixo estoque e sem estoque."
                    : "Ajuste a busca para localizar outro produto."}
                </p>
                {products.length === 0 && (
                  <Button className="mt-4" size="sm" asChild>
                    <Link to="/crm/produtos"><ShoppingCart className="h-4 w-4" /> Cadastrar produto</Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[840px]">
                  <div className="grid grid-cols-[1.35fr_.75fr_.8fr_.7fr_.75fr_.8fr] gap-3 border-b border-border bg-muted/35 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Produto</span>
                    <span>Categoria</span>
                    <span>Catálogo</span>
                    <span className="text-right">Quantidade</span>
                    <span className="text-right">Preço</span>
                    <span>Status</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {filtered.map((product) => (
                      <li key={product.id} className="grid grid-cols-[1.35fr_.75fr_.8fr_.7fr_.75fr_.8fr] items-center gap-3 px-4 py-3 text-sm">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{product.name}</div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">{product.sku || "Sem SKU"}</div>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{product.category || "Sem categoria"}</div>
                        <div className="truncate text-xs text-muted-foreground">{product.catalogName}</div>
                        <div className="text-right font-semibold tabular-nums">{product.stock.toLocaleString("pt-BR")}</div>
                        <div className="text-right font-semibold tabular-nums">{formatBRL(product.promoPrice ?? product.price)}</div>
                        <div><StockBadge stock={product.stock} active={product.active} /></div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function StockMetric({ icon: Icon, label, value, tone = "default" }: { icon: LucideIcon; label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
        </div>
        <span className={cn("grid h-10 w-10 place-items-center rounded-lg", tone === "warning" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary")}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function StockBadge({ stock, active }: { stock: number; active: boolean }) {
  const label = !active ? "Inativo" : stock <= 0 ? "Sem estoque" : stock <= 5 ? "Baixo estoque" : "OK";
  const className = !active
    ? "border-slate-200 bg-slate-50 text-slate-600"
    : stock <= 0
      ? "border-red-200 bg-red-50 text-red-700"
      : stock <= 5
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return <span className={cn("inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold", className)}>{label}</span>;
}

// SLIM_STOCK_VISIBILITY_V1
