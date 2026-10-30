import { useEffect, useMemo, useState } from "react";
import { BarChart3, ClipboardList, Package, Users, RefreshCw, Plus, Search, LogOut, CheckCircle2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Núcleo operacional Vanessa Simoni: consultas e comandos com RLS no Supabase exclusivo.
// Não depende de createServerFn/TanStack Start, que não executam no GitHub Pages.
// Toda operação de escrita exige usuário com membership no workspace.
type View = "vendas" | "pedidos" | "produtos" | "funil";
type Lead = {
  id: string; name: string; phone: string | null; email: string | null;
  value: number | string | null; status: string; stage_id: string | null;
  pipeline_id: string | null; created_at: string; updated_at: string;
};
type Product = {
  id: string; name: string; sku: string; catalog_id: string;
  price: number; promo_price: number | null; stock: number; active: boolean;
};
type Stage = { id: string; name: string; pipeline_id: string; position: number };
type Pipeline = { id: string; name: string };
type Catalog = { id: string; name: string };
type Overview = { counts: { leads: number; sales: number; products: number; whatsappSessions: number } };
type Data = { leads: Lead[]; products: Product[]; stages: Stage[]; pipelines: Pipeline[]; catalogs: Catalog[] };
const EMPTY: Data = { leads: [], products: [], stages: [], pipelines: [], catalogs: [] };
const API = "https://fnuhmypmhcwecziswbat.supabase.co/functions/v1/saude-slim-core/overview";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const date = (v: string) => new Date(v).toLocaleDateString("pt-BR");
const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";

const tabs: { id: View; label: string; icon: typeof BarChart3 }[] = [
  { id: "vendas", label: "Histórico de vendas", icon: BarChart3 },
  { id: "pedidos", label: "Pedidos e clientes", icon: ClipboardList },
  { id: "produtos", label: "Produtos e estoque", icon: Package },
  { id: "funil", label: "Funil de vendas", icon: Users },
];

export function SaudeSlimCoreDashboard() {
  const [view, setView] = useState<View>("vendas");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("Vanessa Simoni");
  const [data, setData] = useState<Data>(EMPTY);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newLead, setNewLead] = useState(false);
  const [newProduct, setNewProduct] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadValue, setLeadValue] = useState("");
  const [productName, setProductName] = useState("");
  const [productSku, setProductSku] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productStock, setProductStock] = useState("0");

  async function load(workspace: string) {
    const [leads, products, stages, pipelines, catalogs] = await Promise.all([
      supabase.from("leads").select("id,name,phone,email,value,status,stage_id,pipeline_id,created_at,updated_at")
        .eq("workspace_id", workspace).order("created_at", { ascending: false }).limit(500),
      supabase.from("products").select("id,name,sku,catalog_id,price,promo_price,stock,active")
        .eq("workspace_id", workspace).order("created_at", { ascending: false }).limit(500),
      supabase.from("pipeline_stages").select("id,name,pipeline_id,position")
        .eq("workspace_id", workspace).order("position", { ascending: true }),
      supabase.from("pipelines").select("id,name").eq("workspace_id", workspace).order("position", { ascending: true }),
      supabase.from("product_catalogs").select("id,name").eq("workspace_id", workspace),
    ]);
    const firstError = [leads.error, products.error, stages.error, pipelines.error, catalogs.error].find(Boolean);
    if (firstError) throw new Error(firstError.message);
    setData({
      leads: (leads.data ?? []) as Lead[],
      products: (products.data ?? []) as Product[],
      stages: (stages.data ?? []) as Stage[],
      pipelines: (pipelines.data ?? []) as Pipeline[],
      catalogs: (catalogs.data ?? []) as Catalog[],
    });
    // Consultas no próprio Supabase/RLS são a fonte dos dados exibidos.
    // A Edge Function fornece um controle complementar e autenticado de saúde do backend.
    const { data: session } = await supabase.auth.getSession();
    if (session.session?.access_token) {
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
      try {
        const result = await fetch(API, {
          method: "GET",
          headers: { Authorization: "Bearer " + session.session.access_token, ...(key ? { apikey: key } : {}) },
          cache: "no-store",
        });
        if (result.ok) setOverview((await result.json()) as Overview);
        else setOverview(null);
      } catch {
        setOverview(null);
      }
    }
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const auth = await supabase.auth.getUser();
        if (!auth.data.user) {
          window.location.replace("/auth");
          return;
        }
        const { data: profile, error: profileError } = await supabase.from("profiles")
          .select("current_workspace_id").eq("id", auth.data.user.id).maybeSingle();
        if (profileError) throw new Error(profileError.message);
        const ws = profile?.current_workspace_id;
        if (!ws) throw new Error("Sua conta ainda não possui um espaço de trabalho ativo.");
        const { data: membership, error: mErr } = await supabase.from("workspace_members")
          .select("id").eq("workspace_id", ws).eq("user_id", auth.data.user.id).maybeSingle();
        if (mErr || !membership) throw new Error("Sua conta não possui acesso autorizado ao espaço de trabalho.");
        const { data: company } = await supabase.from("workspaces").select("name").eq("id", ws).maybeSingle();
        if (!alive) return;
        setWorkspaceId(ws);
        if (company?.name) setWorkspaceName(company.name);
        await load(ws);
        if (alive) setLoadState("ready");
      } catch (e) {
        if (alive) {
          setError(message(e));
          setLoadState("error");
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  async function refresh() {
    if (!workspaceId) return;
    setError(null);
    setNotice(null);
    setLoadState("loading");
    try {
      await load(workspaceId);
      setLoadState("ready");
    } catch (e) {
      setError(message(e));
      setLoadState("error");
    }
  }

  async function action(fn: () => Promise<void>) {
    if (!workspaceId || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await load(workspaceId);
      setNotice("Alterações salvas no Supabase.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const mainPipeline = data.pipelines[0];
  const firstStage = data.stages.find(s => s.pipeline_id === mainPipeline?.id);
  const wonStage = data.stages.find(s => /ganh|vendid|conclu/i.test(s.name));
  const isWon = (lead: Lead) => lead.status === "won" || (wonStage && lead.stage_id === wonStage.id);
  const revenue = data.leads.filter(isWon).reduce((sum, lead) => sum + num(lead.value), 0);
  const completedSales = data.leads.filter(isWon);
  const currentRows = useMemo(() => {
    const base = view === "vendas" ? completedSales : data.leads;
    const s = search.trim().toLocaleLowerCase("pt-BR");
    return s ? base.filter(l => [l.name, l.email, l.phone, l.status].some(v => String(v ?? "").toLocaleLowerCase("pt-BR").includes(s))) : base;
  }, [view, data.leads, search, wonStage?.id]);

  async function saveLead(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || leadName.trim().length < 2) { setError("Informe o nome do cliente."); return; }
    await action(async () => {
      const { error: insertError } = await supabase.from("leads").insert({
        workspace_id: workspaceId,
        name: leadName.trim().slice(0, 150),
        phone: leadPhone.trim() || null,
        email: leadEmail.trim() || null,
        value: num(leadValue.replace(",", ".")),
        pipeline_id: mainPipeline?.id ?? null,
        stage_id: firstStage?.id ?? null,
        status: "active",
        source: "cadastro_manual_saude_slim",
      });
      if (insertError) throw new Error(insertError.message);
      setLeadName(""); setLeadPhone(""); setLeadEmail(""); setLeadValue("");
      setNewLead(false);
    });
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !productName.trim()) { setError("Informe o nome do produto."); return; }
    const catalog = data.catalogs[0];
    if (!catalog) { setError("Não há catálogo disponível nesta conta."); return; }
    await action(async () => {
      const { error: insertError } = await supabase.from("products").insert({
        workspace_id: workspaceId,
        catalog_id: catalog.id,
        name: productName.trim().slice(0, 150),
        sku: productSku.trim(),
        price: num(productPrice.replace(",", ".")),
        stock: Math.max(0, Math.floor(num(productStock))),
      });
      if (insertError) throw new Error(insertError.message);
      setProductName(""); setProductSku(""); setProductPrice(""); setProductStock("0");
      setNewProduct(false);
    });
  }

  async function updateStage(lead: Lead, id: string) {
    const stage = data.stages.find(s => s.id === id);
    if (!workspaceId || !stage) return;
    await action(async () => {
      const status = /ganh|vendid|conclu/i.test(stage.name) ? "won" : /perdid|cancel/i.test(stage.name) ? "lost" : "active";
      const { error: updateError } = await supabase.from("leads")
        .update({ stage_id: stage.id, pipeline_id: stage.pipeline_id, status })
        .eq("id", lead.id).eq("workspace_id", workspaceId);
      if (updateError) throw new Error(updateError.message);
    });
  }

  async function updateStock(p: Product, stock: number) {
    if (!workspaceId) return;
    await action(async () => {
      const { error: updateError } = await supabase.from("products").update({ stock: Math.max(0, stock) })
        .eq("id", p.id).eq("workspace_id", workspaceId);
      if (updateError) throw new Error(updateError.message);
    });
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-[#0f172a] text-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400 text-xl font-black text-slate-950">S</span>
            <div><div className="text-lg font-black tracking-tight">Vanessa Simoni</div><div className="text-xs text-slate-300">{workspaceName} · Gestão operacional</div></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void refresh()} disabled={busy || loadState === "loading"}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-500 px-3 py-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Atualizar</button>
            <button onClick={() => void logout()} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-white/10"><LogOut className="h-4 w-4" /> Sair</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] space-y-6 px-5 py-7">
        <section>
          <div className="text-xs font-black uppercase tracking-widest text-emerald-700">Operação Vanessa Simoni</div>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Painel de vendas e pedidos</h1>
          <p className="mt-2 text-sm text-slate-600">Dados reais e isolados por empresa, com acesso protegido pelo Supabase.</p>
          {overview && <span className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Backend Supabase ativo</span>}
        </section>

        {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</div>}
        {loadState === "loading" && <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Carregando dados da operação...</div>}
        {loadState === "error" && <button onClick={() => void refresh()} className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white">Tentar novamente</button>}

        {loadState === "ready" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Clientes e pedidos" value={String(data.leads.length)} />
              <Stat label="Vendas ganhas" value={String(completedSales.length)} />
              <Stat label="Valor das vendas" value={brl(revenue)} />
              <Stat label="Produtos cadastrados" value={String(data.products.length)} />
            </div>
            <nav aria-label="Módulos da Vanessa Simoni" className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
              {tabs.map(t => { const Icon = t.icon; return (
                <button key={t.id} onClick={() => { setView(t.id); setSearch(""); setNewLead(false); setNewProduct(false); }}
                  className={"inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold " + (view === t.id ? "bg-emerald-500 text-slate-950" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-emerald-50")}>
                  <Icon className="h-4 w-4" />{t.label}
                </button>
              ); })}
            </nav>
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
                <div>
                  <h2 className="text-xl font-black">{tabs.find(t => t.id === view)?.label}</h2>
                  <p className="text-xs text-slate-500">{view === "vendas" ? "Vendas efetivamente marcadas como ganhas." : view === "produtos" ? "Cadastros e estoque atuais." : "Operação vinculada ao workspace atual."}</p>
                </div>
                {(view === "vendas" || view === "pedidos") && <button onClick={() => setNewLead(v => !v)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950"><Plus className="h-4 w-4" /> Novo pedido</button>}
                {view === "produtos" && <button onClick={() => setNewProduct(v => !v)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950"><Plus className="h-4 w-4" /> Novo produto</button>}
              </div>

              {newLead && (view === "vendas" || view === "pedidos") && (
                <form onSubmit={(e) => void saveLead(e)} className="grid gap-3 border-b border-slate-200 bg-emerald-50/40 p-5 md:grid-cols-2">
                  <Field label="Cliente" value={leadName} change={setLeadName} required />
                  <Field label="WhatsApp" value={leadPhone} change={setLeadPhone} />
                  <Field label="E-mail" type="email" value={leadEmail} change={setLeadEmail} />
                  <Field label="Valor estimado (R$)" type="number" value={leadValue} change={setLeadValue} />
                  <button type="submit" disabled={busy} className="rounded-lg bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">Salvar pedido</button>
                </form>
              )}

              {newProduct && view === "produtos" && (
                <form onSubmit={(e) => void saveProduct(e)} className="grid gap-3 border-b border-slate-200 bg-emerald-50/40 p-5 md:grid-cols-2">
                  <Field label="Produto" value={productName} change={setProductName} required />
                  <Field label="SKU" value={productSku} change={setProductSku} />
                  <Field label="Preço (R$)" type="number" value={productPrice} change={setProductPrice} required />
                  <Field label="Estoque inicial" type="number" value={productStock} change={setProductStock} />
                  <button type="submit" disabled={busy} className="rounded-lg bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">Salvar produto</button>
                </form>
              )}

              {(view === "vendas" || view === "pedidos") && (
                <div>
                  <div className="relative mx-5 my-4">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar cliente, telefone ou e-mail"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-emerald-400" />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Contato</th><th className="px-5 py-3">Data</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3">Etapa</th></tr></thead>
                      <tbody>{currentRows.map(l => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="px-5 py-4 font-semibold">{l.name}</td>
                          <td className="px-5 py-4 text-slate-600">{l.phone || l.email || "Não informado"}</td>
                          <td className="px-5 py-4 text-slate-600">{date(l.created_at)}</td>
                          <td className="px-5 py-4 font-semibold">{brl(num(l.value))}</td>
                          <td className="px-5 py-4">
                            <select aria-label={"Etapa de " + l.name} value={l.stage_id || ""} disabled={busy}
                              onChange={e => void updateStage(l, e.target.value)}
                              className="w-full min-w-[135px] rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs">
                              <option value="">Sem etapa</option>
                              {data.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                    {currentRows.length === 0 && <div className="p-10 text-center text-sm text-slate-500">Nenhum registro encontrado neste espaço de trabalho.</div>}
                  </div>
                  {data.leads.length >= 500 && <div className="px-5 py-3 text-xs text-amber-700">Exibindo somente os 500 registros mais recentes. Refinar a consulta para acessar todo o histórico.</div>}
                </div>
              )}

              {view === "produtos" && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[610px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">Produto</th><th className="px-5 py-3">SKU</th><th className="px-5 py-3">Preço</th><th className="px-5 py-3">Em estoque</th><th className="px-5 py-3">Situação</th></tr></thead>
                    <tbody>{data.products.map(p => <tr className="border-t border-slate-100" key={p.id}>
                      <td className="px-5 py-4 font-semibold">{p.name}</td>
                      <td className="px-5 py-4 text-slate-600">{p.sku || "Sem SKU"}</td>
                      <td className="px-5 py-4">{brl(num(p.promo_price ?? p.price))}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button disabled={busy || p.stock <= 0} onClick={() => void updateStock(p, p.stock - 1)} aria-label={"Remover uma unidade de " + p.name} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">−</button>
                          <span className="w-9 text-center tabular-nums">{p.stock}</span>
                          <button disabled={busy} onClick={() => void updateStock(p, p.stock + 1)} aria-label={"Adicionar uma unidade de " + p.name} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">+</button>
                        </div>
                      </td>
                      <td className="px-5 py-4">{p.active ? "Ativo" : "Inativo"}</td>
                    </tr>)}</tbody>
                  </table>
                  {data.products.length === 0 && <div className="p-10 text-center text-sm text-slate-500">Nenhum produto cadastrado. Utilize “Novo produto”.</div>}
                </div>
              )}

              {view === "funil" && (
                <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                  {data.stages.map(s => { const count = data.leads.filter(l => l.stage_id === s.id).length; return (
                    <div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                      <div className="text-sm font-bold">{s.name}</div><div className="mt-2 text-3xl font-black text-emerald-700">{count}</div>
                      <div className="mt-1 text-xs text-slate-500">Pedidos nesta etapa</div>
                      <button onClick={() => setView("pedidos")} className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-emerald-700">Ver pedidos <ArrowRight className="h-3 w-3" /></button>
                    </div>
                  ); })}
                  {data.stages.length === 0 && <div className="p-5 text-sm text-slate-500">Este workspace ainda não possui etapas de funil.</div>}
                </div>
              )}
            </section>
            <p className="text-xs leading-5 text-slate-500">Ambiente Vanessa Simoni. O WhatsApp permanece independente e não é acionado por esta tela. Os demais módulos herdados da base não foram homologados nesta implantação.</p>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</div><div className="mt-2 text-2xl font-black tracking-tight">{value}</div></div>;
}
function Field({ label, value, change, type = "text", required = false }: { label: string; value: string; change: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="grid gap-1 text-xs font-semibold text-slate-600">{label}
    <input type={type} required={required} step={type === "number" ? "0.01" : undefined} min={type === "number" ? "0" : undefined}
      value={value} onChange={e => change(e.target.value)}
      className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400" />
  </label>;
}
