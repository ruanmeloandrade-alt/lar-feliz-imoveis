import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Sparkles, RefreshCw, AlertCircle, Loader2, Plug,  Check, ChevronDown, Clock, SlidersHorizontal, Bot, Users, Target, FolderOpen } from "lucide-react";
import { ModuleShell, ModuleSection } from "@/components/modules/ModuleShell";
import { supabase } from "@/integrations/supabase/client";
import {
  getMetaInsights,
  getMetaStatus,
  syncMetaWorkspace,
  getMetaAiSuggestions,
  listMetaAvailableAssets,
  listMetaSyncedAdAccounts,
} from "@/lib/meta.functions";
import { setMetaCampaignStatus } from "@/lib/meta.functions";

import { getRealRoasByCampaign } from "@/lib/meta-attribution.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EditCampaignSheet } from "@/components/meta/EditCampaignSheet";

import { MetaReportsPanel } from "@/components/meta/MetaReportsPanel";

import { MetaCreativesPanel } from "@/components/meta/MetaCreativesPanel";
import { MetaAdsManagerTable } from "@/components/meta/MetaAdsManagerTable";
import { KpiConfigDialog } from "@/components/meta/KpiConfigDialog";
import { useMetaKpiSelection } from "@/hooks/useMetaKpiSelection";
import { META_KPI_CATALOG, type MetaKpiDef } from "@/lib/meta-dashboard-kpis";

import { cn } from "@/lib/utils";
import { useIsSuperAdmin } from "@/hooks/use-roles";



export const Route = createFileRoute("/modulos/gestor-trafego/")({
  head: () => ({ meta: [{ title: "Gestor de Tráfego IA · Vanessa Simoni" }] }),
  component: GestorTrafegoPage,
});

const PRESETS = [
  { v: "today", l: "Hoje" },
  { v: "yesterday", l: "Ontem" },
  { v: "last_3d", l: "Últimos 3 dias" },
  { v: "last_7d", l: "Últimos 7 dias" },
  { v: "last_14d", l: "Últimos 14 dias" },
  { v: "last_28d", l: "Últimos 28 dias" },
  { v: "last_30d", l: "Últimos 30 dias" },
  { v: "last_90d", l: "Últimos 90 dias" },
  { v: "this_week_mon_today", l: "Esta semana (seg → hoje)" },
  { v: "last_week_mon_sun", l: "Semana passada (seg → dom)" },
  { v: "this_month", l: "Este mês" },
  { v: "last_month", l: "Mês passado" },
  { v: "this_quarter", l: "Este trimestre" },
  { v: "last_quarter", l: "Trimestre passado" },
  { v: "this_year", l: "Este ano" },
  { v: "last_year", l: "Ano passado" },
  { v: "maximum", l: "Tempo inteiro (máximo)" },
  { v: "custom", l: "Personalizado…" },
] as const;

const CREATIVE_SORTS = [
  { v: "spend", l: "Mais gastam" },
  { v: "ctr", l: "Maior CTR" },
  { v: "cpl", l: "Menor CPL" },
  { v: "roas", l: "Maior ROAS" },
  { v: "clicks", l: "Mais cliques" },
] as const;

type Preset = string;
type CreativeSort = (typeof CREATIVE_SORTS)[number]["v"];
type AdSource = "meta" | "google" | "tiktok";
const AD_SOURCES: { v: AdSource; l: string; ready: boolean; agentReady: boolean }[] = [
  { v: "meta", l: "Meta Ads", ready: true, agentReady: true },
  { v: "google", l: "Google Ads", ready: false, agentReady: true },
  { v: "tiktok", l: "TikTok Ads", ready: false, agentReady: true },
];

type MetaView = "overview" | "creatives";

const CUSTOM_PRESET_RE = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/;

function presetLabel(preset: string): string {
  const m = preset.match(CUSTOM_PRESET_RE);
  if (m) {
    const fmt = (s: string) => {
      const [y, mo, d] = s.split("-");
      return `${d}/${mo}/${y}`;
    };
    return `${fmt(m[1])} → ${fmt(m[2])}`;
  }
  return PRESETS.find((p) => p.v === preset)?.l ?? preset;
}

