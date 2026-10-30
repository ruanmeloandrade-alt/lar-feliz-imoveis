import {vanessaPropertySchema} from "@/lib/vanessa-property";
import {VanessaPropertyFields} from "@/components/VanessaPropertyFields";
// SLIM_APPROVED_UI_COMMERCE_V1
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast as sonnerToast } from "sonner";
import type { DbCatalog } from "@/lib/products.functions";
import type { ProductDetails } from "@/lib/product-import-details";
import {
  fetchSlimProductCatalogs,
  saveSlimCatalog,
  removeSlimCatalog,
  saveSlimProduct,
  removeSlimProduct,
  importSlimProducts,
  renameSlimCategory,
} from "@/lib/saude-slim-products-client";

import { parseCatalogFile, CATALOG_TEMPLATE_CSV } from "@/lib/catalog-import";
import {
  Box,
  Plus,
  Search,

  Download,
  Upload,
  Pencil,
  Trash2,
  X,
  ImageIcon,
  ArrowLeft,
  Package,
  DollarSign,
  Percent,
  Layers,
  Copy,

  Eye,
  EyeOff,
} from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { formatSlimBRL as formatBRL, validateProductMoney } from "@/lib/slim-money.core";
import { cn } from "@/lib/utils";
import { buildCategoryStats, categoryKey, cleanCategoryLabel, type CategoryStats } from "@/lib/product-categories";


export const Route = createFileRoute("/crm/produtos")({
  head: () => ({
    meta: [
      { title: "Catálogos · CRM Vanessa Simoni" },
      {
        name: "description",
        content: "Crie catálogos, adicione produtos com SKU, valores, fotos e exporte para usar no CRM.",
      },
    ],
  }),
  component: CrmProdutosPage,
});

/* ============== Tipos ============== */

interface Product extends ProductDetails {
  id: string;
  sku: string;
  name: string;
  description: string;
  image: string;
  price: number;
  promoPrice?: number;
  stock: number;
  category: string;
  active: boolean;
}

interface Catalog {
  id: string;
  name: string;
  description: string;
  cover: string;
  products: Product[];
}

/* ============== Dados iniciais ============== */

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23f1f5f9'/><path d='M20 70 L40 50 L55 65 L80 35' stroke='%2394a3b8' stroke-width='3' fill='none' stroke-linecap='round'/><circle cx='35' cy='35' r='6' fill='%2394a3b8'/></svg>";

const INITIAL_CATALOGS: Catalog[] = [];

const EMPTY_PRODUCT: Product = {
  id: "",
  sku: "",
  name: "",
  description: "",
  image: PLACEHOLDER_IMG,
  price: 0,
  promoPrice: undefined,
  stock: 0,
  category: "",
  active: true,
};

/* ============== Página ============== */

