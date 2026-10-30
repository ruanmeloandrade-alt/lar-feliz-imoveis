import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Trash2, Loader2, Users, Copy, Sparkles, AlertCircle, X, Search, Upload, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listPersonas } from "@/lib/meta-personas.functions";
import { listStrategies } from "@/lib/meta-strategies.functions";
import {
  listAudiences, createAudience, createLookalike,
  deleteAudience, refreshAudienceStats, syncAudiencesFromMeta,
  listAudienceAssets, listAvailableVideos, listPageLeadForms,
  listPageCanvases, listPageEvents, listCatalogProductSets,
  searchGeoCountries, uploadCustomerListChunk,
  AUDIENCE_TYPES,
} from "@/lib/meta-audiences.functions";

type AudienceType = (typeof AUDIENCE_TYPES)[number];

const TYPE_LABELS: Record<AudienceType, string> = {
  website: "Site (Pixel)",
  customer_list: "Lista de clientes (CSV)",
  catalog: "Catálogo",
  video: "Vídeo, visualizações",
  lead_form: "Formulário (Lead Ads)",
  instant_experience: "Experiência instant-nea",
  shopping: "Compras (Loja do Facebook/IG)",
  engagement_ig: "Perfil do Instagram",
  events: "Eventos do Facebook",
  engagement_page: "Página do Facebook",
  marketplace: "Classificados / Marketplace listings",
  lookalike: "Lookalike (LAL)",
  saved: "Público salvo",
};

const SIMPLE_TYPES: AudienceType[] = ["website", "engagement_ig", "lead_form", "customer_list"];

const CREATABLE_TYPES: AudienceType[] = [
  "website", "customer_list", "catalog", "video", "lead_form", "instant_experience",
  "shopping", "engagement_ig", "events", "engagement_page", "marketplace",
];

const SPECIAL_AD_CATEGORIES: Array<{ v: string; l: string }> = [
  { v: "NONE", l: "Nenhuma" },
  { v: "HOUSING", l: "Habitação" },
  { v: "EMPLOYMENT", l: "Emprego" },
  { v: "CREDIT", l: "Crédito" },
  { v: "ISSUES_ELECTIONS_POLITICS", l: "Política/Eleições" },
];