function DateRangePicker({ preset, onChange }: { preset: string; onChange: (p: string) => void }) {
  const custom = preset.match(CUSTOM_PRESET_RE);
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState(custom?.[1] ?? "");
  const [until, setUntil] = useState(custom?.[2] ?? "");

  const isCustom = !!custom;
  const selectValue = isCustom ? "custom" : preset;

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "custom") {
            setOpen(true);
            const today = new Date().toISOString().slice(0, 10);
            if (!since) setSince(today);
            if (!until) setUntil(today);
          } else {
            onChange(v);
          }
        }}
        className="px-3 py-2 rounded-md border border-border bg-background text-xs font-medium"
      >
        {PRESETS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
      </select>
      {isCustom && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3 py-2 rounded-md border border-border bg-background text-xs font-medium hover:bg-muted"
          title="Editar período personalizado"
        >
          {presetLabel(preset)}
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Período personalizado</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">De</span>
              <input
                type="date"
                value={since}
                max={until || undefined}
                onChange={(e) => setSince(e.target.value)}
                className="px-3 py-2 rounded-md border border-border bg-background text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Até</span>
              <input
                type="date"
                value={until}
                min={since || undefined}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setUntil(e.target.value)}
                className="px-3 py-2 rounded-md border border-border bg-background text-sm"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              size="sm"
              disabled={!since || !until || since > until}
              onClick={() => {
                onChange(`custom:${since}:${until}`);
                setOpen(false);
              }}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function useWorkspaceId(): string | null {
  const [wsId, setWsId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase.from("profiles")
        .select("current_workspace_id").eq("id", u.user.id).maybeSingle();
      setWsId(prof?.current_workspace_id ?? null);
    })();
  }, []);
  return wsId;
}

function money(n: number, currency: string | null | undefined): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency", currency: currency || "BRL", maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

const FILTER_STORAGE_PREFIX = "mkton.meta.filterAccounts.";

function GestorTrafegoPage() {
  const wsId = useWorkspaceId();

  return (
    <ModuleShell
      icon={Megaphone}
      tag="MÍDIA"
      title="Gestor de Tráfego IA"
      description="Meta Ads em tempo real, direto da Insights API."
      status="ativo"
    >
      <MetaPanel wsId={wsId} />
    </ModuleShell>
  );
}

