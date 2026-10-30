import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, ShoppingBag,
  Package, Receipt, Users, Webhook, XCircle, Download, Store,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  saveShopifyIntegration, getShopifyStatus, disconnectShopify, listShopifyProducts,
  listShopifyOrders, listShopifyCustomers, saveShopifyCrmSettings, syncShopifyWebhooks,
  importShopifyCustomersToCrm,
} from "@/lib/shopify.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface Product {
  id?: number; title?: string; status?: string; product_type?: string; vendor?: string;
  image?: { src?: string } | null;
  variants?: { price?: string; sku?: string; inventory_quantity?: number }[];
}
interface Order {
  id?: number; name?: string; created_at?: string; total_price?: string; currency?: string;
  financial_status?: string; fulfillment_status?: string | null; email?: string | null;
  customer?: { first_name?: string | null; last_name?: string | null } | null;
  line_items?: { title?: string; quantity?: number }[];
}
interface Customer {
  id?: number; first_name?: string | null; last_name?: string | null; email?: string | null;
  phone?: string | null; orders_count?: number; total_spent?: string;
  default_address?: { phone?: string | null; city?: string | null } | null;
}
interface Stage { id: string; name: string; pipeline_id: string; position: number }
interface Pipeline { id: string; name: string }

interface CrmSettings {
  enabled: boolean;
  pipelineId: string | null;
  customerStageId: string | null;
  orderStageId: string | null;
  paidStageId: string | null;
  onlyWithPhone: boolean;
  tag: string;
}

const DEFAULT_CRM: CrmSettings = {
  enabled: false,
  pipelineId: null,
  customerStageId: null,
  orderStageId: null,
  paidStageId: null,
  onlyWithPhone: false,
  tag: "shopify",
};

const TOPICS: { id: string; label: string; desc: string }[] = [
  { id: "customers/create", label: "Novo cliente cadastrado", desc: "Alguém criou conta na loja." },
  { id: "customers/update", label: "Cliente atualizado", desc: "O cliente mudou telefone, e-mail ou endereço." },
  { id: "checkouts/create", label: "Checkout iniciado", desc: "Começou a comprar (serve para recuperar carrinho)." },
  { id: "orders/create", label: "Pedido criado", desc: "Fez o pedido, pagamento ainda pode estar pendente." },
  { id: "orders/paid", label: "Pedido pago", desc: "Venda ganha: o dinheiro entrou." },
  { id: "orders/cancelled", label: "Pedido cancelado", desc: "O pedido foi cancelado na loja." },
];

const SCOPES = [
  "read_products", "read_orders", "read_customers", "read_inventory",
  "read_checkouts", "read_price_rules", "write_script_tags",
];

