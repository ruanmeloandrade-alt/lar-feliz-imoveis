import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  BarChart3,
  Megaphone,
  Tags,
  Store,
  MapPin,
  Star,
  Save,
  LinkIcon,
  Unlink,
  ShoppingBag,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getGoogleStatus,
  startGoogleOAuth,
  disconnectGoogle,
  saveGoogleConfig,
  listGoogleAdsAccounts,
  listGoogleAdsCampaigns,
  listGa4Properties,
  getGa4Report,
  listGtmAccounts,
  listGtmContainers,
  getGtmTags,
  listGbpAccounts,
  listGbpLocations,
  getGbpPerformance,
  listGbpReviews,
  replyGbpReview,
  listMerchantProducts,
} from "@/lib/google.functions";
import { listMerchantAccounts } from "@/lib/google-merchant.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Status = Awaited<ReturnType<typeof getGoogleStatus>>;

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

const GOOGLE_SCOPE_BY_PRODUCT: Record<string, string> = {
  ads: "https://www.googleapis.com/auth/adwords",
  analytics: "https://www.googleapis.com/auth/analytics.readonly",
  tagmanager: "https://www.googleapis.com/auth/tagmanager.readonly",
  business: "https://www.googleapis.com/auth/business.manage",
  merchant: "https://www.googleapis.com/auth/content",
  calendar: "https://www.googleapis.com/auth/calendar",
  drive: "https://www.googleapis.com/auth/drive",
  sheets: "https://www.googleapis.com/auth/spreadsheets",
  docs: "https://www.googleapis.com/auth/documents",
  gmail: "https://www.googleapis.com/auth/gmail.send",
};