function MetaPanel({ wsId }: { wsId: string | null }) {
  const [preset, setPreset] = useState<Preset>("last_7d");
  const [metaView, setMetaView] = useState<MetaView>("overview");
  const [creativeSort, setCreativeSort] = useState<CreativeSort>("spend");
  const [syncOpen, setSyncOpen] = useState(false);
  const [kpiConfigOpen, setKpiConfigOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; accountId: string; name: string; dailyBudget: number | null; effectiveStatus: string } | null>(null);
  const [selectedAccts, setSelectedAccts] = useState<Set<string>>(new Set());
  const [selectedSources, setSelectedSources] = useState<Set<AdSource>>(new Set(["meta"]));
  const { isSuperAdmin } = useIsSuperAdmin();
  const qc = useQueryClient();


  const insightsFn = useServerFn(getMetaInsights);
  const statusFn = useServerFn(getMetaStatus);
  const aiFn = useServerFn(getMetaAiSuggestions);
  const syncedAcctsFn = useServerFn(listMetaSyncedAdAccounts);
  const realRoasFn = useServerFn(getRealRoasByCampaign);

  const kpiSel = useMetaKpiSelection(wsId);

  // Load persisted filter
  useEffect(() => {
    if (!wsId) return;
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_PREFIX + wsId);
      if (raw) setSelectedAccts(new Set(JSON.parse(raw) as string[]));
    } catch { /* noop */ }
  }, [wsId]);

  useEffect(() => {
    if (!wsId) return;
    try { localStorage.setItem(FILTER_STORAGE_PREFIX + wsId, JSON.stringify(Array.from(selectedAccts))); } catch { /* noop */ }
  }, [wsId, selectedAccts]);

  const statusQ = useQuery({
    queryKey: ["meta-status", wsId],
    queryFn: () => statusFn({ data: { workspaceId: wsId! } }),
    enabled: !!wsId,
  });
  const connected = statusQ.data?.connected ?? false;

  const syncedAcctsQ = useQuery({
    queryKey: ["meta-synced-accts", wsId],
    queryFn: () => syncedAcctsFn({ data: { workspaceId: wsId! } }),
    enabled: !!wsId && connected,
  });

  const accountIdsParam = useMemo(() => {
    return selectedAccts.size > 0 ? Array.from(selectedAccts) : undefined;
  }, [selectedAccts]);

  const insightsQ = useQuery({
    queryKey: ["meta-insights", wsId, preset, accountIdsParam],
    queryFn: () => insightsFn({ data: { workspaceId: wsId!, preset, accountIds: accountIdsParam } }),
    enabled: !!wsId && connected,
  });

  const totals = insightsQ.data?.totals;
  const currency = insightsQ.data?.currency;

  // ROAS Real alimenta os KPIs "real_*"
  const realRoasQ = useQuery({
    queryKey: ["meta-real-roas", wsId, preset],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => realRoasFn({ data: { workspaceId: wsId!, preset: preset as any } }),
    enabled: !!wsId && connected && kpiSel.keys.some((k) => k.startsWith("real_")),

  });

  const formatKpi = (def: MetaKpiDef, raw: number | string | null): string => {
    if (def.unit === "ranking") {
      if (!raw || raw === "UNKNOWN") return "N/D";
      const map: Record<string, string> = {
        ABOVE_AVERAGE: "Acima da média",
        AVERAGE: "Média",
        BELOW_AVERAGE_35: "Abaixo (35%)",
        BELOW_AVERAGE_20: "Abaixo (20%)",
        BELOW_AVERAGE_10: "Abaixo (10%)",
      };
      return map[String(raw)] ?? String(raw);
    }
    const num = typeof raw === "number" ? raw : Number(raw);
    switch (def.unit) {
      case "currency": return money(num || 0, currency);
      case "percent":  return `${(num || 0).toFixed(2)}%`;
      case "roas":     return num > 0 ? `${num.toFixed(2)}x` : "N/D";
      case "duration_sec": {
        if (!num) return "0s";
        const m = Math.floor(num / 60), s = Math.round(num % 60);
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
      }
      case "number":
      default:         return Number.isFinite(num) ? (num || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "N/D";
    }
  };

  const kpis = useMemo(() => {
    if (!totals && !realRoasQ.data) return [];
    const rTotals = realRoasQ.data?.totals;
    const items: Array<{ l: string; v: string }> = [];
    for (const key of kpiSel.keys) {
      const def = META_KPI_CATALOG.find((k) => k.key === key);
      if (!def) continue;
      let raw: number | string | null | undefined;
      if (def.totalsField && totals) {
        raw = (totals as unknown as Record<string, number | string | null>)[def.totalsField];
      } else if (def.realField && rTotals) {
        raw = (rTotals as unknown as Record<string, number>)[def.realField];
      }
      if (raw === undefined || raw === null || (typeof raw === "number" && Number.isNaN(raw))) {
        items.push({ l: def.label, v: "N/D" });
      } else {
        items.push({ l: def.label, v: formatKpi(def, raw) });
      }
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals, currency, realRoasQ.data, kpiSel.keys]);


  if (!wsId) {
    return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Carregando workspace…</div>;
  }
  if (!connected) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 flex items-start gap-3">
        <Plug className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">Meta não conectada</div>
          <div className="text-xs text-muted-foreground mt-1">
            Conecte sua conta Meta em Integrações para ver KPIs reais e campanhas ativas.
          </div>
        </div>
        <a href="/integracoes" className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90">
          Ir para Integrações
        </a>
      </div>
    );
  }

  const syncedAccounts = syncedAcctsQ.data?.accounts ?? [];

  return (
    <>
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <SourceFilterPopover selected={selectedSources} onChange={setSelectedSources} isSuperAdmin={isSuperAdmin} />

        <DateRangePicker preset={preset} onChange={setPreset} />



        <AccountFilterPopover
          accounts={syncedAccounts}
          selected={selectedAccts}
          onChange={setSelectedAccts}
        />

        {metaView === "creatives" && (
          <select
            value={creativeSort}
            onChange={(e) => setCreativeSort(e.target.value as CreativeSort)}
            className="px-3 py-2 rounded-md border border-border bg-background text-xs font-medium"
          >
            {CREATIVE_SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
          </select>
        )}

        <Button variant="outline" size="sm" onClick={() => setKpiConfigOpen(true)}>
          <SlidersHorizontal className="w-3.5 h-3.5" /> Configurar KPIs
        </Button>

        <Button variant="outline" size="sm" onClick={() => setSyncOpen(true)}>
          <RefreshCw className="w-3.5 h-3.5" /> Sincronizar contas
        </Button>

      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setMetaView("overview")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition",
            metaView === "overview" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted",
          )}
        >
          <Megaphone className="w-3.5 h-3.5" />
          Campanhas e KPIs
        </button>
        <button
          onClick={() => setMetaView("creatives")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition",
            metaView === "creatives" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted",
          )}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Comparativo de criativos IA
        </button>

        <Link
          to="/modulos/gestor-trafego/personas"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
        >
          <Users className="w-3.5 h-3.5" />
          Personas
        </Link>
        <Link
          to="/modulos/gestor-trafego/estrategias"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
        >
          <Target className="w-3.5 h-3.5" />
          Estratégias
        </Link>
        <Link
          to="/modulos/gestor-trafego/publicos"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
        >
          <Users className="w-3.5 h-3.5" />
          Públicos
        </Link>
        <Link
          to="/modulos/gestor-trafego/automacoes"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Automações executáveis
        </Link>
        <Link
          to="/modulos/gestor-trafego/criativos"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Central de Criativos
        </Link>
        <Link
          to="/modulos/gestor-trafego/chat"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
        >
          <Bot className="w-3.5 h-3.5" />
          Chat Marketing
        </Link>
      </div>


      {syncedAccounts.length === 0 && (
        <div className="rounded-xl border border-dashed border-warning/40 bg-warning/5 p-4 text-sm text-warning-foreground flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-foreground">Nenhuma conta de anúncio sincronizada ainda.</div>
            <div className="text-xs text-muted-foreground mt-1">
              Clique em <b>Sincronizar contas</b> e escolha quais contas do seu Business Manager quer trazer para o Vanessa Simoni. Só as escolhidas aparecerão aqui, o sistema não mistura contas de clientes diferentes.
            </div>
          </div>
        </div>
      )}

      {metaView === "creatives" ? (
        <>
          <MetaCreativesPanel
            workspaceId={wsId}
            selectedAccountIds={accountIdsParam}
            preset={preset}
            sortBy={creativeSort}
          />
        </>
      ) : (
        <>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-stretch gap-0 overflow-x-auto no-scrollbar divide-x divide-border">
          {insightsQ.isLoading && !totals && Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="min-w-[140px] px-4 py-3 shrink-0 animate-pulse">
              <div className="h-2.5 w-16 bg-muted rounded mb-2" />
              <div className="h-4 w-20 bg-muted rounded" />
            </div>
          ))}
          {kpis.map((k) => (
            <div key={k.l} className="min-w-[140px] px-4 py-3 shrink-0">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{k.l}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums truncate">{k.v}</div>
            </div>
          ))}
        </div>
        {!insightsQ.isLoading && !totals && syncedAccounts.length > 0 && (
          <div className="border-t border-border p-4 text-xs text-muted-foreground flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Nenhum dado no período selecionado.
          </div>
        )}

      </div>

      {insightsQ.data?.byAccount && insightsQ.data.byAccount.length > 1 && (
        <ModuleSection title="Por conta de anúncios" description={`Período: ${presetLabel(preset)}`}>
          <div className="divide-y divide-border">
            {insightsQ.data.byAccount.map((a) => (
              <div key={a.accountId} className="py-3 grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{a.name || a.accountId}</div>
                  <div className="text-[11px] text-muted-foreground">{a.accountId}</div>
                </div>
                <div className="text-right"><div className="text-xs tabular-nums">{money(a.spend, a.currency)}</div><div className="text-[10px] text-muted-foreground">investido</div></div>
                <div className="text-right"><div className="text-xs tabular-nums">{a.leads}</div><div className="text-[10px] text-muted-foreground">leads</div></div>
                <div className="text-right"><div className="text-xs tabular-nums">{a.leads > 0 ? money(a.cpl, a.currency) : "N/D"}</div><div className="text-[10px] text-muted-foreground">CPL</div></div>
                <div className="text-right"><div className="text-xs tabular-nums">{a.roas > 0 ? `${a.roas.toFixed(2)}x` : "N/D"}</div><div className="text-[10px] text-muted-foreground">ROAS</div></div>
              </div>
            ))}
          </div>
        </ModuleSection>
      )}

      <MetaAdsManagerTable
        workspaceId={wsId}
        preset={preset}
        selectedAccountIds={accountIdsParam}
        onEditCampaign={(c) => setEditing(c)}
      />

      {/* Automações executáveis agora ficam em /modulos/gestor-trafego/automacoes */}

      <AiSuggestionsBlock
        enabled={!!wsId && connected}
        workspaceId={wsId}
        run={() => aiFn({ data: { workspaceId: wsId!, preset, accountIds: accountIdsParam } })}
      />

      <MetaReportsPanel workspaceId={wsId} />


        </>
      )}

      <EditCampaignSheet
        workspaceId={wsId}
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        campaign={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["meta-campaigns", wsId] })}
      />
      <SyncAccountsDialog
        workspaceId={wsId}
        open={syncOpen}
        onOpenChange={setSyncOpen}
        onSynced={(kept) => {
          // Filter chip mostra só o que foi mantido; limpamos filtros de contas que sumiram
          setSelectedAccts((prev) => new Set(Array.from(prev).filter((id) => kept.has(id))));
          qc.invalidateQueries({ queryKey: ["meta-synced-accts", wsId] });
          qc.invalidateQueries({ queryKey: ["meta-insights", wsId] });
          qc.invalidateQueries({ queryKey: ["meta-campaigns", wsId] });
        }}
      />
      <KpiConfigDialog
        open={kpiConfigOpen}
        onOpenChange={setKpiConfigOpen}
        current={kpiSel.keys}
        onSave={kpiSel.save}
      />
    </>
  );
}