function CrmProdutosPage() {
  const qc = useQueryClient();
  const loadCatalogsFn = fetchSlimProductCatalogs;
  const saveCatalogFn = saveSlimCatalog;
  const deleteCatalogFn = removeSlimCatalog;
  const saveProductFn = saveSlimProduct;
  const deleteProductFn = removeSlimProduct;
  const bulkFn = importSlimProducts;
  const renameCategoryFn = renameSlimCategory;


  const catalogsQ = useQuery({
    queryKey: ["product-catalogs"],
    queryFn: () => loadCatalogsFn(),
    staleTime: 15_000,
  });
  const catalogs = useMemo<Catalog[]>(
    () =>
      ((catalogsQ.data ?? []) as DbCatalog[]).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        cover: c.cover || PLACEHOLDER_IMG,
        products: c.products.map((p) => ({
          ...p,
          id: p.id,
          sku: p.sku,
          name: p.name,
          description: p.description,
          image: p.image || PLACEHOLDER_IMG,
          price: p.price,
          promoPrice: p.promoPrice,
          stock: p.stock,
          category: p.category,
          active: p.active,
        })),
      })),
    [catalogsQ.data],
  );
  const reload = () => qc.invalidateQueries({ queryKey: ["product-catalogs"] });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newCatalogOpen, setNewCatalogOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"catalogos" | "produtos" | "categorias">("catalogos");
  /** Filtro de categoria aplicado na lista de produtos (chave canônica). */
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const [configuringCatalog, setConfiguringCatalog] = useState<Catalog | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };
  const onError = (err: unknown) =>
    sonnerToast.error(err instanceof Error ? err.message : "Não consegui salvar. Tente de novo.");

  const selected = useMemo(
    () => catalogs.find((c) => c.id === selectedId) ?? null,
    [catalogs, selectedId],
  );

  const totalProducts = catalogs.reduce((s, c) => s + c.products.length, 0);
  const totalValue = catalogs.reduce(
    (s, c) => s + c.products.reduce((ss, p) => ss + (p.promoPrice ?? p.price), 0),
    0,
  );

  const allProducts = useMemo(
    () => catalogs.flatMap((c) => c.products.map((p) => ({ ...p, _catalogName: c.name, _catalogId: c.id }))),
    [catalogs],
  );

  /** Métricas agrupadas por categoria (mesma categoria = mesmo grupo). */
  const categoryStats = useMemo(
    () =>
      buildCategoryStats(
        allProducts.map((p) => ({
          category: p.category,
          price: p.price,
          promoPrice: p.promoPrice ?? null,
          stock: p.stock,
          active: p.active,
          catalogName: p._catalogName,
        })),
      ),
    [allProducts],
  );


  /* --- Catálogo CRUD (banco de dados, compartilhado com bots e agentes) --- */
  const createCatalog = async (name: string, description: string, cover: string) => {
    try {
      const res = await saveCatalogFn({ data: { name, description, cover: cover || "" } });
      await reload();
      setNewCatalogOpen(false);
      setSelectedId(res.id);
      showToast(`Catálogo "${name}" criado.`);
    } catch (e) {
      onError(e);
    }
  };

  const updateCatalog = async (id: string, patch: Partial<Catalog>) => {
    const current = catalogs.find((c) => c.id === id);
    if (!current) return;
    try {
      await saveCatalogFn({
        data: {
          id,
          name: patch.name ?? current.name,
          description: patch.description ?? current.description,
          cover: patch.cover ?? current.cover,
        },
      });
      await reload();
      showToast("Catálogo atualizado.");
    } catch (e) {
      onError(e);
    }
  };

  const deleteCatalog = async (id: string) => {
    try {
      await deleteCatalogFn({ data: { id } });
      await reload();
      if (selectedId === id) setSelectedId(null);
      showToast("Catálogo removido.");
    } catch (e) {
      onError(e);
    }
  };

  const exportCatalog = (c: Catalog) => {
    const csv = [
      ["sku", "nome", "descricao", "preco", "preco_promo", "estoque", "categoria", "status"].join(";"),
      ...c.products.map((p) =>
        [p.sku, p.name, p.description, p.price, p.promoPrice ?? "", p.stock, p.category, p.active ? "ativo" : "inativo"].join(";"),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${c.name.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Catálogo exportado em CSV.");
  };

  /* --- Importação de CSV / JSON (upload local, sem integração externa) --- */
  const openImportDialog = () => {
    setImportError(null);
    importInputRef.current?.click();
  };

  const baixarModeloCsv = () => {
    const blob = new Blob([CATALOG_TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo_catalogo_saude_slim.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const { products, skipped } = parseCatalogFile(file.name, text);
      const imported = products.map((p) => ({
        sku: p.sku,
        name: p.name,
        description: p.description,
        image: p.image || "",
        price: p.price,
        promoPrice: p.promoPrice ?? null,
        stock: p.stock,
        category: p.category,
        active: p.active,
      }));

      let targetId = selected?.id ?? null;
      let targetName = selected?.name ?? "";
      if (!targetId) {
        targetName = file.name.replace(/\.(csv|json)$/i, "").replace(/[_-]+/g, " ").trim() || "Catálogo importado";
        const created = await saveCatalogFn({
          data: { name: targetName, description: `Importado de ${file.name}`, cover: "" },
        });
        targetId = created.id;
      }

      await bulkFn({ data: { catalogId: targetId, products: imported } });
      await reload();
      setSelectedId(targetId);
      showToast(
        `${imported.length} produto(s) importado(s) para "${targetName}".` +
          (skipped > 0 ? ` ${skipped} linha(s) ignorada(s).` : ""),
      );
      setImportError(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Não consegui ler esse arquivo.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  /* --- Produto CRUD --- */
  const saveProduct = async (p: Product) => {
    if (!selected) return;
    try {
      await saveProductFn({
        data: {
          property: p.property,
          costPrice: p.costPrice,
          minStock: p.minStock,
          unit: p.unit,
          stockKnown: p.stockKnown,
          id: p.id || undefined,
          catalogId: selected.id,
          sku: p.sku,
          name: p.name,
          description: p.description,
          image: p.image === PLACEHOLDER_IMG ? "" : p.image,
          price: p.price,
          promoPrice: p.promoPrice ?? null,
          stock: p.stock,
          category: p.category,
          active: p.active,
        },
      });
      await reload();
      setEditingProduct(null);
      showToast(p.id ? "Produto atualizado." : "Produto adicionado.");
    } catch (e) {
      onError(e);
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      await deleteProductFn({ data: { id } });
      await reload();
      showToast("Produto removido.");
    } catch (e) {
      onError(e);
    }
  };

  /** Duplica um produto dentro do mesmo catálogo (nome e SKU com sufixo). */
  const duplicateProduct = async (p: Product & { _catalogId?: string }) => {
    const catalogId = p._catalogId ?? selected?.id;
    if (!catalogId) return;
    try {
      await saveProductFn({
        data: {
          catalogId,
          sku: p.sku ? `${p.sku}-COPIA` : "",
          name: `${p.name} (cópia)`,
          description: p.description,
          image: p.image === PLACEHOLDER_IMG ? "" : p.image,
          price: p.price,
          promoPrice: p.promoPrice ?? null,
          stock: p.stock,
          category: p.category,
          active: p.active,
        },
      });
      await reload();
      showToast(`"${p.name}" duplicado.`);
    } catch (e) {
      onError(e);
    }
  };

  /** Duplica o catálogo inteiro com todos os produtos dentro. */
  const duplicateCatalog = async (c: Catalog) => {
    try {
      const created = await saveCatalogFn({
        data: {
          name: `${c.name} (cópia)`,
          description: c.description,
          cover: c.cover || "",
        },
      });
      if (c.products.length > 0) {
        await bulkFn({
          data: {
            catalogId: created.id,
            products: c.products.map((p) => ({
              sku: p.sku,
              name: p.name,
              description: p.description,
              image: p.image === PLACEHOLDER_IMG ? "" : p.image,
              price: p.price,
              promoPrice: p.promoPrice ?? null,
              stock: p.stock,
              category: p.category,
              active: p.active,
            })),
          },
        });
      }
      await reload();
      showToast(`Catálogo duplicado com ${c.products.length} produto(s).`);
    } catch (e) {
      onError(e);
    }
  };


  /** Renomeia/funde uma categoria em todos os produtos do workspace. */
  const renameCategory = async (from: string, to: string) => {
    try {
      const res = await renameCategoryFn({ data: { from, to } });
      await reload();
      showToast(`${res.updated} produto(s) agora na categoria "${res.category}".`);
    } catch (e) {
      onError(e);
    }
  };

  const toggleActive = async (id: string) => {

    const target = allProducts.find((p) => p.id === id);
    if (!target) return;
    try {
      await saveProductFn({
        data: {
          id: target.id,
          catalogId: target._catalogId,
          sku: target.sku,
          name: target.name,
          description: target.description,
          image: target.image === PLACEHOLDER_IMG ? "" : target.image,
          price: target.price,
          promoPrice: target.promoPrice ?? null,
          stock: target.stock,
          category: target.category,
          active: !target.active,
        },
      });
      await reload();
    } catch (e) {
      onError(e);
    }
  };


  /* --- Render --- */
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 px-6 py-6">
          {/* Header */}
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {selected && (
                <button
                  onClick={() => setSelectedId(null)}
                  className="mt-1 grid h-8 w-8 place-items-center rounded-md border border-border bg-card hover:bg-muted"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div>
                <div className="text-[10px] font-semibold tracking-widest text-muted-foreground">
                  CRM · {selected ? "PRODUTOS DO CATÁLOGO" : "CATÁLOGOS"}
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  {selected ? selected.name : "Catálogos de produtos"}
                </h1>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  {selected
                    ? selected.description || "Adicione e organize os produtos deste catálogo."
                    : "Crie catálogos para organizar ofertas e vincule produtos ao CRM."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selected ? (
                <>
                  <button
                    onClick={() => exportCatalog(selected)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
                  >
                    <Download className="h-4 w-4" /> Exportar CSV
                  </button>
                  <button
                    onClick={openImportDialog}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
                  >
                    <Upload className="h-4 w-4" /> Importar CSV / JSON
                  </button>
                  <button
                    onClick={() => setEditingProduct({ ...EMPTY_PRODUCT })}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4" /> Adicionar produto
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={baixarModeloCsv}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
                    title="Baixe o modelo, preencha e importe"
                  >
                    <Download className="h-4 w-4" /> Modelo CSV
                  </button>
                  <button
                    onClick={openImportDialog}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
                  >
                    <Upload className="h-4 w-4" /> Importar CSV / JSON
                  </button>
                  <button
                    onClick={() => setNewCatalogOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4" /> Novo catálogo
                  </button>
                </>
              )}
            </div>
          </header>

          <input
            ref={importInputRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={(e) => handleImportFile(e.target.files?.[0] ?? null)}
          />

          {importError && (
            <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>{importError}</span>
              <button onClick={() => setImportError(null)} aria-label="Fechar aviso">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Visão geral (somente fora de um catálogo) */}
          {!selected && (
            <>
              <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat icon={Layers} label="Catálogos" value={String(catalogs.length)} />
                <Stat icon={Package} label="Produtos" value={String(totalProducts)} />
                <Stat icon={DollarSign} label="Valor somado" value={formatBRL(totalValue)} />
              </section>

              {/* Tabs */}
              <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-xs">
                <button
                  onClick={() => setTab("catalogos")}
                  className={cn(
                    "px-4 py-1.5 rounded-full transition-colors",
                    tab === "catalogos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Catálogos ({catalogs.length})
                </button>
                <button
                  onClick={() => setTab("produtos")}
                  className={cn(
                    "px-4 py-1.5 rounded-full transition-colors",
                    tab === "produtos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Produtos ({totalProducts})
                </button>
                <button
                  onClick={() => setTab("categorias")}
                  className={cn(
                    "px-4 py-1.5 rounded-full transition-colors",
                    tab === "categorias" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Categorias ({categoryStats.length})
                </button>
              </div>


              {tab === "catalogos" ? (
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {catalogs.map((c) => (
                    <CatalogCard
                      key={c.id}
                      catalog={c}
                      onOpen={() => setSelectedId(c.id)}
                      onExport={() => exportCatalog(c)}
                      onDuplicate={() => duplicateCatalog(c)}

                      onDelete={() => deleteCatalog(c.id)}
                      onConfigure={() => setConfiguringCatalog(c)}
                    />
                  ))}
                  <button
                    onClick={() => setNewCatalogOpen(true)}
                    className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Plus className="h-6 w-6" />
                    Criar novo catálogo
                  </button>
                </section>
              ) : tab === "categorias" ? (
                <CategoriesPanel
                  stats={categoryStats}
                  onOpen={(key) => {
                    setCategoryFilter(key);
                    setTab("produtos");
                  }}
                  onRename={renameCategory}
                />
              ) : (
                <section>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="relative w-full sm:w-96">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar produto, SKU ou categoria…"
                        className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {allProducts.length} produto(s) em {catalogs.length} catálogo(s)
                    </div>
                  </div>

                  {/* Filtro por categoria (vínculo real, não texto solto) */}
                  {categoryStats.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setCategoryFilter(null)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-[11px] transition-colors",
                          !categoryFilter
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Todas
                      </button>
                      {categoryStats.map((c) => (
                        <button
                          key={c.key}
                          onClick={() => setCategoryFilter(categoryFilter === c.key ? null : c.key)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-[11px] transition-colors",
                            categoryFilter === c.key
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {c.label} · {c.products}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
                    {allProducts
                      .filter((p) => {
                        if (categoryFilter) {
                          const k = categoryKey(cleanCategoryLabel(p.category) || "Sem categoria") || "__sem_categoria";
                          if (k !== categoryFilter) return false;
                        }
                        const q = query.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          p.name.toLowerCase().includes(q) ||
                          p.sku.toLowerCase().includes(q) ||
                          p.category.toLowerCase().includes(q) ||
                          p._catalogName.toLowerCase().includes(q)
                        );
                      })

                      .map((p) => (
                        <button
                          key={`${p._catalogId}-${p.id}`}
                          onClick={() => {
                            setSelectedId(p._catalogId);
                          }}
                          className="w-full grid grid-cols-[48px_1fr_auto] items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                        >
                          <img src={p.image} alt="" className="h-12 w-12 rounded-md object-cover border border-border" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold truncate">{p.name}</span>
                              <span className="text-[10px] font-mono uppercase text-muted-foreground">{p.sku}</span>
                              {!p.active && (
                                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">inativo</span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {p._catalogName} · {p.category || "sem categoria"}
                            </div>
                          </div>
                          <div className="text-right">
                            {p.promoPrice != null && p.promoPrice < p.price ? (
                              <>
                                <div className="text-[10px] line-through text-muted-foreground tabular-nums">{formatBRL(p.price)}</div>
                                <div className="text-sm font-semibold text-destructive tabular-nums">{formatBRL(p.promoPrice)}</div>
                              </>
                            ) : (
                              <div className="text-sm font-semibold tabular-nums">{formatBRL(p.price)}</div>
                            )}
                          </div>
                        </button>
                      ))}
                    {allProducts.length === 0 && (
                      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                        Nenhum produto cadastrado ainda.
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Catálogo aberto: lista de produtos */}
          {selected && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full sm:w-96">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar produto, SKU ou categoria…"
                    className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {selected.products.length} produto(s)
                </div>
              </div>

              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {selected.products
                  .filter((p) => {
                    const q = query.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      p.name.toLowerCase().includes(q) ||
                      p.sku.toLowerCase().includes(q) ||
                      p.category.toLowerCase().includes(q)
                    );
                  })
                  .map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      onEdit={() => setEditingProduct(p)}
                      onDuplicate={() => duplicateProduct(p)}

                      onDelete={() => deleteProduct(p.id)}
                      onToggle={() => toggleActive(p.id)}
                    />
                  ))}

                {selected.products.length === 0 && (
                  <div className="col-span-full rounded-2xl border-2 border-dashed border-border bg-muted/20 p-10 text-center">
                    <Package className="mx-auto h-8 w-8 text-muted-foreground" />
                    <div className="mt-3 text-sm font-semibold">Catálogo vazio</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Adicione o primeiro produto deste catálogo.
                    </p>
                    <button
                      onClick={() => setEditingProduct({ ...EMPTY_PRODUCT })}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      <Plus className="h-4 w-4" /> Adicionar produto
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-md bg-foreground px-4 py-2.5 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      {/* Modal novo catálogo */}
      {newCatalogOpen && (
        <NewCatalogDialog onClose={() => setNewCatalogOpen(false)} onCreate={createCatalog} />
      )}

      {/* Drawer/Modal editar/criar produto */}
      {editingProduct && (
        <ProductDialog
          product={editingProduct}
          categories={categoryStats.map((c) => c.label).filter((l) => l !== "Sem categoria")}
          onClose={() => setEditingProduct(null)}
          onSave={saveProduct}
        />
      )}


      {/* Configurações do catálogo */}
      {configuringCatalog && (
        <CatalogConfigDialog
          catalog={configuringCatalog}
          onClose={() => setConfiguringCatalog(null)}
          onSave={(patch) => {
            updateCatalog(configuringCatalog.id, patch);
            setConfiguringCatalog(null);
          }}
        />
      )}
    </div>
  );
}

/* ============== Sub-componentes ============== */

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Layers;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}

function CatalogCard({
  catalog,
  onOpen,
  onExport,
  onDuplicate,
  onDelete,
  onConfigure,
}: {
  catalog: Catalog;
  onOpen: () => void;
  onExport: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onConfigure: () => void;
}) {

  const total = catalog.products.reduce((s, p) => s + (p.promoPrice ?? p.price), 0);
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="relative h-28 overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-card">
          <img src={catalog.cover} alt="" className="h-full w-full object-cover opacity-80" />
          <div className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold tabular-nums">
            {catalog.products.length} produtos
          </div>
        </div>
        <div className="p-4">
          <div className="text-sm font-semibold">{catalog.name}</div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{catalog.description}</p>
          <div className="mt-3 text-xs">
            <span className="text-muted-foreground">Valor somado: </span>
            <span className="font-semibold tabular-nums">{formatBRL(total)}</span>
          </div>
        </div>
      </button>
      <div className="flex items-center justify-end gap-1 border-t border-border bg-muted/20 px-3 py-2">
        <button
          onClick={onConfigure}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-3 w-3" /> Configurações
        </button>
        <button
          onClick={onExport}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Download className="h-3 w-3" /> Exportar
        </button>
        <button
          onClick={onDuplicate}
          title="Duplicar catálogo com todos os produtos"
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Copy className="h-3 w-3" /> Duplicar
        </button>

        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3 w-3" /> Remover
        </button>
      </div>
    </div>
  );
}

function ProductCard({
  product,
  onEdit,
  onDuplicate,
  onDelete,
  onToggle,
}: {
  product: Product;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {

  const hasPromo = product.promoPrice && product.promoPrice < product.price;
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card transition-colors",
        product.active ? "border-border hover:border-primary/40" : "border-dashed border-border opacity-70",
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
        {hasPromo && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground">
            <Percent className="h-2.5 w-2.5" />
            PROMO
          </span>
        )}
        {!product.active && (
          <span className="absolute right-2 top-2 rounded-full bg-foreground/80 px-2 py-0.5 text-[10px] font-semibold text-background">
            Inativo
          </span>
        )}
      </div>
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {product.sku || "SEM SKU"}
          </span>
          <span className="text-[10px] tracking-widest text-muted-foreground">
            {product.category}
          </span>
        </div>
        <h3 className="mt-1 text-sm font-semibold leading-tight">{product.name}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>

        <div className="mt-3 flex items-end justify-between">
          <div>
            {hasPromo ? (
              <>
                <div className="text-[11px] text-muted-foreground line-through tabular-nums">
                  {formatBRL(product.price)}
                </div>
                <div className="text-base font-semibold tabular-nums text-destructive">
                  {formatBRL(product.promoPrice!)}
                </div>
              </>
            ) : (
              <div className="text-base font-semibold tabular-nums">{formatBRL(product.price)}</div>
            )}
          </div>

        </div>
      </div>
      <div className="flex items-center justify-end gap-1 border-t border-border bg-muted/20 px-2.5 py-1.5">
        <button
          onClick={onToggle}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          title={product.active ? "Desativar" : "Ativar"}
        >
          {product.active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        </button>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-3 w-3" /> Editar
        </button>
        <button
          onClick={onDuplicate}
          title="Duplicar produto"
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Copy className="h-3 w-3" /> Duplicar
        </button>

        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/* ---- Dialogs ---- */

function NewCatalogDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, description: string, cover: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState("");

  const handleCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCover(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div
      data-slim-layer="modal" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold tracking-widest text-muted-foreground">
              NOVO CATÁLOGO
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Criar catálogo</h2>
          </div>
          <button
            className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Capa do catálogo</div>
            <label className="relative block h-32 w-full overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 cursor-pointer hover:border-primary/50">
              {cover ? (
                <img src={cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center text-xs text-muted-foreground">
                  <ImageIcon className="mb-1 h-5 w-5" />
                  Clique para enviar uma imagem
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleCover} />
            </label>
          </div>
          <label className="block text-xs font-medium text-muted-foreground">
            Nome
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Catálogo Black Friday"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Descrição
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Para que serve este catálogo?"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
          <button
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim(), description.trim(), cover)}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Criar catálogo
          </button>
        </div>
      </div>
    </div>
  );
}


/** Métricas de estoque/serviço agrupadas por categoria vinculada. */
function CategoriesPanel({
  stats,
  onOpen,
  onRename,
}: {
  stats: CategoryStats[];
  onOpen: (key: string) => void;
  onRename: (from: string, to: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (stats.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
        Nenhuma categoria ainda. Ao cadastrar produtos, as categorias com o mesmo nome são
        vinculadas automaticamente.
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((c) => (
        <div key={c.key} className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            {editing === c.key ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void onRename(c.label, draft);
                    setEditing(null);
                  }
                  if (e.key === "Escape") setEditing(null);
                }}
                onBlur={() => {
                  if (draft.trim() && draft.trim() !== c.label) void onRename(c.label, draft);
                  setEditing(null);
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            ) : (
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">{c.label}</h3>
                <p className="truncate text-[11px] text-muted-foreground">
                  {c.catalogs.length} catálogo(s)
                </p>
              </div>
            )}
            <button
              onClick={() => {
                setDraft(c.label);
                setEditing(c.key);
              }}
              title="Renomear / fundir categoria"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <MiniStat label="Produtos" value={String(c.products)} />
            <MiniStat label="Ativos" value={`${c.active}/${c.products}`} />
            <MiniStat label="Ticket médio" value={formatBRL(c.avgPrice)} />
          </div>

          <button
            onClick={() => onOpen(c.key)}
            className="mt-3 w-full rounded-md border border-border py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            Ver produtos desta categoria
          </button>
        </div>
      ))}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** Campo de categoria com sugestões — evita duplicar a mesma categoria. */
function CategoryPicker({

  value,
  categories,
  onChange,
}: {
  value: string;
  categories: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const key = categoryKey(value);
  const matched = categories.find((c) => categoryKey(c) === key) ?? null;
  const suggestions = categories
    .filter((c) => !value.trim() || categoryKey(c).includes(key))
    .slice(0, 8);

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 120);
          // Se bate com uma categoria existente, grava exatamente a grafia dela.
          if (matched && matched !== value) onChange(matched);
          else onChange(cleanCategoryLabel(value));
        }}
        placeholder="CRM, Implantação…"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
      />
      {open && (suggestions.length > 0 || (!!value.trim() && !matched)) && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          {suggestions.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span>{c}</span>
              {categoryKey(c) === key && <span className="text-[10px] text-primary">vinculada</span>}
            </button>
          ))}
          {!!value.trim() && !matched && (
            <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              Nova categoria: <span className="font-semibold text-foreground">{cleanCategoryLabel(value)}</span>
            </div>
          )}
        </div>
      )}
      {matched && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Vinculado à categoria existente “{matched}”.
        </p>
      )}
    </div>
  );
}

function ProductDialog({
  product,
  categories,
  onClose,
  onSave,
}: {
  product: Product;
  categories: string[];
  onClose: () => void;
  onSave: (p: Product) => void | Promise<void>;
}) {

  const [form, setForm] = useState<Product>({...product,property:product.property??vanessaPropertySchema.parse({})});
  const [priceDraft,setPriceDraft]=useState(String(product.price).replace(".",","));
  const [promoDraft,setPromoDraft]=useState(product.promoPrice==null?"":String(product.promoPrice).replace(".",","));
  const money=useMemo(()=>validateProductMoney(priceDraft,promoDraft),[priceDraft,promoDraft]);
  const [saving,setSaving]=useState(false);
  const [mediaBusy,setMediaBusy]=useState(false);
  async function saveValidated(){if(saving||mediaBusy||money.error)return;setSaving(true);try{await onSave({...form,price:money.price,promoPrice:money.promoPrice});}finally{setSaving(false);}}
  const update = <K extends keyof Product>(k: K, v: Product[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update("image", String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div
      data-slim-layer="modal" className="fixed inset-0 z-50 flex items-stretch justify-end bg-foreground/20"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-border bg-popover text-popover-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <div className="text-[10px] font-semibold tracking-widest text-muted-foreground">
              {product.id ? "EDITAR PRODUTO" : "NOVO PRODUTO"}
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">
              {form.name || "Sem nome"}
            </h2>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Imagem */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Foto do produto
            </label>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-24 w-24 overflow-hidden rounded-lg border border-border bg-muted">
                <img src={form.image} alt="" className="h-full w-full object-cover" />
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-muted">
                <ImageIcon className="h-3.5 w-3.5" /> Trocar imagem
                <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="SKU">
              <input
                value={form.sku}
                onChange={(e) => update("sku", e.target.value.toUpperCase())}
                placeholder="MKT-CRM-001"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </FormField>
            <FormField label="Categoria">
              <CategoryPicker
                value={form.category}
                categories={categories}
                onChange={(v) => update("category", v)}
              />
            </FormField>

          </div>

          <FormField label="Nome do produto">
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Nome comercial do produto"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </FormField>

          <FormField label="Descrição">
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
              placeholder="O que o cliente recebe com este produto?"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-y"
            />
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Valor">
              <input
                type="text"
                inputMode="decimal"
                value={priceDraft}
                aria-invalid={!!money.error}
                onChange={(e) => setPriceDraft(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 tabular-nums"
              />
            </FormField>
            <FormField label="Valor promocional">
              <input
                type="text"
                inputMode="decimal"
                value={promoDraft}
                aria-invalid={!!money.error}
                onChange={(e) => setPromoDraft(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 tabular-nums"
              />
            </FormField>

          </div>

          <VanessaPropertyFields value={form.property} onChange={v=>update('property',v)} onCoverChange={v=>update('image',v||PLACEHOLDER_IMG)} onBusy={setMediaBusy}/>
          {form.importSnapshot && <section className="rounded-lg border border-border p-3 text-xs"><h3 className="font-semibold">Histórico importado</h3><p className="mt-1 text-muted-foreground">Valores da planilha de origem. Não representam novos pedidos.</p><dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">{Object.entries((form.importSnapshot.raw ?? {}) as Record<string, string>).map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium break-words">{value === "" ? "Não informado" : value}</dd></div>)}</dl></section>}

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => update("active", e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            Imóvel ativo (disponível na plataforma)
          </label>

          {money.error && (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
              {money.error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-6 py-3">
          <button onClick={onClose} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
          <button
            disabled={saving || mediaBusy || !form.name.trim() || !!money.error}
            onClick={saveValidated}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Box className="h-3.5 w-3.5" /> {saving ? "Salvando..." : "Salvar produto"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function CatalogConfigDialog({
  catalog,
  onClose,
  onSave,
}: {
  catalog: Catalog;
  onClose: () => void;
  onSave: (patch: Partial<Catalog>) => void;
}) {
  const [name, setName] = useState(catalog.name);
  const [description, setDescription] = useState(catalog.description);
  const [cover, setCover] = useState(catalog.cover);

  const handleCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCover(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div data-slim-layer="modal" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold tracking-widest text-muted-foreground">CONFIGURAÇÕES DO CATÁLOGO</div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Editar catálogo</h2>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Foto de capa</div>
            <label className="relative block h-32 w-full overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 cursor-pointer hover:border-primary/50">
              {cover ? (
                <img src={cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center text-xs text-muted-foreground">
                  <ImageIcon className="mb-1 h-5 w-5" />
                  Clique para enviar uma imagem
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleCover} />
            </label>
          </div>
          <label className="block text-xs font-medium text-muted-foreground">
            Nome do catálogo
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Descrição
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
          <button
            disabled={!name.trim()}
            onClick={() => onSave({ name: name.trim(), description: description.trim(), cover })}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}