function Info({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}

export function GoogleConnectPanel({ open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const [adsCustomerId, setAdsCustomerId] = useState("");
  const [adsLoginCustomerId, setAdsLoginCustomerId] = useState("");
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [gtmAccountId, setGtmAccountId] = useState("");
  const [gtmContainerId, setGtmContainerId] = useState("");
  const [gbpAccount, setGbpAccount] = useState("");
  const [gbpLocation, setGbpLocation] = useState("");
  const [merchantId, setMerchantId] = useState("");

  const [adsAccounts, setAdsAccounts] = useState<
    { id: string; name: string; currency: string; manager: boolean }[]
  >([]);
  const [campaigns, setCampaigns] = useState<Awaited<
    ReturnType<typeof listGoogleAdsCampaigns>
  > | null>(null);
  const [ga4Props, setGa4Props] = useState<
    { property: string; displayName: string; accountName?: string }[]
  >([]);
  const [ga4Report, setGa4Report] = useState<Awaited<ReturnType<typeof getGa4Report>> | null>(null);
  const [gtmAccounts, setGtmAccounts] = useState<{ accountId: string; name: string }[]>([]);
  const [gtmContainers, setGtmContainers] = useState<
    { containerId: string; name: string; publicId: string }[]
  >([]);
  const [gtmTags, setGtmTags] = useState<Awaited<ReturnType<typeof getGtmTags>> | null>(null);
  const [gbpAccounts, setGbpAccounts] = useState<{ name: string; accountName: string }[]>([]);
  const [gbpLocations, setGbpLocations] = useState<
    { name: string; title: string; address?: string }[]
  >([]);
  const [gbpPerf, setGbpPerf] = useState<Awaited<ReturnType<typeof getGbpPerformance>> | null>(
    null,
  );
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof listGbpReviews>> | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [merchantAccounts, setMerchantAccounts] = useState<
    { id: string; name: string; resourceName: string; testAccount: boolean }[]
  >([]);
  const [products, setProducts] = useState<
    { id: string; title: string; price: string; availability: string }[]
  >([]);

  const fnStatus = useServerFn(getGoogleStatus);
  const fnStart = useServerFn(startGoogleOAuth);
  const fnDisconnect = useServerFn(disconnectGoogle);
  const fnSave = useServerFn(saveGoogleConfig);
  const fnAdsAccounts = useServerFn(listGoogleAdsAccounts);
  const fnAdsCampaigns = useServerFn(listGoogleAdsCampaigns);
  const fnGa4Props = useServerFn(listGa4Properties);
  const fnGa4Report = useServerFn(getGa4Report);
  const fnGtmAccounts = useServerFn(listGtmAccounts);
  const fnGtmContainers = useServerFn(listGtmContainers);
  const fnGtmTags = useServerFn(getGtmTags);
  const fnGbpAccounts = useServerFn(listGbpAccounts);
  const fnGbpLocations = useServerFn(listGbpLocations);
  const fnGbpPerf = useServerFn(getGbpPerformance);
  const fnReviews = useServerFn(listGbpReviews);
  const fnReply = useServerFn(replyGbpReview);
  const fnMerchantAccounts = useServerFn(listMerchantAccounts);
  const fnProducts = useServerFn(listMerchantProducts);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fnStatus();
      setStatus(s);
      setSelectedProducts(
        s.products.length > 0
          ? s.products
          : s.catalog
              .filter((p) => !["calendar", "drive", "sheets", "docs"].includes(p.id))
              .map((p) => p.id),
      );
      setAdsCustomerId(s.config.adsCustomerId);
      setAdsLoginCustomerId(s.config.adsLoginCustomerId);
      setGa4PropertyId(s.config.ga4PropertyId);
      setGtmAccountId(s.config.gtmAccountId);
      setGtmContainerId(s.config.gtmContainerId);
      setGbpAccount(s.config.gbpAccount);
      setGbpLocation(s.config.gbpLocation);
      setMerchantId(s.config.merchantId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fnStatus]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await fn();
      setOk(label);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    await run("Abrindo autorização do Google…", async () => {
      const r = await fnStart({
        data: { redirectOrigin: window.location.origin, products: selectedProducts },
      });
      window.location.href = r.authorizeUrl;
    });
  }

  async function saveConfig(msg = "Configuração salva.") {
    await run(msg, async () => {
      await fnSave({
        data: {
          adsCustomerId,
          adsLoginCustomerId,
          ga4PropertyId,
          gtmAccountId,
          gtmContainerId,
          gbpAccount,
          gbpLocation,
          merchantId,
        },
      });
      await refresh();
    });
  }

  const connected = status?.connected ?? false;
  const grantedScopes = new Set((status?.scope ?? "").split(/\s+/).filter(Boolean));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Google Central
            {connected ? (
              <Badge className="bg-emerald-500/15 text-emerald-600">Conectado</Badge>
            ) : (
              <Badge variant="secondary">Desconectado</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Uma autorização só libera Google Ads, Analytics 4, Tag Manager, Business Profile,
            Merchant Center e os produtos Workspace (Agenda, Drive, Sheets, Docs, Gmail). Não existe
            conexão Google separada: tudo passa por aqui.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
          </div>
        )}
        {ok && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-600">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> <span>{ok}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando central Google…
          </div>
        ) : (
          <Tabs defaultValue="conexao">
            <TabsList className="flex w-full flex-wrap justify-start">
              <TabsTrigger value="conexao">Conexão</TabsTrigger>
              <TabsTrigger value="ads">Google Ads</TabsTrigger>
              <TabsTrigger value="analytics">Analytics 4</TabsTrigger>
              <TabsTrigger value="gtm">Tag Manager</TabsTrigger>
              <TabsTrigger value="gbp">Business Profile</TabsTrigger>
              <TabsTrigger value="merchant">Merchant</TabsTrigger>
            </TabsList>

            <TabsContent value="conexao" className="space-y-4 pt-4">
              {!status?.envReady && (
                <Info>
                  O login com Google ainda não foi liberado neste servidor. É preciso cadastrar o
                  <b> Client ID</b> e o <b>Client Secret</b> de um projeto do Google Cloud (APIs e
                  serviços, Credenciais, ID do cliente OAuth do tipo Aplicativo Web) com esta URL de
                  redirecionamento autorizada:
                  <code className="ml-1 rounded bg-background px-1 py-0.5">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/api/public/oauth/google/callback`
                      : "/api/public/oauth/google/callback"}
                  </code>
                </Info>
              )}

              <div className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {connected
                        ? `Conta autorizada: ${status?.email ?? "conta Google"}`
                        : "Nenhuma conta Google autorizada"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {connected
                        ? "Os tokens são renovados sozinhos. Se você trocar de conta, reconecte por aqui."
                        : "Clique em conectar, escolha a conta e aceite as permissões pedidas."}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={connect} disabled={busy || !status?.envReady}>
                      {busy ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <LinkIcon className="mr-2 h-4 w-4" />
                      )}
                      {connected ? "Reconectar" : "Conectar Conta Google"}
                    </Button>
                    {connected && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          run("Conta Google desconectada.", async () => {
                            await fnDisconnect();
                            await refresh();
                          })
                        }
                      >
                        <Unlink className="mr-2 h-4 w-4" /> Desconectar
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void refresh()}
                      disabled={busy}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Escolha os produtos que esta conta vai usar</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(status?.catalog ?? []).map((p) => {
                    const selected = selectedProducts.includes(p.id);
                    const productScope = GOOGLE_SCOPE_BY_PRODUCT[p.id];
                    const authorized = Boolean(
                      connected && productScope && grantedScopes.has(productScope),
                    );
                    return (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) =>
                              setSelectedProducts((current) =>
                                checked
                                  ? Array.from(new Set([...current, p.id]))
                                  : current.filter((id) => id !== p.id),
                              )
                            }
                          />
                          {p.label}
                        </span>
                        {authorized ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600">Autorizado</Badge>
                        ) : selected ? (
                          <Badge variant="outline">Será solicitado</Badge>
                        ) : (
                          <Badge variant="secondary">Não solicitado</Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
                {connected && grantedScopes.size > 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    A conta possui {grantedScopes.size} permissões OAuth registradas. Reconecte após
                    alterar a seleção para atualizar o consentimento.
                  </p>
                ) : null}
              </div>

              <Info>
                Selecione somente os produtos que pretende usar e clique em conectar/reconectar. A
                Vanessa Simoni reutiliza a mesma autorização Google e pede permissões adicionais apenas
                quando você habilita novos produtos.
              </Info>
            </TabsContent>

            <TabsContent value="ads" className="space-y-4 pt-4">
              <Info>
                Autorize sua conta Google e carregue as contas acessíveis. O Developer Token e os
                segredos técnicos pertencem à Vanessa Simoni e ficam configurados somente no servidor; o
                cliente não precisa copiar nem informar credenciais técnicas.
              </Info>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Login Customer ID (MCC, opcional)</Label>
                  <Input placeholder="123-456-7890" value={adsLoginCustomerId} onChange={(e) => setAdsLoginCustomerId(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Customer ID da conta que será lida</Label>
                  <Input placeholder="123-456-7890" value={adsCustomerId} onChange={(e) => setAdsCustomerId(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveConfig("Google Ads salvo.")} disabled={busy || !connected}><Save className="mr-2 h-4 w-4" /> Salvar</Button>
                <Button variant="outline" disabled={busy || !connected} onClick={() => run("Contas carregadas.", async () => setAdsAccounts((await fnAdsAccounts()).accounts))}><Megaphone className="mr-2 h-4 w-4" /> Carregar contas acessíveis</Button>
                <Button variant="outline" disabled={busy || !connected} onClick={() => run("Campanhas carregadas.", async () => setCampaigns(await fnAdsCampaigns({ data: { days: 30, customerId: adsCustomerId || undefined } })))}><BarChart3 className="mr-2 h-4 w-4" /> Campanhas (30 dias)</Button>
              </div>
              {adsAccounts.length > 0 && <div className="space-y-1">{adsAccounts.map((a) => <button key={a.id} type="button" onClick={() => setAdsCustomerId(a.id)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${adsCustomerId.replace(/\D/g, "") === a.id ? "border-primary bg-primary/5" : "border-border"}`}><span>{a.name}</span><span className="text-xs text-muted-foreground">{a.id} {a.manager ? "· MCC" : ""} {a.currency}</span></button>)}</div>}
              {campaigns && <div className="space-y-2"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Kpi label="Investimento" value={money(campaigns.totals.cost)} /><Kpi label="Cliques" value={num(campaigns.totals.clicks)} /><Kpi label="Impressões" value={num(campaigns.totals.impressions)} /><Kpi label="Conversões" value={num(campaigns.totals.conversions)} /></div><div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">Campanha</th><th className="p-2 text-right">Custo</th><th className="p-2 text-right">Cliques</th><th className="p-2 text-right">CTR</th><th className="p-2 text-right">Conv.</th><th className="p-2 text-right">CPA</th></tr></thead><tbody>{campaigns.campaigns.map((c) => <tr key={c.id} className="border-t border-border"><td className="p-2">{c.name} <span className="text-xs text-muted-foreground">{c.status}</span></td><td className="p-2 text-right">{money(c.cost)}</td><td className="p-2 text-right">{num(c.clicks)}</td><td className="p-2 text-right">{num(c.ctr)}%</td><td className="p-2 text-right">{num(c.conversions)}</td><td className="p-2 text-right">{money(c.cpa)}</td></tr>)}</tbody></table></div></div>}
            </TabsContent>

            <TabsContent value="analytics" className="space-y-4 pt-4">
              <Info>Carregue suas propriedades GA4, escolha uma e salve. A leitura usa a API oficial de relatórios, então os números são os mesmos que você vê dentro do Google Analytics.</Info>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={busy || !connected} onClick={() => run("Propriedades carregadas.", async () => setGa4Props((await fnGa4Props()).properties))}><RefreshCw className="mr-2 h-4 w-4" /> Carregar propriedades</Button>
                <Button onClick={() => saveConfig("Propriedade GA4 salva.")} disabled={busy || !connected}><Save className="mr-2 h-4 w-4" /> Salvar</Button>
                <Button variant="outline" disabled={busy || !connected} onClick={() => run("Relatório carregado.", async () => setGa4Report(await fnGa4Report({ data: { days: 28, propertyId: ga4PropertyId || undefined } })))}><BarChart3 className="mr-2 h-4 w-4" /> Relatório (28 dias)</Button>
              </div>
              <div className="space-y-1"><Label>Property ID</Label><Input placeholder="123456789" value={ga4PropertyId} onChange={(e) => setGa4PropertyId(e.target.value)} /></div>
              {ga4Props.length > 0 && <div className="space-y-1">{ga4Props.map((p) => <button key={p.property} type="button" onClick={() => setGa4PropertyId(p.property)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${ga4PropertyId === p.property ? "border-primary bg-primary/5" : "border-border"}`}><span>{p.displayName}</span><span className="text-xs text-muted-foreground">{p.accountName} · {p.property}</span></button>)}</div>}
              {ga4Report && <div className="space-y-2"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Kpi label="Usuários" value={num(ga4Report.totals.users)} /><Kpi label="Sessões" value={num(ga4Report.totals.sessions)} /><Kpi label="Páginas vistas" value={num(ga4Report.totals.views)} /><Kpi label="Agora no site" value={num(ga4Report.realtime)} /></div><div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">Canal</th><th className="p-2 text-right">Sessões</th><th className="p-2 text-right">Usuários</th><th className="p-2 text-right">Conversões</th></tr></thead><tbody>{ga4Report.rows.map((r) => <tr key={r.dimension} className="border-t border-border"><td className="p-2">{r.dimension}</td><td className="p-2 text-right">{num(r.sessions)}</td><td className="p-2 text-right">{num(r.users)}</td><td className="p-2 text-right">{num(r.conversions)}</td></tr>)}</tbody></table></div></div>}
            </TabsContent>

            <TabsContent value="gtm" className="space-y-4 pt-4">
              <Info>Aqui a Vanessa Simoni lê suas contas e containers do Tag Manager para conferir se o Pixel Vanessa Simoni, o GA4 e as tags de conversão estão mesmo publicados. Escolha a conta, depois o container.</Info>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={busy || !connected} onClick={() => run("Contas GTM carregadas.", async () => setGtmAccounts((await fnGtmAccounts()).accounts))}><RefreshCw className="mr-2 h-4 w-4" /> Carregar contas</Button>
                <Button variant="outline" disabled={busy || !connected || !gtmAccountId} onClick={() => run("Containers carregados.", async () => setGtmContainers((await fnGtmContainers({ data: { accountId: gtmAccountId } })).containers))}><Tags className="mr-2 h-4 w-4" /> Carregar containers</Button>
                <Button onClick={() => saveConfig("Container GTM salvo.")} disabled={busy || !connected}><Save className="mr-2 h-4 w-4" /> Salvar</Button>
                <Button variant="outline" disabled={busy || !connected || !gtmContainerId} onClick={() => run("Tags carregadas.", async () => setGtmTags(await fnGtmTags({ data: { accountId: gtmAccountId, containerId: gtmContainerId } })))}>Ver tags e gatilhos</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Account ID</Label><Input value={gtmAccountId} onChange={(e) => setGtmAccountId(e.target.value)} placeholder="1234567890" /></div><div className="space-y-1"><Label>Container ID</Label><Input value={gtmContainerId} onChange={(e) => setGtmContainerId(e.target.value)} placeholder="1234567" /></div></div>
              {gtmAccounts.length > 0 && <div className="space-y-1">{gtmAccounts.map((a) => <button key={a.accountId} type="button" onClick={() => setGtmAccountId(a.accountId)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${gtmAccountId === a.accountId ? "border-primary bg-primary/5" : "border-border"}`}><span>{a.name}</span><span className="text-xs text-muted-foreground">{a.accountId}</span></button>)}</div>}
              {gtmContainers.length > 0 && <div className="space-y-1">{gtmContainers.map((c) => <button key={c.containerId} type="button" onClick={() => setGtmContainerId(c.containerId)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${gtmContainerId === c.containerId ? "border-primary bg-primary/5" : "border-border"}`}><span>{c.name}</span><span className="text-xs text-muted-foreground">{c.publicId}</span></button>)}</div>}
              {gtmTags && <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-border p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">TAGS ({gtmTags.tags.length})</p><ul className="space-y-1 text-sm">{gtmTags.tags.map((t) => <li key={t.name} className="flex justify-between gap-2"><span className={t.paused ? "line-through opacity-60" : ""}>{t.name}</span><span className="text-xs text-muted-foreground">{t.type}</span></li>)}</ul></div><div className="rounded-lg border border-border p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">GATILHOS ({gtmTags.triggers.length})</p><ul className="space-y-1 text-sm">{gtmTags.triggers.map((t) => <li key={t.name} className="flex justify-between gap-2"><span>{t.name}</span><span className="text-xs text-muted-foreground">{t.type}</span></li>)}</ul></div></div>}
            </TabsContent>

            <TabsContent value="gbp" className="space-y-4 pt-4">
              <Info>A ficha da sua empresa no Google. Carregue a conta, escolha o local e salve. Depois dá para ver quantas pessoas ligaram, pediram rota, clicaram no site, e responder avaliações sem sair do Vanessa Simoni.</Info>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={busy || !connected} onClick={() => run("Contas carregadas.", async () => setGbpAccounts((await fnGbpAccounts()).accounts))}><RefreshCw className="mr-2 h-4 w-4" /> Carregar contas</Button>
                <Button variant="outline" disabled={busy || !connected || !gbpAccount} onClick={() => run("Locais carregados.", async () => setGbpLocations((await fnGbpLocations({ data: { account: gbpAccount } })).locations))}><MapPin className="mr-2 h-4 w-4" /> Carregar locais</Button>
                <Button onClick={() => saveConfig("Local salvo.")} disabled={busy || !connected}><Save className="mr-2 h-4 w-4" /> Salvar</Button>
                <Button variant="outline" disabled={busy || !connected || !gbpLocation} onClick={() => run("Desempenho carregado.", async () => setGbpPerf(await fnGbpPerf({ data: { days: 30, location: gbpLocation } })))}><BarChart3 className="mr-2 h-4 w-4" /> Desempenho (30 dias)</Button>
                <Button variant="outline" disabled={busy || !connected || !gbpLocation} onClick={() => run("Avaliações carregadas.", async () => setReviews(await fnReviews({ data: { account: gbpAccount, location: gbpLocation } })))}><Star className="mr-2 h-4 w-4" /> Avaliações</Button>
              </div>
              {gbpAccounts.length > 0 && <div className="space-y-1">{gbpAccounts.map((a) => <button key={a.name} type="button" onClick={() => setGbpAccount(a.name)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${gbpAccount === a.name ? "border-primary bg-primary/5" : "border-border"}`}><span>{a.accountName}</span><span className="text-xs text-muted-foreground">{a.name}</span></button>)}</div>}
              {gbpLocations.length > 0 && <div className="space-y-1">{gbpLocations.map((l) => <button key={l.name} type="button" onClick={() => setGbpLocation(l.name)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${gbpLocation === l.name ? "border-primary bg-primary/5" : "border-border"}`}><span>{l.title}</span><span className="text-xs text-muted-foreground">{l.address}</span></button>)}</div>}
              {gbpPerf && <div className="grid grid-cols-2 gap-2 sm:grid-cols-5"><Kpi label="Visualizações" value={num(gbpPerf.impressions)} /><Kpi label="Ligações" value={num(gbpPerf.calls)} /><Kpi label="Cliques no site" value={num(gbpPerf.websiteClicks)} /><Kpi label="Rotas" value={num(gbpPerf.directions)} /><Kpi label="Conversas" value={num(gbpPerf.conversations)} /></div>}
              {reviews && <div className="space-y-2"><p className="text-sm text-muted-foreground">Nota média {num(reviews.averageRating)} · {reviews.total} avaliações</p>{reviews.reviews.map((r) => <div key={r.id} className="rounded-lg border border-border p-3 text-sm"><div className="flex justify-between gap-2"><b>{r.author}</b><span className="text-xs text-muted-foreground">{r.rating}</span></div><p className="mt-1 text-muted-foreground">{r.comment}</p>{r.reply ? <p className="mt-2 rounded bg-muted/50 p-2 text-xs">Sua resposta: {r.reply}</p> : replyTo === r.id ? <div className="mt-2 space-y-2"><Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={2} placeholder="Escreva sua resposta" /><div className="flex gap-2"><Button size="sm" disabled={busy || !replyText.trim()} onClick={() => run("Resposta publicada.", async () => { await fnReply({ data: { reviewId: r.id, comment: replyText.trim() } }); setReplyTo(null); setReplyText(""); setReviews(await fnReviews({ data: { account: gbpAccount, location: gbpLocation } })); })}>Responder</Button><Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>Cancelar</Button></div></div> : <Button size="sm" variant="outline" className="mt-2" onClick={() => { setReplyTo(r.id); setReplyText(""); }}>Responder</Button>}</div>)}</div>}
            </TabsContent>

            <TabsContent value="merchant" className="space-y-4 pt-4">
              <Info>
                A Vanessa Simoni descobre automaticamente as contas Merchant Center acessíveis pela mesma Conta Google autorizada. Selecione a conta, salve e carregue os produtos. O Merchant ID manual fica apenas como fallback técnico.
              </Info>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy || !connected}
                  onClick={() =>
                    run("Contas Merchant carregadas.", async () =>
                      setMerchantAccounts((await fnMerchantAccounts()).accounts),
                    )
                  }
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Carregar contas
                </Button>
                <Button onClick={() => saveConfig("Conta Merchant salva.")} disabled={busy || !connected || !merchantId}>
                  <Save className="mr-2 h-4 w-4" /> Salvar
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !connected || !merchantId}
                  onClick={() =>
                    run("Produtos carregados.", async () =>
                      setProducts((await fnProducts({ data: { merchantId } })).products),
                    )
                  }
                >
                  <ShoppingBag className="mr-2 h-4 w-4" /> Carregar produtos
                </Button>
              </div>
              {merchantAccounts.length > 0 && (
                <div className="space-y-1">
                  {merchantAccounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setMerchantId(account.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${merchantId === account.id ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      <span>{account.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {account.id}{account.testAccount ? " · teste" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                <Label>Merchant ID (fallback)</Label>
                <Input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder="Selecione uma conta acima" />
              </div>
              {products.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr><th className="p-2 text-left">Produto</th><th className="p-2 text-right">Preço</th><th className="p-2 text-right">Disponibilidade</th></tr>
                    </thead>
                    <tbody>
                      {products.map((p) => <tr key={p.id} className="border-t border-border"><td className="p-2">{p.title}</td><td className="p-2 text-right">{p.price}</td><td className="p-2 text-right">{p.availability}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

export default GoogleConnectPanel;