// ---------- Source (origem) filter popover ----------
function SourceFilterPopover({
  selected,
  onChange,
  isSuperAdmin,
}: {
  selected: Set<AdSource>;
  onChange: (s: Set<AdSource>) => void;
  isSuperAdmin: boolean;
}) {
  void isSuperAdmin;
  const visibleSources = useMemo(() => AD_SOURCES, []);
  const selectableSources = useMemo(() => visibleSources.filter((s) => s.ready), [visibleSources]);
  const total = selectableSources.length;
  const label = selected.size === 0
    ? "Nenhuma origem"
    : selected.size === total
      ? "Todas as origens"
      : selected.size === 1
        ? (AD_SOURCES.find((s) => s.v === Array.from(selected)[0])?.l ?? "1 origem")
        : `${selected.size} origens`;

  const toggle = (v: AdSource) => {
    const source = AD_SOURCES.find((s) => s.v === v);
    if (!source?.ready) return;
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          {label}
          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-2 flex items-center justify-between border-b border-border">
          <div className="text-xs font-medium">Origem da mídia</div>
          <div className="flex gap-2">
            <button
              className="text-[11px] text-primary hover:underline"
              onClick={() => onChange(new Set(selectableSources.map((s) => s.v)))}
            >
              Todas
            </button>
            <button
              className="text-[11px] text-muted-foreground hover:underline"
              onClick={() => onChange(new Set())}
            >
              Limpar
            </button>
          </div>
        </div>
        <div className="max-h-72 overflow-auto py-1">
          {visibleSources.map((s) => {
            const on = selected.has(s.v);
            return (
              <button
                key={s.v}
                onClick={() => toggle(s.v)}
                disabled={!s.ready}
                className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2 disabled:cursor-default disabled:opacity-80"
              >
                <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", on ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                  {on && <Check className="w-3 h-3" />}
                </div>
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span className="text-xs font-medium truncate">{s.l}</span>
                  {!s.ready && s.agentReady ? (
                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 dark:text-emerald-400">
                      IA/Chat ativo · dashboard em conexão
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}


// ---------- Account filter popover ----------
function AccountFilterPopover({
  accounts,
  selected,
  onChange,
}: {
  accounts: Array<{ account_id: string; name: string | null }>;
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const label = selected.size === 0
    ? `Todas as contas${accounts.length ? ` (${accounts.length})` : ""}`
    : selected.size === 1
      ? (accounts.find((a) => a.account_id === Array.from(selected)[0])?.name || Array.from(selected)[0])
      : `${selected.size} contas selecionadas`;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={accounts.length === 0}>
          {label}
          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-2 flex items-center justify-between border-b border-border">
          <div className="text-xs font-medium">Filtrar por conta de anúncio</div>
          <button
            className="text-[11px] text-primary hover:underline"
            onClick={() => onChange(new Set())}
          >
            Limpar
          </button>
        </div>
        <div className="max-h-72 overflow-auto py-1">
          {accounts.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">Sincronize contas primeiro.</div>
          )}
          {accounts.map((a) => {
            const on = selected.has(a.account_id);
            return (
              <button
                key={a.account_id}
                onClick={() => toggle(a.account_id)}
                className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2"
              >
                <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", on ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                  {on && <Check className="w-3 h-3" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{a.name || a.account_id}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{a.account_id}</div>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- Sync accounts dialog ----------
function SyncAccountsDialog({
  workspaceId,
  open,
  onOpenChange,
  onSynced,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSynced: (kept: Set<string>) => void;
}) {
  const listAvailable = useServerFn(listMetaAvailableAssets);
  const syncFn = useServerFn(syncMetaWorkspace);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; currency: string | null; businessName: string | null; selected: boolean }>>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const r = await listAvailable({ data: { workspaceId } });
        if (cancel) return;
        setAccounts(r.accounts);
        setPicked(new Set(r.accounts.filter((a) => a.selected).map((a) => a.id)));
      } catch (e) {
        toast.error((e as Error).message || "Falha ao listar contas Meta.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [open, workspaceId, listAvailable]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return accounts;
    return accounts.filter((a) =>
      a.name.toLowerCase().includes(f)
      || a.id.toLowerCase().includes(f)
      || (a.businessName || "").toLowerCase().includes(f),
    );
  }, [accounts, filter]);

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  };

  const doSync = async () => {
    if (picked.size === 0) {
      toast.error("Selecione ao menos uma conta para sincronizar.");
      return;
    }
    setSaving(true);
    try {
      const r = await syncFn({ data: { workspaceId, accountIds: Array.from(picked) } });
      toast.success(`Sincronizado: ${r.adAccounts} contas · ${r.pages} páginas · ${r.pixels} pixels`);
      onSynced(picked);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Falha ao sincronizar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sincronizar contas de anúncio</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Escolha quais contas do seu Business Manager quer trazer para este workspace. Só as marcadas serão sincronizadas, as demais nem aparecem no Vanessa Simoni (evita misturar campanhas de clientes diferentes).
          </div>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar por nome ou ID…"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-xs"
          />
          <div className="rounded-lg border border-border max-h-80 overflow-auto">
            {loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando contas do Meta…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma conta encontrada.</div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((a) => {
                  const on = picked.has(a.id);
                  return (
                    <label key={a.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted cursor-pointer">
                      <Checkbox checked={on} onCheckedChange={() => toggle(a.id)} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{a.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {a.id}{a.businessName ? ` · ${a.businessName}` : ""}{a.currency ? ` · ${a.currency}` : ""}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">{picked.size} de {accounts.length} contas selecionadas.</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={doSync} disabled={saving || loading || picked.size === 0}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sincronizar {picked.size > 0 ? `(${picked.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type AiSuggestion = {
  action: string;
  campaign: string;
  campaignId: string;
  adAccountId: string;
  reason: string;
  details: string;
  priority: string;
  metrics: null | { spend: number; leads: number; cpl: number; ctr: number; roas: number; status: string; objective?: string | null; results?: number; resultLabel?: string; costPerResult?: number; costPerResultLabel?: string };
};

function AiSuggestionsBlock({ enabled, workspaceId, run }: { enabled: boolean; workspaceId: string | null; run: () => Promise<{ summary: string; suggestions: AiSuggestion[]; currency?: string }> }) {
  const mut = useMutation({
    mutationFn: run,
    onError: (e: Error) => toast.error(e.message || "Falha ao gerar sugestões."),
  });
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(null);

  const priorityColor: Record<string, string> = {
    alta: "bg-destructive/15 text-destructive",
    media: "bg-amber-500/15 text-amber-500",
    baixa: "bg-muted text-muted-foreground",
  };
  const actionLabel: Record<string, string> = {
    pause: "Pausar",
    increase_budget: "Aumentar budget",
    decrease_budget: "Reduzir budget",
    duplicate: "Duplicar",
    review_creative: "Revisar criativo",
    review_audience: "Revisar público",
    other: "Analisar",
  };

  const active = open != null ? mut.data?.suggestions[open] ?? null : null;

  return (
    <ModuleSection title="Sugestões da IA" description="Análise da performance no período selecionado.">
      {!mut.data && !mut.isPending && (
        <div className="rounded-lg border border-dashed border-border bg-background/50 p-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="w-4 h-4 text-primary" />
            Peça à IA para analisar suas campanhas e sugerir otimizações.
          </div>
          <Button size="sm" disabled={!enabled} onClick={() => mut.mutate()}>
            <Sparkles className="w-3.5 h-3.5" /> Gerar sugestões
          </Button>
        </div>
      )}
      {mut.isPending && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> IA analisando campanhas…
        </div>
      )}
      {mut.data && (
        <div className="space-y-3">
          {mut.data.summary && (
            <div className="rounded-lg border border-border bg-card p-4 text-sm">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Resumo</div>
              {mut.data.summary}
            </div>
          )}
          {mut.data.suggestions.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4">Sem sugestões, performance parece estável.</div>
          ) : (
            <ul className="space-y-2">
              {mut.data.suggestions.map((s, i) => dismissed.has(i) ? null : (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setOpen(i)}
                    className="w-full text-left flex items-start gap-3 p-3 rounded-lg border border-border bg-background/50 hover:bg-muted/40 transition"
                  >
                    <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{actionLabel[s.action] ?? s.action}</span>
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${priorityColor[s.priority] ?? "bg-muted text-muted-foreground"}`}>{s.priority}</span>
                        <span className="text-[11px] text-muted-foreground truncate">{s.campaign}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{s.reason}</div>
                      <div className="text-[11px] text-primary mt-1">Ver detalhes e agir →</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => { setDismissed(new Set()); mut.mutate(); }} disabled={mut.isPending}>
              <RefreshCw className="w-3.5 h-3.5" /> Nova análise
            </Button>
          </div>
        </div>
      )}

      <AiSuggestionDrawer
        suggestion={active}
        index={open}
        workspaceId={workspaceId}
        currency={mut.data?.currency ?? "BRL"}
        actionLabel={actionLabel}
        onClose={() => setOpen(null)}
        onDismiss={(i) => { setDismissed((prev) => { const n = new Set(prev); n.add(i); return n; }); setOpen(null); }}
      />
    </ModuleSection>
  );
}

function AiSuggestionDrawer({
  suggestion, index, workspaceId, currency, actionLabel, onClose, onDismiss,
}: {
  suggestion: AiSuggestion | null;
  index: number | null;
  workspaceId: string | null;
  currency: string;
  actionLabel: Record<string, string>;
  onClose: () => void;
  onDismiss: (i: number) => void;
}) {
  const setStatusFn = useServerFn(setMetaCampaignStatus);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"pause" | "activate" | null>(null);


  if (!suggestion || index == null) return null;
  const s = suggestion;
  const canAct = !!s.campaignId && !!workspaceId;

  const doPause = async () => {
    if (!canAct || !workspaceId) return;
    setBusy("pause");
    try {
      await setStatusFn({ data: { workspaceId, campaignId: s.campaignId, status: "PAUSED" } });
      toast.success("Campanha pausada.");
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
      onDismiss(index);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao pausar."); }
    finally { setBusy(null); }
  };
  const doActivate = async () => {
    if (!canAct || !workspaceId) return;
    setBusy("activate");
    try {
      await setStatusFn({ data: { workspaceId, campaignId: s.campaignId, status: "ACTIVE" } });
      toast.success("Campanha ativada.");
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao ativar."); }
    finally { setBusy(null); }
  };
  // Duplicação de campanha inteira foi removida, o Meta limita "copies" com deep_copy
  // (erro 1885194 "A solicitação de cópia é muito grande") pra campanhas com muitos adsets/ads.
  // Fluxo suportado: duplicar adset a adset ou anúncio a anúncio pela tabela do gerenciador,
  // Criação derivada passa por Automações Executáveis/IA, preservando o objeto de origem e guardrails.



  const doCopy = async () => {
    const txt = `${actionLabel[s.action] ?? s.action} · ${s.campaign}\n\n${s.reason}\n\n${s.details}`;
    try { await navigator.clipboard.writeText(txt); toast.success("Sugestão copiada."); }
    catch { toast.error("Não foi possível copiar."); }
  };

  const isPaused = s.metrics?.status?.includes("PAUSED");
  const m = s.metrics;

  return (
    <Sheet open={!!suggestion} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {actionLabel[s.action] ?? s.action}
          </SheetTitle>
          <SheetDescription className="truncate">{s.campaign}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Por que a IA sugeriu isso</div>
            <div className="text-sm">{s.reason}</div>
            {s.details && <div className="text-sm text-muted-foreground mt-2 leading-relaxed">{s.details}</div>}
          </div>

          {m && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { k: "Objetivo", v: m.objective || "N/D" },
                { k: "Invest.", v: `${m.spend.toFixed(2)} ${currency}` },
                { k: m.resultLabel || "Leads", v: String(m.results ?? m.leads) },
                { k: m.costPerResultLabel || "CPL", v: (m.results ?? m.leads) > 0 ? `${(m.costPerResult ?? m.cpl).toFixed(2)}` : "N/D" },
                { k: "CTR", v: `${m.ctr.toFixed(2)}%` },
                { k: "ROAS", v: m.roas > 0 ? m.roas.toFixed(2) : "N/D" },
                { k: "Status", v: m.status },
              ].map((x) => (
                <div key={x.k} className="rounded-md border border-border bg-background/50 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{x.k}</div>
                  <div className="text-sm font-medium truncate">{x.v}</div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Ações</div>
            <div className="flex flex-wrap gap-2">
              {canAct && !isPaused && (
                <Button size="sm" variant="destructive" onClick={doPause} disabled={busy !== null}>
                  {busy === "pause" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Pausar campanha
                </Button>
              )}
              {canAct && isPaused && (
                <Button size="sm" onClick={doActivate} disabled={busy !== null}>
                  {busy === "activate" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Ativar campanha
                </Button>
              )}

              <Button size="sm" variant="outline" onClick={doCopy} disabled={busy !== null}>
                Copiar sugestão
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDismiss(index)} disabled={busy !== null}>
                Descartar
              </Button>
            </div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
              <strong>Sobre duplicar campanha:</strong> use Automações Executáveis para planejar duplicações e criações derivadas com revisão, preservando a configuração do objeto de origem e aplicando somente as mudanças pedidas pela estratégia.
            </div>
            {!canAct && (
              <div className="text-[11px] text-muted-foreground">Sugestão geral, sem ação automatizada em campanha específica.</div>
            )}

          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