export function ShopifyConnectPanel({ open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [meta, setMeta] = useState<Record<string, unknown>>({});

  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [apiSecret, setApiSecret] = useState("");

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [revenue, setRevenue] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [crm, setCrm] = useState<CrmSettings>(DEFAULT_CRM);
  const [topics, setTopics] = useState<string[]>(["customers/create", "orders/create", "orders/paid"]);

  const status = useServerFn(getShopifyStatus);
  const save = useServerFn(saveShopifyIntegration);
  const disconnect = useServerFn(disconnectShopify);
  const loadProducts = useServerFn(listShopifyProducts);
  const loadOrders = useServerFn(listShopifyOrders);
  const loadCustomers = useServerFn(listShopifyCustomers);
  const saveCrm = useServerFn(saveShopifyCrmSettings);
  const syncHooks = useServerFn(syncShopifyWebhooks);
  const importCustomers = useServerFn(importShopifyCustomersToCrm);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await status();
      setConnected(r.connected);
      setMeta((r.metadata ?? {}) as Record<string, unknown>);
      setCrm({ ...DEFAULT_CRM, ...(r.crm as CrmSettings) });
      if (r.metadata?.shop_domain) setShopDomain(String(r.metadata.shop_domain));
      const savedTopics = (r.metadata as Record<string, unknown>)?.webhook_topics;
      if (Array.isArray(savedTopics) && savedTopics.length) setTopics(savedTopics as string[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const { data: prof } = await supabase
          .from("profiles").select("current_workspace_id").eq("id", userData.user.id).maybeSingle();
        const ws = prof?.current_workspace_id;
        if (!ws) return;
        const [{ data: pl }, { data: st }] = await Promise.all([
          supabase.from("pipelines").select("id,name").eq("workspace_id", ws).order("position"),
          supabase.from("pipeline_stages").select("id,name,pipeline_id,position").eq("workspace_id", ws).order("position"),
        ]);
        setPipelines((pl ?? []) as Pipeline[]);
        setStages((st ?? []) as Stage[]);
      } catch { /* silencioso */ }
    })();
  }, [open, refresh]);

  const pipelineStages = useMemo(
    () => stages.filter((s) => s.pipeline_id === crm.pipelineId),
    [stages, crm.pipelineId],
  );

  async function run(fn: () => Promise<string | null>) {
    setBusy(true); setError(null); setOk(null);
    try {
      const msg = await fn();
      if (msg) setOk(msg);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const counts = (meta.counts ?? {}) as { products?: number | null; orders?: number | null; customers?: number | null };

  function stageSelect(value: string | null, onChange: (v: string | null) => void, placeholder: string) {
    return (
      <Select
        value={value ?? "none"}
        onValueChange={(v) => onChange(v === "none" ? null : v)}
        disabled={!crm.pipelineId}
      >
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Não mover</SelectItem>
          {pipelineStages.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" /> Central Shopify
            {connected ? (
              <Badge className="bg-emerald-600 text-white">Conectado</Badge>
            ) : (
              <Badge variant="secondary">Desconectado</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Uma conexão só puxa produtos, pedidos, vendas e clientes da sua loja, e ainda joga quem compra
            direto na sua pipeline do CRM.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
          </div>
        )}
        {ok && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> <span>{ok}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue={connected ? "loja" : "conectar"}>
            <TabsList className="flex w-full flex-wrap">
              <TabsTrigger value="conectar">Conectar</TabsTrigger>
              <TabsTrigger value="loja">Loja</TabsTrigger>
              <TabsTrigger value="produtos">Produtos</TabsTrigger>
              <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
              <TabsTrigger value="clientes">Clientes e CRM</TabsTrigger>
              <TabsTrigger value="gatilhos">Gatilhos</TabsTrigger>
            </TabsList>

            {/* ---------------------------------------------------- CONECTAR */}
            <TabsContent value="conectar" className="space-y-4 pt-4">
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                <p className="font-medium">Passo a passo (leva uns 5 minutos)</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>Entre no painel da sua loja Shopify com a conta de dono.</li>
                  <li>No menu da esquerda, clique em <b>Configurações</b> (lá embaixo).</li>
                  <li>Clique em <b>Aplicativos e canais de vendas</b> e depois em <b>Desenvolver aplicativos</b>.</li>
                  <li>Clique em <b>Criar um aplicativo</b>, dê o nome <b>Vanessa Simoni</b> e confirme.</li>
                  <li>Abra a aba <b>Configuração</b> do app, clique em <b>Configurar</b> na Admin API e marque as permissões de leitura abaixo.</li>
                  <li>Salve e clique em <b>Instalar aplicativo</b>.</li>
                  <li>Copie o <b>Admin API access token</b> (começa com shpat_). Ele aparece uma vez só.</li>
                  <li>Na aba <b>Credenciais da API</b>, copie também a <b>API secret key</b>.</li>
                  <li>Cole tudo aqui embaixo e clique em Conectar.</li>
                </ol>
                <p className="mt-3 text-xs">
                  Permissões que precisam estar marcadas: {SCOPES.join(", ")}.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Endereço da loja</Label>
                  <Input
                    value={shopDomain}
                    onChange={(e) => setShopDomain(e.target.value)}
                    placeholder="minhaloja.myshopify.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    É o endereço que termina em .myshopify.com, não o domínio próprio da loja.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Admin API access token</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="shpat_..."
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>API secret key (necessária para os gatilhos automáticos)</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder="Cole a API secret key do app"
                  />
                  <p className="text-xs text-muted-foreground">
                    Sem ela dá para ler produtos, pedidos e clientes, mas o Vanessa Simoni não consegue receber os
                    avisos em tempo real de venda e cadastro.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || !shopDomain || !accessToken}
                  onClick={() =>
                    run(async () => {
                      const r = await save({
                        data: { shopDomain, accessToken, apiSecret: apiSecret || undefined },
                      });
                      setAccessToken("");
                      setApiSecret("");
                      await refresh();
                      return `Loja ${r.shop?.name ?? shopDomain} conectada.`;
                    })
                  }
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Store className="mr-2 h-4 w-4" />}
                  Conectar loja
                </Button>
                {connected && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await disconnect();
                        await refresh();
                        return "Shopify desconectado.";
                      })
                    }
                  >
                    <XCircle className="mr-2 h-4 w-4" /> Desconectar
                  </Button>
                )}
                <Button variant="ghost" asChild>
                  <a href="https://admin.shopify.com" target="_blank" rel="noreferrer">
                    Abrir painel Shopify <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </TabsContent>

            {/* -------------------------------------------------------- LOJA */}
            <TabsContent value="loja" className="space-y-4 pt-4">
              {!connected ? (
                <EmptyState text="Conecte a loja na aba Conectar para ver os dados aqui." />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MiniCard label="Produtos" value={counts.products ?? "-"} icon={<Package className="h-4 w-4" />} />
                    <MiniCard label="Pedidos" value={counts.orders ?? "-"} icon={<Receipt className="h-4 w-4" />} />
                    <MiniCard label="Clientes" value={counts.customers ?? "-"} icon={<Users className="h-4 w-4" />} />
                  </div>
                  <div className="rounded-lg border p-4 text-sm">
                    <p><b>Loja:</b> {String(meta.shop_name ?? "-")}</p>
                    <p><b>Domínio:</b> {String(meta.shop_domain ?? "-")}</p>
                    <p><b>Moeda:</b> {String(meta.shop_currency ?? "-")}</p>
                    <p><b>Plano:</b> {String(meta.shop_plan ?? "-")}</p>
                    <p><b>Token:</b> {String(meta.masked ?? "-")}</p>
                    {meta.last_event_at ? (
                      <p><b>Último evento recebido:</b> {String(meta.last_topic ?? "")} em {new Date(String(meta.last_event_at)).toLocaleString("pt-BR")}</p>
                    ) : null}
                  </div>
                  <Button variant="outline" disabled={busy} onClick={() => run(async () => { await refresh(); return "Dados atualizados."; })}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
                  </Button>
                </>
              )}
            </TabsContent>

            {/* ---------------------------------------------------- PRODUTOS */}
            <TabsContent value="produtos" className="space-y-3 pt-4">
              <Button
                variant="outline"
                disabled={busy || !connected}
                onClick={() => run(async () => {
                  const r = await loadProducts({ data: { limit: 30 } });
                  setProducts(r.products as Product[]);
                  return `${r.products.length} produtos carregados.`;
                })}
              >
                <Package className="mr-2 h-4 w-4" /> Puxar produtos
              </Button>
              <div className="space-y-2">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border p-3">
                    {p.image?.src ? (
                      <img src={p.image.src} alt={p.title ?? ""} className="h-12 w-12 rounded object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded bg-muted"><Package className="h-4 w-4" /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.product_type || "sem categoria"} · {p.variants?.[0]?.price ? `R$ ${p.variants[0].price}` : "sem preço"} ·
                        {" "}estoque {p.variants?.[0]?.inventory_quantity ?? "-"}
                      </p>
                    </div>
                    <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
                  </div>
                ))}
                {!products.length && <EmptyState text="Nenhum produto carregado ainda." />}
              </div>
            </TabsContent>

            {/* ----------------------------------------------------- PEDIDOS */}
            <TabsContent value="pedidos" className="space-y-3 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  disabled={busy || !connected}
                  onClick={() => run(async () => {
                    const r = await loadOrders({ data: { limit: 30 } });
                    setOrders(r.orders as Order[]);
                    setRevenue(r.revenue);
                    return `${r.orders.length} pedidos carregados.`;
                  })}
                >
                  <Receipt className="mr-2 h-4 w-4" /> Puxar pedidos
                </Button>
                {revenue != null && (
                  <Badge variant="secondary">
                    Soma dos pedidos listados: {revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                {orders.map((o) => (
                  <div key={o.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {o.name} · {[o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") || o.email || "sem cliente"}
                      </p>
                      <Badge variant={o.financial_status === "paid" ? "default" : "secondary"}>
                        {o.financial_status ?? "-"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {o.created_at ? new Date(o.created_at).toLocaleString("pt-BR") : ""} · {o.total_price} {o.currency} ·
                      {" "}{(o.line_items ?? []).map((i) => `${i.quantity}x ${i.title}`).join(", ") || "sem itens"}
                    </p>
                  </div>
                ))}
                {!orders.length && <EmptyState text="Nenhum pedido carregado ainda." />}
              </div>
            </TabsContent>

            {/* ------------------------------------------------ CLIENTES/CRM */}
            <TabsContent value="clientes" className="space-y-4 pt-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy || !connected}
                  onClick={() => run(async () => {
                    const r = await loadCustomers({ data: { limit: 30 } });
                    setCustomers(r.customers as Customer[]);
                    return `${r.customers.length} clientes carregados.`;
                  })}
                >
                  <Users className="mr-2 h-4 w-4" /> Puxar clientes
                </Button>
                <Button
                  disabled={busy || !connected}
                  onClick={() => run(async () => {
                    const r = await importCustomers({ data: { limit: 50 } });
                    return `${r.created} leads criados, ${r.updated} atualizados, ${r.skipped} ignorados (sem WhatsApp).`;
                  })}
                >
                  <Download className="mr-2 h-4 w-4" /> Importar clientes para o CRM
                </Button>
              </div>
              <div className="space-y-2">
                {customers.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Sem nome"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.email ?? "sem e-mail"} · {c.phone || c.default_address?.phone || "sem WhatsApp"}
                      </p>
                    </div>
                    <Badge variant="secondary">{c.orders_count ?? 0} pedidos</Badge>
                  </div>
                ))}
                {!customers.length && <EmptyState text="Nenhum cliente carregado ainda." />}
              </div>
            </TabsContent>

            {/* ---------------------------------------------------- GATILHOS */}
            <TabsContent value="gatilhos" className="space-y-4 pt-4">
              <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                Aqui você escolhe o que acontece no CRM quando algo acontece na loja. Exemplo: cliente se
                cadastrou com WhatsApp na Shopify, o lead entra na etapa que você marcar. Pagou, vai para
                a etapa de venda ganha.
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Gatilho Shopify no CRM</p>
                  <p className="text-xs text-muted-foreground">Liga a criação automática de leads.</p>
                </div>
                <Switch checked={crm.enabled} onCheckedChange={(v) => setCrm({ ...crm, enabled: v })} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Pipeline</Label>
                  <Select
                    value={crm.pipelineId ?? "none"}
                    onValueChange={(v) => setCrm({ ...crm, pipelineId: v === "none" ? null : v, customerStageId: null, orderStageId: null, paidStageId: null })}
                  >
                    <SelectTrigger><SelectValue placeholder="Escolha a pipeline" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Etiqueta aplicada no lead</Label>
                  <Input value={crm.tag} onChange={(e) => setCrm({ ...crm, tag: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cadastro / checkout cai em</Label>
                  {stageSelect(crm.customerStageId, (v) => setCrm({ ...crm, customerStageId: v }), "Etapa do cadastro")}
                </div>
                <div className="space-y-1.5">
                  <Label>Pedido criado cai em</Label>
                  {stageSelect(crm.orderStageId, (v) => setCrm({ ...crm, orderStageId: v }), "Etapa do pedido")}
                </div>
                <div className="space-y-1.5">
                  <Label>Pedido pago (venda ganha) cai em</Label>
                  {stageSelect(crm.paidStageId, (v) => setCrm({ ...crm, paidStageId: v }), "Etapa da venda ganha")}
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Só criar lead com WhatsApp</p>
                    <p className="text-xs text-muted-foreground">Ignora quem não deixou telefone.</p>
                  </div>
                  <Switch checked={crm.onlyWithPhone} onCheckedChange={(v) => setCrm({ ...crm, onlyWithPhone: v })} />
                </div>
              </div>

              <Button
                disabled={busy || !connected}
                onClick={() => run(async () => {
                  await saveCrm({ data: crm });
                  return "Gatilho do CRM salvo.";
                })}
              >
                Salvar gatilho
              </Button>

              <div className="space-y-2 rounded-lg border p-4">
                <p className="text-sm font-medium">Eventos que a loja vai avisar em tempo real</p>
                {TOPICS.map((t) => (
                  <label key={t.id} className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={topics.includes(t.id)}
                      onChange={(e) =>
                        setTopics((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id)))
                      }
                    />
                    <span>
                      <span className="block text-sm">{t.label}</span>
                      <span className="block text-xs text-muted-foreground">{t.desc}</span>
                    </span>
                  </label>
                ))}
                <Button
                  variant="outline"
                  disabled={busy || !connected || !topics.length}
                  onClick={() => run(async () => {
                    const r = await syncHooks({
                      data: {
                        topics,
                        baseUrl: typeof window !== "undefined" ? window.location.origin : undefined,
                      },
                    });
                    await refresh();
                    return `Avisos ligados: ${r.created.length} novos, ${r.kept.length} já existiam.`;
                  })}
                >
                  <Webhook className="mr-2 h-4 w-4" /> Ligar avisos automáticos
                </Button>
                {meta.webhook_url ? (
                  <p className="break-all text-xs text-muted-foreground">
                    Endereço registrado na loja: {String(meta.webhook_url)}
                  </p>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MiniCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</p>;
}
