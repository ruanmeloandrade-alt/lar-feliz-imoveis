import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, PackagePlus, Pencil, Plus, Search, Trash2, Truck } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCompany, listCompanies, updateCompany } from "@/lib/companies.functions";
import { listProductCatalogs, type DbProduct } from "@/lib/products.functions";
import { deleteSupplierProductCost, listSupplierProductCosts, saveSupplierProductCost, type SupplierProductCost } from "@/lib/suppliers.functions";

export const Route = createFileRoute("/crm/empresas")({
  head: () => ({ meta: [
    { title: "Fornecedores · Vanessa Simoni" },
    { name: "description", content: "Cadastro de fornecedores, produtos atendidos, custos e margem da operação Vanessa Simoni." },
  ] }),
  component: SuppliersPage,
});

type Supplier = {
  id: string;
  name: string;
  site: string | null;
  notes: string | null;
  cnpj: string | null;
  phone: string | null;
  logo_signed_url: string | null;
};

type SupplierForm = {
  name: string;
  cnpj: string;
  phone: string;
  site: string;
  notes: string;
};

const EMPTY_FORM: SupplierForm = { name: "", cnpj: "", phone: "", site: "", notes: "" };

function SuppliersPage() {
  const listSuppliersFn = useServerFn(listCompanies);
  const createSupplierFn = useServerFn(createCompany);
  const updateSupplierFn = useServerFn(updateCompany);
  const listProductsFn = useServerFn(listProductCatalogs);
  const listCostsFn = useServerFn(listSupplierProductCosts);
  const saveCostFn = useServerFn(saveSupplierProductCost);
  const deleteCostFn = useServerFn(deleteSupplierProductCost);

  const [query, setQuery] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const suppliersQ = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const response = await listSuppliersFn();
      return response.companies as Supplier[];
    },
    staleTime: 30_000,
  });
  const productsQ = useQuery({
    queryKey: ["supplier-products"],
    queryFn: () => listProductsFn(),
    staleTime: 30_000,
  });

  const supplierCostsQ = useQuery({
    queryKey: ["supplier-product-costs", selected?.id],
    queryFn: () => selected ? listCostsFn({ data: { supplierId: selected.id } }) : Promise.resolve({ rows: [] }),
    enabled: !!selected,
    staleTime: 15_000,
  });

  const products = useMemo(
    () => (productsQ.data ?? []).flatMap((catalog) => catalog.products.map((product) => ({ ...product, catalogName: catalog.name }))),
    [productsQ.data],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = suppliersQ.data ?? [];
    if (!needle) return rows;
    return rows.filter((supplier) => [supplier.name, supplier.cnpj, supplier.phone, supplier.site, supplier.notes].join(" ").toLowerCase().includes(needle));
  }, [query, suppliersQ.data]);

  const supplierStats = buildSupplierStats(supplierCostsQ.data?.rows ?? []);

  async function refreshSuppliers() {
    await suppliersQ.refetch();
  }

  async function handleCreate(form: SupplierForm) {
    await createSupplierFn({ data: {
      name: form.name.trim(),
      cnpj: cleanDigits(form.cnpj) || undefined,
      phone: form.phone || undefined,
      site: form.site || undefined,
      notes: form.notes || undefined,
    } });
    setOpenNew(false);
    await refreshSuppliers();
  }

  async function handleUpdate(form: SupplierForm) {
    if (!editing) return;
    await updateSupplierFn({ data: {
      companyId: editing.id,
      name: form.name.trim(),
      cnpj: cleanDigits(form.cnpj) || null,
      phone: form.phone || null,
      site: form.site || null,
      notes: form.notes || null,
    } });
    setEditing(null);
    await refreshSuppliers();
    const updated = (await suppliersQ.refetch()).data?.find((supplier) => supplier.id === editing.id);
    if (updated) setSelected(updated);
  }

  async function handleSaveCost(input: ProductCostForm) {
    if (!selected) return;
    await saveCostFn({ data: {
      id: input.id || undefined,
      supplierId: selected.id,
      productId: input.productId,
      cost: moneyToNumber(input.cost),
      minQuantity: Math.max(1, Number(input.minQuantity || 1)),
      leadTimeDays: input.leadTimeDays ? Math.max(0, Number(input.leadTimeDays)) : null,
      notes: input.notes || null,
      active: true,
    } });
    await supplierCostsQ.refetch();
  }

  async function handleDeleteCost(row: SupplierProductCost) {
    await deleteCostFn({ data: { id: row.id } });
    await supplierCostsQ.refetch();
  }

  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground md:h-screen md:overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-6 lg:px-8">
          <header className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary"><Truck className="h-4 w-4" /> Vendas</div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Fornecedores</h1>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Cadastro de fornecedores para associar produtos, controlar custos, comparar preços e preparar automações específicas por fornecedor.
                </p>
              </div>
              <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4" /> Adicionar fornecedor</Button>
            </div>
          </header>

          <section className="grid gap-5 xl:grid-cols-[minmax(360px,0.9fr)_minmax(520px,1.1fr)]">
            <div className="rounded-lg border border-border bg-card">
              <div className="border-b border-border p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Buscar fornecedor, CNPJ, telefone ou anotação" />
                </div>
              </div>

              <div className="max-h-[720px] overflow-y-auto">
                {suppliersQ.isLoading ? (
                  <EmptySuppliers text="Carregando fornecedores..." />
                ) : filtered.length === 0 ? (
                  <EmptySuppliers text={query ? "Nenhum fornecedor encontrado." : "Nenhum fornecedor cadastrado ainda."} action={() => setOpenNew(true)} />
                ) : (
                  <div className="divide-y divide-border">
                    {filtered.map((supplier) => (
                      <button
                        key={supplier.id}
                        type="button"
                        onClick={() => setSelected(supplier)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/45 ${selected?.id === supplier.id ? "bg-primary/10" : ""}`}
                      >
                        <SupplierAvatar supplier={supplier} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{supplier.name}</div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span>{supplier.phone || "Sem telefone"}</span>
                            {supplier.cnpj && <span>CNPJ {formatCnpj(supplier.cnpj)}</span>}
                          </div>
                          {supplier.notes && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{supplier.notes}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card">
              {!selected ? (
                <div className="flex min-h-[520px] flex-col items-center justify-center p-8 text-center">
                  <Truck className="h-10 w-10 text-muted-foreground/45" />
                  <h2 className="mt-3 text-base font-semibold">Selecione um fornecedor</h2>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">Abra a ficha para vincular produtos, custos, pedido mínimo e prazo de reposição.</p>
                </div>
              ) : (
                <div>
                  <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <SupplierAvatar supplier={selected} large />
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold">{selected.name}</h2>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>{selected.phone || "Sem telefone"}</span>
                          {selected.cnpj && <span>CNPJ {formatCnpj(selected.cnpj)}</span>}
                          {selected.site && <a className="text-primary hover:underline" href={normalizeUrl(selected.site)} target="_blank" rel="noreferrer">Site</a>}
                        </div>
                        {selected.notes && <p className="mt-3 text-sm text-muted-foreground">{selected.notes}</p>}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setEditing(selected)}><Pencil className="h-4 w-4" /> Editar ficha</Button>
                  </div>

                  <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-3">
                    <Metric label="Produtos vinculados" value={String(supplierStats.count)} />
                    <Metric label="Custo médio" value={formatBRL(supplierStats.avgCost)} />
                    <Metric label="Margem estimada" value={`${supplierStats.avgMargin.toFixed(1).replace(".", ",")}%`} />
                  </div>

                  <div className="p-4">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">Produtos e custos do fornecedor</h3>
                        <p className="text-xs text-muted-foreground">Base para comparação de preço, ranking de lucro e automações específicas.</p>
                      </div>
                      <ProductCostDialogTrigger products={products} onSave={handleSaveCost} />
                    </div>

                    {supplierCostsQ.data?.setupRequired && (
                      <div className="mb-3 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                        A tabela de custos de fornecedores ainda precisa ser aplicada no banco. A migration já está no projeto.
                      </div>
                    )}

                    {supplierCostsQ.isLoading ? (
                      <EmptyProducts text="Carregando produtos vinculados..." />
                    ) : (supplierCostsQ.data?.rows ?? []).length === 0 ? (
                      <EmptyProducts text="Nenhum produto associado a este fornecedor ainda." />
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-border">
                        <div className="hidden grid-cols-[1.2fr_.75fr_.65fr_.65fr_.55fr_auto] gap-3 border-b border-border bg-muted/35 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
                          <span>Produto</span><span>Custo</span><span>Venda</span><span>Margem</span><span>Prazo</span><span />
                        </div>
                        <div className="divide-y divide-border">
                          {(supplierCostsQ.data?.rows ?? []).map((row) => (
                            <ProductCostRow key={row.id} row={row} products={products} onSave={handleSaveCost} onDelete={() => handleDeleteCost(row)} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <SupplierDialog open={openNew} title="Adicionar fornecedor" onClose={() => setOpenNew(false)} onSubmit={handleCreate} />
      <SupplierDialog open={!!editing} title="Editar fornecedor" supplier={editing} onClose={() => setEditing(null)} onSubmit={handleUpdate} />
    </div>
  );
}

function SupplierAvatar({ supplier, large = false }: { supplier: Supplier; large?: boolean }) {
  const size = large ? "h-14 w-14" : "h-10 w-10";
  if (supplier.logo_signed_url) return <img src={supplier.logo_signed_url} alt="" className={`${size} shrink-0 rounded-lg border border-border object-cover`} />;
  return <div className={`${size} grid shrink-0 place-items-center rounded-lg bg-muted text-primary`}><Building2 className={large ? "h-6 w-6" : "h-5 w-5"} /></div>;
}

function EmptySuppliers({ text, action }: { text: string; action?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Truck className="h-8 w-8 text-muted-foreground/45" />
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
      {action && <Button className="mt-4" size="sm" onClick={action}><Plus className="h-4 w-4" /> Adicionar fornecedor</Button>}
    </div>
  );
}

function EmptyProducts({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-border bg-background px-3 py-2"><div className="text-[11px] text-muted-foreground">{label}</div><div className="text-lg font-semibold tabular-nums">{value}</div></div>;
}

function SupplierDialog({ open, title, supplier, onClose, onSubmit }: { open: boolean; title: string; supplier?: Supplier | null; onClose: () => void; onSubmit: (form: SupplierForm) => Promise<void> }) {
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(supplier ? {
      name: supplier.name,
      cnpj: supplier.cnpj ? formatCnpj(supplier.cnpj) : "",
      phone: supplier.phone ?? "",
      site: supplier.site ?? "",
      notes: supplier.notes ?? "",
    } : EMPTY_FORM);
    setError(null);
  }, [open, supplier]);

  async function submit() {
    if (!form.name.trim()) return setError("Informe o nome do fornecedor.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o fornecedor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label="Nome do fornecedor *"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Fornecedor de cápsulas" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="CNPJ"><Input value={form.cnpj} onChange={(event) => setForm({ ...form, cnpj: formatCnpj(event.target.value) })} placeholder="00.000.000/0000-00" /></Field>
            <Field label="Telefone"><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="(11) 99999-9999" /></Field>
          </div>
          <Field label="Site"><Input value={form.site} onChange={(event) => setForm({ ...form, site: event.target.value })} placeholder="https://..." /></Field>
          <Field label="Observações"><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Condições comerciais, contato, região, políticas de compra..." /></Field>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={submit} disabled={busy}>{busy ? "Salvando..." : "Salvar fornecedor"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ProductCostForm = {
  id?: string;
  productId: string;
  cost: string;
  minQuantity: string;
  leadTimeDays: string;
  notes: string;
};

function ProductCostDialogTrigger({ products, onSave }: { products: Array<DbProduct & { catalogName?: string }>; onSave: (form: ProductCostForm) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={products.length === 0}><PackagePlus className="h-4 w-4" /> Associar produto</Button>
      <ProductCostDialog open={open} products={products} onClose={() => setOpen(false)} onSave={async (form) => { await onSave(form); setOpen(false); }} />
    </>
  );
}

function ProductCostRow({ row, products, onSave, onDelete }: { row: SupplierProductCost; products: Array<DbProduct & { catalogName?: string }>; onSave: (form: ProductCostForm) => Promise<void>; onDelete: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const margin = row.salePrice > 0 ? ((row.salePrice - row.cost) / row.salePrice) * 100 : 0;
  return (
    <>
      <div className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1.2fr_.75fr_.65fr_.65fr_.55fr_auto] md:items-center md:gap-3">
        <div className="min-w-0"><div className="truncate font-semibold">{row.productName}</div><div className="truncate text-xs text-muted-foreground">{row.productSku || "Sem SKU"} · Pedido mínimo {row.minQuantity}</div></div>
        <div className="font-semibold tabular-nums">{formatBRL(row.cost)}</div>
        <div className="text-muted-foreground tabular-nums">{formatBRL(row.salePrice)}</div>
        <div className={margin >= 30 ? "font-semibold text-emerald-400" : margin >= 10 ? "font-semibold text-amber-300" : "font-semibold text-destructive"}>{margin.toFixed(1).replace(".", ",")}%</div>
        <div className="text-xs text-muted-foreground">{row.leadTimeDays == null ? "Sem prazo" : `${row.leadTimeDays} dia(s)`}</div>
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Editar</Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <ProductCostDialog
        open={editing}
        row={row}
        products={products}
        onClose={() => setEditing(false)}
        onSave={async (form) => { await onSave(form); setEditing(false); }}
      />
    </>
  );
}

function ProductCostDialog({ open, row, products, onClose, onSave }: { open: boolean; row?: SupplierProductCost; products: Array<DbProduct & { catalogName?: string }>; onClose: () => void; onSave: (form: ProductCostForm) => Promise<void> }) {
  const [form, setForm] = useState<ProductCostForm>({ productId: "", cost: "", minQuantity: "1", leadTimeDays: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(row ? {
      id: row.id,
      productId: row.productId,
      cost: String(row.cost).replace(".", ","),
      minQuantity: String(row.minQuantity),
      leadTimeDays: row.leadTimeDays == null ? "" : String(row.leadTimeDays),
      notes: row.notes ?? "",
    } : { productId: products[0]?.id ?? "", cost: "", minQuantity: "1", leadTimeDays: "", notes: "" });
    setError(null);
  }, [open, products, row]);

  async function submit() {
    if (!form.productId) return setError("Selecione um produto.");
    if (moneyToNumber(form.cost) < 0) return setError("Informe um custo válido.");
    setBusy(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o custo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{row ? "Editar produto do fornecedor" : "Associar produto ao fornecedor"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label="Produto">
            <select value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {products.map((product) => <option key={product.id} value={product.id}>{product.name} {product.sku ? `· ${product.sku}` : ""}</option>)}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Custo"><Input value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} placeholder="0,00" /></Field>
            <Field label="Pedido mínimo"><Input type="number" min={1} value={form.minQuantity} onChange={(event) => setForm({ ...form, minQuantity: event.target.value })} /></Field>
            <Field label="Prazo"><Input type="number" min={0} value={form.leadTimeDays} onChange={(event) => setForm({ ...form, leadTimeDays: event.target.value })} placeholder="dias" /></Field>
          </div>
          <Field label="Observações"><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Condição de compra, desconto por volume, frete..." /></Field>
          {products.length === 0 && <p className="rounded-md bg-amber-400/10 px-3 py-2 text-xs text-amber-200">Cadastre produtos antes de associar custos. <Link to="/crm/produtos" className="underline">Abrir Produtos</Link></p>}
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={submit} disabled={busy || products.length === 0}>{busy ? "Salvando..." : "Salvar vínculo"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>{label}</span>{children}</label>;
}

function buildSupplierStats(rows: SupplierProductCost[]) {
  const count = rows.length;
  const avgCost = count ? rows.reduce((sum, row) => sum + row.cost, 0) / count : 0;
  const marginRows = rows.filter((row) => row.salePrice > 0);
  const avgMargin = marginRows.length ? marginRows.reduce((sum, row) => sum + ((row.salePrice - row.cost) / row.salePrice) * 100, 0) / marginRows.length : 0;
  return { count, avgCost, avgMargin };
}

function cleanDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatCnpj(value: string): string {
  const d = cleanDigits(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function moneyToNumber(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