// SHA-256 hex minúsculo para hashing PII antes de subir para o Meta.
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(v: string) { return v.trim().toLowerCase(); }
function normalizePhone(v: string) { return v.replace(/\D+/g, ""); }
function normalizeName(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

type Form = {
  name: string;
  description: string;
  type: AudienceType;
  retentionDays: number;
  pixelId: string;
  urlContains: string;
  mode: "all_visitors" | "url_contains" | "event";
  eventName: string;
  prefill: boolean;
  specialAdCategory: string;
  pageId: string;
  igId: string;
  catalogId: string;
  productSetId: string;
  videoSource: "page" | "instagram" | "ad_account";
  videoSourceId: string;
  videoIds: string[];
  percent: 25 | 50 | 75 | 95 | 100;
  formIds: string[];
  canvasId: string;
  eventId: string;
  action: string;
  customerFile: File | null;
  customerFileSource: "USER_PROVIDED_ONLY" | "PARTNER_PROVIDED_ONLY" | "BOTH_USER_AND_PARTNER_PROVIDED";
};

const defaultForm: Form = {
  name: "", description: "",
  type: "website", retentionDays: 30,
  pixelId: "", urlContains: "", mode: "all_visitors", eventName: "PageView",
  prefill: true, specialAdCategory: "NONE",
  pageId: "", igId: "", catalogId: "", productSetId: "",
  videoSource: "ad_account", videoSourceId: "",
  videoIds: [], percent: 25,
  formIds: [], canvasId: "", eventId: "",
  action: "page_engaged",
  customerFile: null, customerFileSource: "USER_PROVIDED_ONLY",
};

export function MetaAudiencesPanel({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listAudiences);
  const createFn = useServerFn(createAudience);
  const lalFn = useServerFn(createLookalike);
  const delFn = useServerFn(deleteAudience);
  const refreshFn = useServerFn(refreshAudienceStats);
  const syncFn = useServerFn(syncAudiencesFromMeta);
  const assetsFn = useServerFn(listAudienceAssets);
  const videosFn = useServerFn(listAvailableVideos);
  const formsFn = useServerFn(listPageLeadForms);
  const canvasesFn = useServerFn(listPageCanvases);
  const eventsFn = useServerFn(listPageEvents);
  const productSetsFn = useServerFn(listCatalogProductSets);
  const uploadCustomerFn = useServerFn(uploadCustomerListChunk);
  const personasFn = useServerFn(listPersonas);
  const strategiesFn = useServerFn(listStrategies);

  const [accountId, setAccountId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [guideContext, setGuideContext] = useState<string>("");
  const [form, setForm] = useState<Form>(defaultForm);
  const [lalOpen, setLalOpen] = useState<null | { standalone: boolean; audienceId: string; name: string }>(null);
  const [lalForm, setLalForm] = useState<{
    name: string;
    countries: Array<{ code: string; name: string }>;
    splits: Array<{ start: number; end: number }>;
  }>({ name: "", countries: [{ code: "BR", name: "Brasil" }], splits: [{ start: 0, end: 1 }] });
  const [countryQuery, setCountryQuery] = useState("");
  const searchCountriesFn = useServerFn(searchGeoCountries);
  const countriesQ = useQuery({
    queryKey: ["meta-geo-countries", workspaceId, countryQuery],
    queryFn: () => searchCountriesFn({ data: { workspaceId, query: countryQuery } }),
    enabled: !!lalOpen && countryQuery.trim().length >= 2,
    staleTime: 60_000,
  });

  const accountsQ = useQuery({
    queryKey: ["meta-accts-for-audiences", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("meta_ad_accounts")
        .select("account_id,name,currency").eq("workspace_id", workspaceId).order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ account_id: string; name: string | null; currency: string | null }>;
    },
  });

  const personasQ = useQuery({
    queryKey: ["audience-personas", workspaceId],
    queryFn: () => personasFn({ data: { workspaceId } }),
  });
  const strategiesQ = useQuery({
    queryKey: ["audience-strategies", workspaceId],
    queryFn: () => strategiesFn({ data: { workspaceId } }),
  });

  const guideOptions = useMemo(() => [
    ...((personasQ.data ?? []) as Array<{ id: string; name: string; ad_account_id?: string | null }>).map((p) => ({
      value: `persona:${p.id}`, label: `Persona · ${p.name}`, accountId: p.ad_account_id ?? null, name: p.name,
    })),
    ...((strategiesQ.data ?? []) as Array<{ id: string; name: string; ad_account_id?: string | null }>).map((st) => ({
      value: `strategy:${st.id}`, label: `Estratégia · ${st.name}`, accountId: st.ad_account_id ?? null, name: st.name,
    })),
  ], [personasQ.data, strategiesQ.data]);

  const applyGuideContext = (value: string) => {
    setGuideContext(value);
    const ctx = guideOptions.find((o) => o.value === value);
    if (!ctx) return;
    if (ctx.accountId) setAccountId(ctx.accountId);
    setForm((f) => ({
      ...f,
      name: f.name || `${ctx.name} · público`,
      description: f.description || `Público guiado a partir de ${ctx.label}. Revise a fonte antes de criar.`,
    }));
  };

  const applyQuickType = (type: AudienceType) => {
    const labels: Partial<Record<AudienceType, string>> = {
      website: "Visitantes do site",
      engagement_ig: "Engajados no Instagram",
      lead_form: "Leads de formulário",
      customer_list: "Lista de clientes",
    };
    setForm((f) => ({
      ...f,
      type,
      name: f.name || labels[type] || "Novo público",
      retentionDays: type === "website" ? 30 : f.retentionDays,
    }));
  };

  // Seleciona a primeira conta de anúncio automaticamente pra já disparar o
  // sync dos públicos existentes no gerenciador do cliente.
  useEffect(() => {
    if (!accountId && accountsQ.data && accountsQ.data.length > 0) {
      setAccountId(accountsQ.data[0].account_id);
    }
  }, [accountsQ.data, accountId]);

  // Puxa a lista de públicos, chamando sync do Meta automaticamente na primeira
  // vez que a conta é vista neste workspace, assim, se o cliente já tinha
  // públicos prontos no gerenciador de anúncios dele, eles aparecem sozinhos.
  const audQ = useQuery({
    queryKey: ["meta-audiences", workspaceId, accountId],
    queryFn: async () => {
      if (accountId) {
        try { await syncFn({ data: { workspaceId, adAccountId: accountId } }); }
        catch (e) { console.warn("[audiences] auto-sync falhou:", (e as Error).message); }
      }
      return listFn({ data: { workspaceId, adAccountId: accountId || undefined } });
    },
    staleTime: 60_000,
    // Sincronização automática de tamanho: refaz a query a cada 5 minutos quando
    // a aba está aberta, disparando o sync com o Meta e o refresh de contagens.
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });

  const assetsQ = useQuery({
    queryKey: ["audience-assets", workspaceId, accountId],
    queryFn: () => assetsFn({ data: { workspaceId, adAccountId: accountId } }),
    enabled: !!accountId && open,
  });

  const pageId = form.pageId;
  const catalogId = form.catalogId;

  const videosQ = useQuery({
    queryKey: ["audience-videos", workspaceId, form.videoSource, form.videoSourceId, accountId],
    queryFn: () => videosFn({
      data: {
        workspaceId,
        source: form.videoSource,
        sourceId: form.videoSource === "ad_account" ? (form.videoSourceId || accountId) : form.videoSourceId,
      },
    }),
    enabled: form.type === "video" && !!(form.videoSource === "ad_account" ? (form.videoSourceId || accountId) : form.videoSourceId),
  });
  const formsQ = useQuery({
    queryKey: ["audience-page-forms", workspaceId, pageId],
    queryFn: () => formsFn({ data: { workspaceId, pageId } }),
    enabled: !!pageId && form.type === "lead_form",
  });
  const canvasesQ = useQuery({
    queryKey: ["audience-page-canvases", workspaceId, pageId],
    queryFn: () => canvasesFn({ data: { workspaceId, pageId } }),
    enabled: !!pageId && form.type === "instant_experience",
  });
  const eventsQ = useQuery({
    queryKey: ["audience-page-events", workspaceId, pageId],
    queryFn: () => eventsFn({ data: { workspaceId, pageId } }),
    enabled: !!pageId && form.type === "events",
  });
  const productSetsQ = useQuery({
    queryKey: ["audience-catalog-sets", workspaceId, catalogId],
    queryFn: () => productSetsFn({ data: { workspaceId, catalogId } }),
    enabled: !!catalogId && form.type === "catalog",
  });

  // Auto-seleciona primeiro pixel/página/IG/catálogo quando os assets carregam.
  useEffect(() => {
    const a = assetsQ.data;
    if (!a) return;
    setForm((f) => {
      const next = { ...f };
      if (!next.pixelId && a.pixels[0]) next.pixelId = a.pixels[0].id;
      if (!next.pageId && a.pages[0]) next.pageId = a.pages[0].id;
      if (!next.igId && a.instagram[0]) next.igId = a.instagram[0].id;
      if (!next.catalogId && a.catalogs[0]) next.catalogId = a.catalogs[0].id;
      return next;
    });
  }, [assetsQ.data]);

  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error("Selecione uma conta de anúncio.");
      const config: Record<string, unknown> = { retentionDays: form.retentionDays };
      if (form.specialAdCategory && form.specialAdCategory !== "NONE") {
        config.specialAdCategory = form.specialAdCategory;
      }
      let customerRows: Array<Record<string, string>> | null = null;
      let customerSchema: string[] | null = null;
      switch (form.type) {
        case "website":
          if (!form.pixelId) throw new Error("Selecione um Pixel.");
          config.pixelId = form.pixelId;
          config.mode = form.mode;
          config.urlContains = form.urlContains;
          config.eventName = form.eventName;
          config.prefill = form.prefill;
          break;
        case "customer_list": {
          if (!form.customerFile) throw new Error("Selecione um arquivo CSV com sua lista.");
          config.customer_file_source = form.customerFileSource;
          const parsed = await parseAndHashCustomerCsv(form.customerFile);
          if (!parsed.rows.length) throw new Error("O CSV não tem linhas válidas (defina pelo menos email ou telefone).");
          customerRows = parsed.rows;
          customerSchema = parsed.schema;
          break;
        }
        case "video":
          if (!form.videoIds.length) throw new Error("Selecione ao menos 1 vídeo.");
          config.videoIds = form.videoIds;
          config.percent = form.percent;
          break;
        case "engagement_page":
          if (!form.pageId) throw new Error("Selecione uma página.");
          config.pageId = form.pageId; config.action = form.action; break;
        case "engagement_ig":
          if (!form.igId) throw new Error("Selecione uma conta do Instagram.");
          config.igId = form.igId; config.action = form.action; break;
        case "lead_form":
          if (!form.formIds.length && !form.pageId) throw new Error("Selecione um formulário ou uma página.");
          config.formIds = form.formIds; config.pageId = form.pageId; config.action = form.action || "leadgen_form_submit"; break;
        case "catalog":
          if (!form.productSetId) throw new Error("Selecione um conjunto de produtos.");
          config.productSetId = form.productSetId; config.action = form.action || "AddToCart"; break;
        case "instant_experience":
          if (!form.canvasId) throw new Error("Selecione uma experiência instant-nea.");
          config.canvasId = form.canvasId; config.action = form.action || "canvas_opened"; break;
        case "shopping":
          if (!form.pageId) throw new Error("Selecione a página com loja.");
          config.pageId = form.pageId; config.action = form.action || "shop_view"; break;
        case "events":
          if (!form.eventId) throw new Error("Selecione um evento.");
          config.eventId = form.eventId; config.action = "event_responded"; break;
        case "marketplace":
          if (!form.pageId) throw new Error("Selecione uma página.");
          config.pageId = form.pageId; config.action = "marketplace_view"; break;
      }
      const created = await createFn({
        data: {
          workspaceId, adAccountId: accountId,
          name: form.name, description: form.description || undefined,
          type: form.type, retentionDays: form.retentionDays, config,
        },
      });

      // Upload em chunks de 5.000 linhas após criar o público CUSTOM.
      if (form.type === "customer_list" && customerRows && customerSchema) {
        const audienceMetaId = (created?.audience as { audience_id?: string } | undefined)?.audience_id;
        if (!audienceMetaId) throw new Error("Público criado, mas ID do Meta não retornou. Reimporte manualmente.");
        const CHUNK = 5000;
        setUploadProgress({ done: 0, total: customerRows.length });
        for (let i = 0; i < customerRows.length; i += CHUNK) {
          const slice = customerRows.slice(i, i + CHUNK);
          await uploadCustomerFn({
            data: {
              workspaceId,
              audienceId: audienceMetaId,
              users: slice as never,
              schema: customerSchema,
            },
          });
          setUploadProgress({ done: Math.min(i + CHUNK, customerRows.length), total: customerRows.length });
        }
        setUploadProgress(null);
      }
    },
    onSuccess: () => {
      toast.success("Público criado.");
      setOpen(false); setForm(defaultForm); setUploadProgress(null);
      qc.invalidateQueries({ queryKey: ["meta-audiences", workspaceId] });
    },
    onError: (e: Error) => { setUploadProgress(null); toast.error(e.message); },
  });

  const defaultLalForm = { name: "", countries: [{ code: "BR", name: "Brasil" }], splits: [{ start: 0, end: 1 }] };

  const lalMut = useMutation({
    mutationFn: async () => {
      if (!lalOpen) return { created: 0 };
      if (!accountId) throw new Error("Selecione uma conta de anúncio.");
      if (!lalOpen.audienceId) throw new Error("Escolha o público de origem.");
      if (lalForm.countries.length === 0) throw new Error("Adicione ao menos um país.");
      if (lalForm.splits.length === 0) throw new Error("Configure ao menos uma faixa de similaridade.");
      for (const s of lalForm.splits) {
        if (!(s.end > s.start) || s.start < 0 || s.end > 10) {
          throw new Error("Faixas inválidas. Use valores entre 0% e 10% e mantenha início < fim.");
        }
      }
      const originName = lalOpen.name || audiences.find((a) => a.audience_id === lalOpen.audienceId)?.name || "público";
      let created = 0;
      for (const c of lalForm.countries) {
        for (const s of lalForm.splits) {
          const startingRatio = s.start / 100;
          const ratio = s.end / 100;
          const rangeLabel = s.start > 0 ? `${s.start}-${s.end}%` : `${s.end}%`;
          const label = lalForm.name?.trim()
            ? `${lalForm.name.trim()} · ${c.code} · ${rangeLabel}`
            : `LAL ${rangeLabel} ${c.code} · ${originName}`;
          await lalFn({
            data: {
              workspaceId, adAccountId: accountId,
              name: label,
              originAudienceId: lalOpen.audienceId,
              countries: [c.code],
              ratio,
              ...(s.start > 0 ? { startingRatio } : {}),
            },
          });
          created += 1;
        }
      }
      return { created };
    },
    onSuccess: (r) => {
      toast.success(`${r?.created ?? 1} público(s) semelhante(s) criado(s).`);
      setLalOpen(null);
      qc.invalidateQueries({ queryKey: ["meta-audiences", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { workspaceId, id } }),
    onSuccess: () => { toast.success("Público removido."); qc.invalidateQueries({ queryKey: ["meta-audiences", workspaceId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshMut = useMutation({
    mutationFn: (id: string) => refreshFn({ data: { workspaceId, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meta-audiences", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const syncMut = useMutation({
    mutationFn: () => {
      if (!accountId) throw new Error("Selecione uma conta.");
      return syncFn({ data: { workspaceId, adAccountId: accountId } });
    },
    onSuccess: (r) => { toast.success(`${r.synced} públicos sincronizados.`); qc.invalidateQueries({ queryKey: ["meta-audiences", workspaceId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const audiences = audQ.data?.audiences ?? [];
  const accountOptions = accountsQ.data ?? [];
  const assets = assetsQ.data;

  const configFields = useMemo(() => renderConfigFields({
    form, setForm, assets, accountId,
    videos: videosQ.data?.videos ?? [], videosLoading: videosQ.isFetching,
    videosError: videosQ.error instanceof Error ? videosQ.error.message : null,
    videosWarnings: videosQ.data?.warnings ?? [],
    forms: formsQ.data?.forms ?? [], formsLoading: formsQ.isFetching,
    canvases: canvasesQ.data?.canvases ?? [], canvasesLoading: canvasesQ.isFetching,
    events: eventsQ.data?.events ?? [], eventsLoading: eventsQ.isFetching,
    productSets: productSetsQ.data?.productSets ?? [], productSetsLoading: productSetsQ.isFetching,
  }), [form, assets, accountId, videosQ.data, videosQ.error, videosQ.isFetching, formsQ.data, formsQ.isFetching, canvasesQ.data, canvasesQ.isFetching, eventsQ.data, eventsQ.isFetching, productSetsQ.data, productSetsQ.isFetching]);

  const isEmpty = !audQ.isLoading && audiences.length === 0;
  const toolbar = (
    <div className={`flex flex-wrap items-end gap-2 ${isEmpty ? "justify-center" : "justify-end"}`}>
      <div>
        <Label className="text-[10px]">Conta de anúncio</Label>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
          className="w-64 h-9 px-2 rounded-md border border-border bg-background text-sm">
          <option value="">Todas as contas</option>
          {accountOptions.map((a) => <option key={a.account_id} value={a.account_id}>{a.name || a.account_id}</option>)}
        </select>
      </div>
      <Button variant="outline" size="sm" disabled={!accountId || syncMut.isPending} onClick={() => syncMut.mutate()}>
        {syncMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        Sincronizar do Meta
      </Button>
      <Button size="sm" disabled={!accountId} onClick={() => { setForm(defaultForm); setGuideContext(""); setShowAdvanced(false); setOpen(true); }}>
        <Plus className="w-3.5 h-3.5" /> Criar público
      </Button>
      <Button size="sm" variant="secondary" disabled={!accountId}
        onClick={() => { setLalOpen({ standalone: true, audienceId: "", name: "" }); setLalForm(defaultLalForm); }}>
        <Sparkles className="w-3.5 h-3.5" /> Novo semelhante
      </Button>
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {audQ.isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando…</div>
      ) : isEmpty ? (
        <div className="py-8 flex flex-col items-center gap-3">
          <Users className="w-8 h-8 text-muted-foreground" />
          <div className="text-sm text-muted-foreground text-center">Nenhum público ainda. Sincronize do Meta ou crie um novo.</div>
          {toolbar}
        </div>
      ) : (
        <>
          {toolbar}
        <div className="divide-y divide-border">
          {audiences.map((a) => {
            const small = a.approximate_count != null && Number(a.approximate_count) > 0 && Number(a.approximate_count) < 1000;
            return (
            <div key={a.id} className="py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-2">
                  {a.name}
                  {small && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-medium">
                      <AlertTriangle className="w-3 h-3" /> Público pequeno
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {TYPE_LABELS[a.audience_type as AudienceType] ?? a.audience_type} · {a.subtype ?? "-"}
                  {a.retention_days ? ` · ${a.retention_days}d` : ""}
                  {a.approximate_count != null ? ` · ~${Number(a.approximate_count).toLocaleString("pt-BR")} pessoas` : ""}
                  {a.delivery_status ? ` · ${a.delivery_status}` : ""}
                  {a.origin && a.origin !== "manual" ? ` · origem: ${a.origin}` : ""}
                </div>
                {small && (
                  <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                    Menos de 1.000 pessoas, o Meta pode não entregar anúncios. LAL exige ao menos 100 pessoas do país-alvo.
                  </div>
                )}
              </div>
              <button className="p-1.5 rounded hover:bg-muted" title="Atualizar tamanho"
                disabled={refreshMut.isPending} onClick={() => refreshMut.mutate(a.id)}>
                {refreshMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </button>
              {a.audience_type !== "lookalike" && (
                <button className="p-1.5 rounded hover:bg-muted inline-flex items-center gap-1 text-[11px] font-medium" title="Criar semelhante a partir deste público"
                  onClick={() => { setLalOpen({ standalone: false, audienceId: a.audience_id, name: a.name }); setLalForm(defaultLalForm); }}>
                  <Copy className="w-3.5 h-3.5" /> LAL
                </button>
              )}
              <button className="p-1.5 rounded hover:bg-muted text-destructive" title="Excluir"
                onClick={() => { if (confirm(`Excluir público "${a.name}"?`)) delMut.mutate(a.id); }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            );
          })}
        </div>
        </>
      )}

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo público</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
              <div>
                <div className="text-sm font-semibold">Criação guiada</div>
                <div className="text-[11px] text-muted-foreground">Comece pelo objetivo do público. Persona/Estratégia ajudam a escolher a conta e nomear o contexto; o Vanessa Simoni não inventa targeting nem altera públicos já sincronizados.</div>
              </div>
              <select
                value={guideContext}
                onChange={(e) => applyGuideContext(e.target.value)}
                className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
              >
                <option value="">Sem Persona/Estratégia</option>
                {guideOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                {SIMPLE_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => applyQuickType(type)}
                    className={`rounded-md border px-2 py-2 text-left text-xs hover:border-primary/60 ${form.type === type ? "border-primary bg-background" : "border-border bg-card"}`}
                  >
                    <div className="font-semibold">{TYPE_LABELS[type]}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Usar fluxo simples</div>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">Públicos já sincronizados continuam disponíveis para reutilização sem recriar.</span>
                <button type="button" className="text-[11px] font-semibold text-primary hover:underline" onClick={() => setShowAdvanced((v) => !v)}>
                  {showAdvanced ? "Ocultar avançados" : "Mais tipos"}
                </button>
              </div>
            </div>
            {assetsQ.isFetching && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Carregando ativos do Meta…
              </div>
            )}
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Visitantes 30d" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-[2fr_1fr] gap-2">
              <div>
                <Label>Tipo</Label>
                <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
                  value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AudienceType })}>
                  {(showAdvanced ? CREATABLE_TYPES : SIMPLE_TYPES).map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Retenção (dias)</Label>
                <Input type="number" min={1} max={180} value={form.retentionDays}
                  onChange={(e) => setForm({ ...form, retentionDays: Number(e.target.value) })} />
              </div>
            </div>

            <div>
              <Label>Categoria especial de anúncio</Label>
              <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
                value={form.specialAdCategory}
                onChange={(e) => setForm({ ...form, specialAdCategory: e.target.value })}>
                {SPECIAL_AD_CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Marque quando o público for usado em campanhas de habitação, emprego, crédito ou política. O Meta restringe segmentação e LAL nessas categorias.
              </p>
            </div>

            {configFields}

            {uploadProgress && (
              <div className="text-[11px] text-muted-foreground border border-border rounded-md p-2">
                Enviando lista para o Meta… {uploadProgress.done.toLocaleString("pt-BR")} / {uploadProgress.total.toLocaleString("pt-BR")}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              Após criar, o Meta leva alguns minutos pra popular o público. Use <b>Atualizar tamanho</b> pra ver o resultado.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={createMut.isPending || !form.name.trim()} onClick={() => createMut.mutate()}>
              {createMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />} Criar público
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lookalike (público semelhante) dialog */}
      <Dialog open={!!lalOpen} onOpenChange={(v) => { if (!v) setLalOpen(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Novo público semelhante</DialogTitle></DialogHeader>
          {lalOpen && (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">
                Um público <b>semelhante</b> (lookalike) é montado pelo Meta a partir de um público personalizado existente,
                encontrando pessoas com comportamento parecido.
              </p>
              {lalOpen.standalone ? (
                <div>
                  <Label>Público de origem</Label>
                  <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
                    value={lalOpen.audienceId}
                    onChange={(e) => {
                      const picked = audiences.find((a) => a.audience_id === e.target.value);
                      setLalOpen({ standalone: true, audienceId: e.target.value, name: picked?.name ?? "" });
                    }}>
                    <option value="">Selecione um público personalizado…</option>
                    {audiences
                      .filter((a) => a.audience_type !== "lookalike")
                      .map((a) => (
                        <option key={a.audience_id} value={a.audience_id}>
                          {a.name} {a.approximate_count != null ? `· ~${Number(a.approximate_count).toLocaleString("pt-BR")}` : ""}
                        </option>
                      ))}
                  </select>
                  {audiences.filter((a) => a.audience_type !== "lookalike").length === 0 && (
                    <p className="text-[11px] text-amber-600 mt-1">Crie primeiro um público personalizado.</p>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Origem: <b>{lalOpen.name}</b></div>
              )}
              <div>
                <Label>Nome</Label>
                <Input value={lalForm.name} placeholder={`LAL · ${lalOpen.name || "público de origem"}`}
                  onChange={(e) => setLalForm({ ...lalForm, name: e.target.value })} />
              </div>
              <div>
                <Label>Localização do público</Label>
                <div className="flex flex-wrap gap-1.5 my-1.5">
                  {lalForm.countries.map((c) => (
                    <span key={c.code} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[11px]">
                      {c.name} <span className="opacity-60">({c.code})</span>
                      <button type="button" className="hover:opacity-80"
                        onClick={() => setLalForm({ ...lalForm, countries: lalForm.countries.filter((x) => x.code !== c.code) })}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {lalForm.countries.length === 0 && <span className="text-[11px] text-muted-foreground">Nenhum país selecionado.</span>}
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-7" placeholder="Buscar país (ex: Brasil, United States)…"
                    value={countryQuery} onChange={(e) => setCountryQuery(e.target.value)} />
                </div>
                {countryQuery.trim().length >= 2 && (
                  <div className="mt-1 border border-border rounded-md max-h-40 overflow-y-auto bg-popover">
                    {countriesQ.isLoading && <div className="px-2 py-1.5 text-[11px] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Buscando…</div>}
                    {countriesQ.data?.countries.map((c) => {
                      const already = lalForm.countries.some((x) => x.code === c.code);
                      return (
                        <button key={c.code} type="button" disabled={already}
                          className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
                          onClick={() => {
                            setLalForm({ ...lalForm, countries: [...lalForm.countries, { code: c.code, name: c.name }] });
                            setCountryQuery("");
                          }}>
                          {c.name} <span className="text-muted-foreground">({c.code})</span>{already ? " · adicionado" : ""}
                        </button>
                      );
                    })}
                    {countriesQ.data && countriesQ.data.countries.length === 0 && !countriesQ.isLoading && (
                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Nenhum país encontrado.</div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <Label>Selecione o tamanho do público</Label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Número de públicos semelhantes</span>
                  <select
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                    value={lalForm.splits.length}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const top = Math.max(n, lalForm.splits[lalForm.splits.length - 1]?.end ?? n);
                      // divide 0..top em N faixas contíguas com endpoints inteiros
                      const raw = Array.from({ length: n }, (_, i) => Math.round(((i + 1) * top) / n));
                      // garante monotonicidade estrita
                      for (let i = 1; i < raw.length; i++) if (raw[i] <= raw[i - 1]) raw[i] = raw[i - 1] + 1;
                      const next = raw.map((end, i) => ({ start: i === 0 ? 0 : raw[i - 1], end: Math.min(10, end) }));
                      setLalForm({ ...lalForm, splits: next });
                    }}
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>

                {/* Slider Meta-style: track 0..10% com handles inteiros contíguos */}
                <LalRangeSlider
                  splits={lalForm.splits}
                  onChange={(splits) => setLalForm({ ...lalForm, splits })}
                />

                <div className="mt-3 rounded-md border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground flex gap-2">
                  <span>ⓘ</span>
                  <span>
                    O <b>{lalForm.splits[0]?.end ?? 1}%</b> semelhante consiste nas pessoas mais semelhantes à sua fonte.
                    Aumentar a porcentagem cria um público maior e mais amplo.
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Serão criados <b>{lalForm.countries.length * lalForm.splits.length}</b> público(s) semelhante(s)
                ({lalForm.countries.length} país{lalForm.countries.length > 1 ? "es" : ""} × {lalForm.splits.length} faixa{lalForm.splits.length > 1 ? "s" : ""}).
              </p>

            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLalOpen(null)}>Cancelar</Button>
            <Button disabled={lalMut.isPending || !lalOpen?.audienceId} onClick={() => lalMut.mutate()}>
              {lalMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />} Criar semelhante
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Assets = {
  pixels: Array<{ id: string; name: string | null }>;
  pages: Array<{ id: string; name: string | null }>;
  instagram: Array<{ id: string; username: string | null; page_id: string; page_name: string | null }>;
  catalogs: Array<{ id: string; name: string | null }>;
} | undefined;

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-md p-2">
      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {text}
    </div>
  );
}

function EmptyVideoState({ text }: { text: string }) {
  return (
    <div className="mt-2 rounded-md border border-dashed border-border bg-muted/30 p-4 overflow-hidden">
      <div className="relative h-20 rounded-md bg-background/70 border border-border flex items-center justify-center">
        <div className="absolute inset-x-6 top-4 h-2 rounded-full bg-muted animate-pulse" />
        <div className="absolute inset-x-10 top-9 h-2 rounded-full bg-muted animate-pulse [animation-delay:150ms]" />
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-10 h-7 rounded border border-border bg-muted/60 animate-pulse [animation-delay:300ms]" />
        <div className="w-8 h-8 rounded-full border border-border bg-background flex items-center justify-center text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2 text-center">{text}</p>
    </div>
  );
}

function renderConfigFields(opts: {
  form: Form; setForm: (f: Form) => void; assets: Assets; accountId: string;
  videos: Array<{ id: string; title: string; thumbnail?: string | null; source?: string; origin?: string; created_time?: string | null }>;
  videosLoading: boolean; videosError: string | null; videosWarnings: string[];
  forms: Array<{ id: string; name: string; status: string | null }>; formsLoading: boolean;
  canvases: Array<{ id: string; name: string }>; canvasesLoading: boolean;
  events: Array<{ id: string; name: string; start_time: string | null }>; eventsLoading: boolean;
  productSets: Array<{ id: string; name: string }>; productSetsLoading: boolean;
}) {
  const { form, setForm, assets, accountId } = opts;
  const pixels = assets?.pixels ?? [];
  const pages = assets?.pages ?? [];
  const igAccts = assets?.instagram ?? [];
  const catalogs = assets?.catalogs ?? [];

  const PageSelect = (
    <div>
      <Label>Página do Facebook</Label>
      <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
        value={form.pageId} onChange={(e) => setForm({ ...form, pageId: e.target.value })}>
        <option value="">Selecione…</option>
        {pages.map((p) => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
      </select>
      {!pages.length && <EmptyHint text="Nenhuma página encontrada no Business Manager conectado." />}
    </div>
  );

  if (form.type === "website") {
    return (
      <div className="space-y-2">
        <div>
          <Label>Pixel</Label>
          <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
            value={form.pixelId} onChange={(e) => setForm({ ...form, pixelId: e.target.value })}>
            <option value="">Selecione…</option>
            {pixels.map((p) => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
          </select>
          {!pixels.length && <EmptyHint text="Nenhum Pixel encontrado nessa conta de anúncio." />}
        </div>
        <div>
          <Label>Modo</Label>
          <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
            value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as Form["mode"] })}>
            <option value="all_visitors">Todos os visitantes</option>
            <option value="url_contains">URL contém…</option>
            <option value="event">Evento do Pixel…</option>
          </select>
        </div>
        {form.mode === "url_contains" && (
          <div>
            <Label>URL contém</Label>
            <Input value={form.urlContains} onChange={(e) => setForm({ ...form, urlContains: e.target.value })} placeholder="/checkout" />
          </div>
        )}
        {form.mode === "event" && (
          <div>
            <Label>Nome do evento</Label>
            <Input value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} placeholder="Purchase, Lead, ViewContent…" />
          </div>
        )}
        <label className="flex items-start gap-2 text-xs mt-1 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={form.prefill}
            onChange={(e) => setForm({ ...form, prefill: e.target.checked })} />
          <span>
            <b>Preenchimento retroativo</b>, inclui pessoas que já dispararam o Pixel dentro da janela de retenção.
            Deixe ligado (padrão) para começar com público maior; desligue para popular só com tráfego futuro.
          </span>
        </label>
      </div>
    );
  }
  if (form.type === "customer_list") {
    return (
      <div className="space-y-2">
        <div>
          <Label>Fonte do arquivo</Label>
          <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
            value={form.customerFileSource}
            onChange={(e) => setForm({ ...form, customerFileSource: e.target.value as Form["customerFileSource"] })}>
            <option value="USER_PROVIDED_ONLY">Dados coletados diretamente pelo cliente</option>
            <option value="PARTNER_PROVIDED_ONLY">Fornecidos por parceiro</option>
            <option value="BOTH_USER_AND_PARTNER_PROVIDED">Mistos (cliente + parceiro)</option>
          </select>
        </div>
        <div>
          <Label>Arquivo CSV</Label>
          <input type="file" accept=".csv,text/csv"
            className="block w-full text-xs file:mr-2 file:h-9 file:px-3 file:rounded-md file:border file:border-border file:bg-background file:cursor-pointer"
            onChange={(e) => setForm({ ...form, customerFile: e.target.files?.[0] ?? null })} />
          {form.customerFile && (
            <p className="text-[11px] text-muted-foreground mt-1">
              <Upload className="w-3 h-3 inline mr-1" />
              {form.customerFile.name} · {(form.customerFile.size / 1024).toFixed(1)} KB
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            Cabeçalhos aceitos (primeira linha): <code>email</code>, <code>phone</code>, <code>first_name</code>, <code>last_name</code>,
            <code>city</code>, <code>state</code>, <code>zip</code>, <code>country</code>, <code>madid</code>, <code>extern_id</code>.
            Os campos PII são normalizados e criptografados (SHA-256) no seu navegador antes de subir. Nenhum dado em claro sai daqui.
          </p>
        </div>
      </div>
    );
  }
  if (form.type === "video") {
    const needsSourceId = form.videoSource !== "ad_account";
    const sourceHasId = form.videoSource === "ad_account" ? !!(form.videoSourceId || accountId) : !!form.videoSourceId;
    return (
      <div className="space-y-2">
        <div>
          <Label>Fonte do vídeo</Label>
          <select
            className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
            value={form.videoSource}
            onChange={(e) => setForm({
              ...form,
              videoSource: e.target.value as Form["videoSource"],
              videoSourceId: "",
              videoIds: [],
            })}
          >
            <option value="ad_account">Vídeos da conta de anúncio (inclui anúncios)</option>
            <option value="page">Vídeos da página do Facebook</option>
            <option value="instagram">Vídeos/Reels do Instagram</option>
          </select>
          <p className="text-[10px] text-muted-foreground mt-1">
            {form.videoSource === "ad_account" && "Traz vídeos enviados/aprovados para uso em anúncios desta conta."}
            {form.videoSource === "page" && "Traz vídeos publicados na página do Facebook selecionada."}
            {form.videoSource === "instagram" && "Traz vídeos e Reels do perfil do Instagram, recomendado apenas quando há crosspost com o Facebook."}
          </p>
        </div>

        {form.videoSource === "page" && (
          <div>
            <Label>Página</Label>
            <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
              value={form.videoSourceId} onChange={(e) => setForm({ ...form, videoSourceId: e.target.value, videoIds: [] })}>
              <option value="">Selecione…</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
            </select>
          </div>
        )}

        {form.videoSource === "instagram" && (
          <div>
            <Label>Perfil do Instagram</Label>
            <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
              value={form.videoSourceId} onChange={(e) => setForm({ ...form, videoSourceId: e.target.value, videoIds: [] })}>
              <option value="">Selecione…</option>
              {igAccts.map((ig) => <option key={ig.id} value={ig.id}>@{ig.username || ig.id}</option>)}
            </select>
          </div>
        )}

        {form.videoSource === "ad_account" && !accountId && (
          <EmptyHint text="Selecione uma conta de anúncio no topo do painel para listar os vídeos." />
        )}

        <div>
          <Label>
            Vídeos {opts.videosLoading && <Loader2 className="w-3 h-3 inline animate-spin ml-1" />}
            {opts.videos.length > 0 && <span className="text-[10px] text-muted-foreground ml-1">({opts.videos.length})</span>}
          </Label>
          {opts.videos.length > 0 ? (
            <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-auto rounded-md border border-border bg-background p-2">
              {opts.videos.map((v) => {
                const checked = form.videoIds.includes(v.id);
                return (
                  <label key={v.id} className={`flex gap-2 rounded-md border p-2 cursor-pointer transition-colors ${checked ? "border-primary bg-primary/10" : "border-border hover:bg-muted/60"}`}>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={(e) => setForm({
                        ...form,
                        videoIds: e.target.checked
                          ? Array.from(new Set([...form.videoIds, v.id]))
                          : form.videoIds.filter((id) => id !== v.id),
                      })}
                    />
                    <div className="w-16 h-12 rounded bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center">
                      {v.thumbnail ? (
                        <img src={v.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">vídeo</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium line-clamp-2">{v.title}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{v.origin || v.source || "Meta"} · {v.id}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <select multiple disabled className="w-full min-h-[140px] px-2 py-1 rounded-md border border-border bg-background text-sm opacity-60" />
          )}
          {opts.videosError && <EmptyHint text={`Erro ao buscar vídeos: ${opts.videosError}`} />}
          {!!opts.videosWarnings.length && !opts.videos.length && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Algumas fontes do Meta não liberaram leitura para este token. Tentamos biblioteca da conta, anúncios ativos/inativos e criativos.
            </p>
          )}
          {sourceHasId && !opts.videosLoading && !opts.videos.length && (
            <EmptyVideoState text={
              form.videoSource === "instagram"
                ? "Abrimos o Instagram conectado e não veio nenhum vídeo/Reel selecionável."
                : form.videoSource === "page"
                ? "Abrimos a página selecionada e não veio nenhum vídeo publicado selecionável."
                : "Abrimos biblioteca da conta, anúncios e criativos; se não aparecer nada aqui, o Meta não retornou vídeo selecionável para essa conexão."
            } />
          )}
          {needsSourceId && !sourceHasId && (
            <p className="text-[11px] text-muted-foreground mt-1">Escolha uma fonte para listar os vídeos.</p>
          )}
        </div>

        <div>
          <Label>% assistido</Label>
          <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
            value={form.percent} onChange={(e) => setForm({ ...form, percent: Number(e.target.value) as Form["percent"] })}>
            {[25, 50, 75, 95, 100].map((p) => <option key={p} value={p}>{p}%</option>)}
          </select>
        </div>
      </div>
    );
  }
  if (form.type === "engagement_page" || form.type === "shopping" || form.type === "marketplace") {
    return (
      <div className="space-y-2">
        {PageSelect}
        {form.type === "engagement_page" && (
          <div>
            <Label>Ação</Label>
            <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
              value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
              <option value="page_engaged">Qualquer interação</option>
              <option value="page_liked">Curtiu a página</option>
              <option value="post_engagement">Interagiu com um post</option>
              <option value="messaged_page">Enviou mensagem</option>
            </select>
          </div>
        )}
      </div>
    );
  }
  if (form.type === "engagement_ig") {
    return (
      <div className="space-y-2">
        <div>
          <Label>Conta do Instagram</Label>
          <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
            value={form.igId} onChange={(e) => setForm({ ...form, igId: e.target.value })}>
            <option value="">Selecione…</option>
            {igAccts.map((ig) => <option key={ig.id} value={ig.id}>@{ig.username ?? ig.id} · {ig.page_name ?? ""}</option>)}
          </select>
          {!igAccts.length && <EmptyHint text="Nenhuma conta do Instagram vinculada às páginas conectadas." />}
        </div>
        <div>
          <Label>Ação</Label>
          <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
            value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
            <option value="ig_business_profile_all">Qualquer interação</option>
            <option value="ig_business_profile_visit">Visitou o perfil</option>
            <option value="ig_business_profile_engaged">Interagiu com posts/anúncios</option>
            <option value="ig_business_profile_messaged">Enviou mensagem</option>
            <option value="ig_business_profile_ad_saved">Salvou anúncio</option>
          </select>
        </div>
      </div>
    );
  }
  if (form.type === "lead_form") {
    return (
      <div className="space-y-2">
        {PageSelect}
        <div>
          <Label>Formulários {opts.formsLoading && <Loader2 className="w-3 h-3 inline animate-spin ml-1" />}</Label>
          <select multiple className="w-full min-h-[100px] px-2 py-1 rounded-md border border-border bg-background text-sm"
            value={form.formIds}
            onChange={(e) => setForm({ ...form, formIds: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
            {opts.forms.map((f) => <option key={f.id} value={f.id}>{f.name} {f.status ? `· ${f.status}` : ""}</option>)}
          </select>
          {form.pageId && !opts.formsLoading && !opts.forms.length && <EmptyHint text="Nenhum formulário de lead nessa página." />}
          <p className="text-[10px] text-muted-foreground mt-1">Deixe sem seleção para usar todos os formulários da página.</p>
        </div>
        <div>
          <Label>Ação</Label>
          <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
            value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
            <option value="leadgen_form_submit">Enviou o formulário</option>
            <option value="leadgen_form_open">Abriu o formulário</option>
          </select>
        </div>
      </div>
    );
  }
  if (form.type === "instant_experience") {
    return (
      <div className="space-y-2">
        {PageSelect}
        <div>
          <Label>Experiência instant-nea {opts.canvasesLoading && <Loader2 className="w-3 h-3 inline animate-spin ml-1" />}</Label>
          <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
            value={form.canvasId} onChange={(e) => setForm({ ...form, canvasId: e.target.value })}>
            <option value="">Selecione…</option>
            {opts.canvases.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {form.pageId && !opts.canvasesLoading && !opts.canvases.length && <EmptyHint text="Nenhuma experiência instant-nea nessa página." />}
        </div>
      </div>
    );
  }
  if (form.type === "events") {
    return (
      <div className="space-y-2">
        {PageSelect}
        <div>
          <Label>Evento do Facebook {opts.eventsLoading && <Loader2 className="w-3 h-3 inline animate-spin ml-1" />}</Label>
          <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
            value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value })}>
            <option value="">Selecione…</option>
            {opts.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {form.pageId && !opts.eventsLoading && !opts.events.length && <EmptyHint text="Nenhum evento nessa página." />}
        </div>
      </div>
    );
  }
  if (form.type === "catalog") {
    return (
      <div className="space-y-2">
        <div>
          <Label>Catálogo</Label>
          <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
            value={form.catalogId} onChange={(e) => setForm({ ...form, catalogId: e.target.value, productSetId: "" })}>
            <option value="">Selecione…</option>
            {catalogs.map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
          </select>
          {!catalogs.length && <EmptyHint text="Nenhum catálogo encontrado no Business Manager." />}
        </div>
        <div>
          <Label>Conjunto de produtos {opts.productSetsLoading && <Loader2 className="w-3 h-3 inline animate-spin ml-1" />}</Label>
          <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
            value={form.productSetId} onChange={(e) => setForm({ ...form, productSetId: e.target.value })}>
            <option value="">Selecione…</option>
            {opts.productSets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <Label>Ação</Label>
          <select className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
            value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
            <option value="ViewContent">Visualizou produto</option>
            <option value="AddToCart">Adicionou ao carrinho</option>
            <option value="Purchase">Comprou</option>
          </select>
        </div>
      </div>
    );
  }
  return null;
}

// Parse do CSV client-side + normalização + SHA-256.
// Cabeçalhos aceitos (case-insensitive): email, phone, first_name/fn, last_name/ln,
// city/ct, state/st, zip, country, madid, extern_id.
// Retorna { rows, schema } no formato aceito pelo endpoint /users do Meta.
async function parseAndHashCustomerCsv(file: File): Promise<{
  rows: Array<Record<string, string>>;
  schema: string[];
}> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], schema: [] };

  const parseLine = (line: string): string[] => {
    // CSV simples com suporte a aspas duplas.
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === ',') { out.push(cur); cur = ""; }
        else if (ch === '"') inQ = true;
        else cur += ch;
      }
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  const headerRaw = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/["\s]/g, ""));
  const headerMap: Record<number, string> = {};
  const schemaSet = new Set<string>();
  for (let i = 0; i < headerRaw.length; i++) {
    const h = headerRaw[i];
    let key: string | null = null;
    if (h === "email" || h === "e-mail" || h === "mail") key = "EMAIL";
    else if (h === "phone" || h === "telefone" || h === "phone_number") key = "PHONE";
    else if (h === "first_name" || h === "firstname" || h === "fn" || h === "nome") key = "FN";
    else if (h === "last_name" || h === "lastname" || h === "ln" || h === "sobrenome") key = "LN";
    else if (h === "city" || h === "ct" || h === "cidade") key = "CT";
    else if (h === "state" || h === "st" || h === "estado" || h === "uf") key = "ST";
    else if (h === "zip" || h === "cep" || h === "postal_code") key = "ZIP";
    else if (h === "country" || h === "pais" || h === "país") key = "COUNTRY";
    else if (h === "madid") key = "MADID";
    else if (h === "extern_id" || h === "external_id" || h === "id") key = "EXTERN_ID";
    if (key) { headerMap[i] = key; schemaSet.add(key); }
  }
  if (!schemaSet.has("EMAIL") && !schemaSet.has("PHONE") && !schemaSet.has("MADID") && !schemaSet.has("EXTERN_ID")) {
    return { rows: [], schema: [] };
  }
  const schema = Array.from(schemaSet);

  const rows: Array<Record<string, string>> = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = parseLine(lines[li]);
    const raw: Record<string, string> = {};
    for (let i = 0; i < cols.length; i++) {
      const key = headerMap[i];
      if (!key) continue;
      const val = cols[i];
      if (!val) continue;
      raw[key] = val;
    }
    if (!Object.keys(raw).length) continue;

    const hashed: Record<string, string> = {};
    for (const key of schema) {
      const val = raw[key];
      if (val === undefined || val === "") { hashed[key] = ""; continue; }
      if (key === "EMAIL") hashed[key] = await sha256Hex(normalizeEmail(val));
      else if (key === "PHONE") hashed[key] = await sha256Hex(normalizePhone(val));
      else if (key === "FN" || key === "LN" || key === "CT" || key === "ST" || key === "COUNTRY") hashed[key] = await sha256Hex(normalizeName(val));
      else if (key === "ZIP") hashed[key] = await sha256Hex(val.replace(/\D+/g, ""));
      else if (key === "MADID" || key === "EXTERN_ID") hashed[key] = val; // não hasheia
      else hashed[key] = await sha256Hex(val.trim().toLowerCase());
    }
    rows.push(hashed);
  }
  return { rows, schema };
}

/* =========================================================================
 * LalRangeSlider, trilha 0..10% com handles inteiros contíguos,
 * espelhando a UI do gerenciador do Meta (Criar público semelhante).
 * ======================================================================= */
type LalSplit = { start: number; end: number };
function LalRangeSlider({
  splits,
  onChange,
}: {
  splits: LalSplit[];
  onChange: (next: LalSplit[]) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const endpoints = splits.map((s) => s.end); // handles = endpoint de cada faixa
  const MAX = 10;
  const TICKS = Array.from({ length: MAX + 1 }, (_, i) => i);

  function pctFromClientX(clientX: number): number {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    return Math.round((x / rect.width) * MAX);
  }

  function moveHandle(i: number, valueRaw: number) {
    const value = Math.max(1, Math.min(MAX, valueRaw));
    const next = splits.map((s) => ({ ...s }));
    next[i].end = value;
    // mantém monotonicidade e contiguidade (start = end anterior)
    for (let k = 0; k < next.length; k++) {
      const minEnd = k === 0 ? 1 : next[k - 1].end + 1;
      if (next[k].end < minEnd) next[k].end = minEnd;
      if (next[k].end > MAX) next[k].end = MAX;
      next[k].start = k === 0 ? 0 : next[k - 1].end;
    }
    // se estourou o teto, corrige propagando pra trás
    for (let k = next.length - 1; k > 0; k--) {
      if (next[k].end <= next[k - 1].end) next[k - 1].end = next[k].end - 1;
    }
    for (let k = 0; k < next.length; k++) {
      next[k].start = k === 0 ? 0 : next[k - 1].end;
    }
    onChange(next);
  }

  useEffect(() => {
    if (dragIdx === null) return;
    const onMove = (e: PointerEvent) => moveHandle(dragIdx, pctFromClientX(e.clientX));
    const onUp = () => setDragIdx(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragIdx, splits]);

  const activeEnd = endpoints[endpoints.length - 1] ?? 1;

  return (
    <div className="mt-4 select-none">
      <div
        ref={trackRef}
        className="relative h-6"
        onPointerDown={(e) => {
          // clique na trilha move o handle mais próximo
          const val = pctFromClientX(e.clientX);
          let best = 0;
          let bestDist = Infinity;
          endpoints.forEach((v, i) => {
            const d = Math.abs(v - val);
            if (d < bestDist) { best = i; bestDist = d; }
          });
          setDragIdx(best);
          moveHandle(best, val);
        }}
      >
        {/* base track */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 rounded-full bg-muted" />
        {/* fill até o maior endpoint */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-primary"
          style={{ left: 0, width: `${(activeEnd / MAX) * 100}%` }}
        />
        {/* handles */}
        {endpoints.map((v, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Faixa ${i + 1}: ${splits[i].start}% a ${v}%`}
            onPointerDown={(e) => { e.stopPropagation(); setDragIdx(i); }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-background border-2 border-primary shadow cursor-grab active:cursor-grabbing"
            style={{ left: `${(v / MAX) * 100}%` }}
          />
        ))}
      </div>
      {/* tick labels 0..10 */}
      <div className="relative h-4 mt-1 text-[10px] text-muted-foreground">
        {TICKS.map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2"
            style={{ left: `${(t / MAX) * 100}%` }}
          >
            {t}%
          </span>
        ))}
      </div>
      {/* resumo das faixas */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {splits.map((s, i) => (
          <span key={i} className="px-2 py-0.5 rounded-full border border-border bg-background text-[11px]">
            #{i + 1} · {s.start}%-{s.end}%
          </span>
        ))}
      </div>
    </div>
  );
}

