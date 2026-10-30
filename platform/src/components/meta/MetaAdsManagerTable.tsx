import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play, Pause, Copy, Pencil, FlaskConical, MoreHorizontal, Loader2, AlertCircle,
  BarChart3, GitCompare, Search,  LineChart, ImageIcon,
} from "lucide-react";
import {
  listMetaCampaigns,
  listMetaAdSets,
  listMetaAds,
  setMetaCampaignStatus,
  setMetaObjectStatus,
} from "@/lib/meta.functions";
import {
  duplicateMetaCampaign,
  duplicateMetaAdSet,
  duplicateMetaAd,
} from "@/lib/meta-campaigns.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MetaChartsDialog } from "@/components/meta/MetaChartsDialog";
import { EditAdSetSheet } from "@/components/meta/EditAdSetSheet";
import { EditAdSheet } from "@/components/meta/EditAdSheet";
import { MetaCompareDialog, type CompareItem } from "@/components/meta/MetaCompareDialog";

import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type Level = "campaigns" | "adsets" | "ads";
type Preset = string;

function money(n: number, currency: string | null | undefined): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency", currency: currency || "BRL", maximumFractionDigits: 2,
    }).format(n);
  } catch { return `R$ ${n.toFixed(2)}`; }
}
const num = (n: number) => (Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "0");

function StatusPill({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cls =
    s === "ACTIVE" ? "bg-emerald-500/15 text-emerald-500" :
    s === "PAUSED" ? "bg-muted text-muted-foreground" :
    s.includes("REJECTED") || s.includes("DISAPPROVED") || s.includes("ERROR") ? "bg-destructive/15 text-destructive" :
    s.includes("PENDING") || s.includes("REVIEW") ? "bg-amber-500/15 text-amber-500" :
    "bg-muted text-muted-foreground";
  const label =
    s === "ACTIVE" ? "Ativo" :
    s === "PAUSED" ? "Pausado" :
    s === "CAMPAIGN_PAUSED" ? "Campanha pausada" :
    s === "ADSET_PAUSED" ? "Conjunto pausado" :
    s === "ARCHIVED" ? "Arquivado" :
    s === "IN_PROCESS" ? "Em processamento" :
    s === "WITH_ISSUES" ? "Com problemas" :
    s === "PENDING_REVIEW" ? "Em revisão" :
    s === "DISAPPROVED" ? "Reprovado" :
    s === "PREAPPROVED" ? "Pré-aprovado" :
    s === "PENDING_BILLING_INFO" ? "Erro no pagamento" :
    status;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded", cls)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", s === "ACTIVE" ? "bg-emerald-500" : "bg-current opacity-60")} />
      {label}
    </span>
  );
}

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-4 w-8 shrink-0 rounded-full transition-colors disabled:opacity-50",
        on ? "bg-primary" : "bg-muted",
      )}
      title={on ? "Pausar" : "Ativar"}
    >
      <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", on ? "left-4" : "left-0.5")} />
    </button>
  );
}

function CreativeThumb({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0" title="Sem criativo disponível">
        <ImageIcon className="w-3.5 h-3.5" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className="w-9 h-9 rounded-md object-cover border border-border shrink-0 bg-muted"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
    />
  );
}


export function MetaAdsManagerTable({
  workspaceId,
  preset,
  selectedAccountIds,
  onEditCampaign,
}: {
  workspaceId: string;
  preset: Preset;
  selectedAccountIds: string[] | undefined;
  onEditCampaign: (c: { id: string; accountId: string; name: string; dailyBudget: number | null; effectiveStatus: string }) => void;
}) {
  const [level, setLevel] = useState<Level>("campaigns");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const campaignsFn = useServerFn(listMetaCampaigns);
  const adsetsFn = useServerFn(listMetaAdSets);
  const adsFn = useServerFn(listMetaAds);
  const toggleCampaignFn = useServerFn(setMetaCampaignStatus);
  const toggleObjectFn = useServerFn(setMetaObjectStatus);
  const dupCampaignFn = useServerFn(duplicateMetaCampaign);
  const dupAdSetFn = useServerFn(duplicateMetaAdSet);
  const dupAdFn = useServerFn(duplicateMetaAd);

  const campaignsQ = useQuery({
    queryKey: ["meta-campaigns", workspaceId, preset, selectedAccountIds],
    queryFn: () => campaignsFn({ data: { workspaceId, preset, limit: 50, accountIds: selectedAccountIds } }),
  });
  const adsetsQ = useQuery({
    queryKey: ["meta-adsets", workspaceId, preset, selectedAccountIds],
    queryFn: () => adsetsFn({ data: { workspaceId, preset, limit: 100, accountIds: selectedAccountIds } }),
    enabled: level === "adsets" || level === "ads",
  });
  const adsQ = useQuery({
    queryKey: ["meta-ads", workspaceId, preset, selectedAccountIds],
    queryFn: () => adsFn({ data: { workspaceId, preset, limit: 100, accountIds: selectedAccountIds } }),
    enabled: level === "ads",
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["meta-campaigns", workspaceId] });
    qc.invalidateQueries({ queryKey: ["meta-adsets", workspaceId] });
    qc.invalidateQueries({ queryKey: ["meta-ads", workspaceId] });
  };

  const toggleMut = useMutation({
    mutationFn: async (v: { id: string; status: "ACTIVE" | "PAUSED"; type: Level }) => {
      if (v.type === "campaigns") return toggleCampaignFn({ data: { workspaceId, campaignId: v.id, status: v.status } });
      return toggleObjectFn({ data: { workspaceId, objectId: v.id, status: v.status } });
    },
    onSuccess: () => { toast.success("Status atualizado."); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const dupMut = useMutation({
    mutationFn: async (v: { id: string; accountId: string; type: Level }) => {
      const acct = v.accountId as `act_${string}`;
      if (v.type === "campaigns") return dupCampaignFn({ data: { workspaceId, adAccountId: acct, campaignId: v.id, deepCopy: true, renameSuffix: ", cópia" } });
      if (v.type === "adsets") return dupAdSetFn({ data: { workspaceId, adAccountId: acct, adSetId: v.id, deepCopy: true, renameSuffix: ", cópia" } });
      return dupAdFn({ data: { workspaceId, adAccountId: acct, adId: v.id, renameSuffix: ", cópia" } });
    },
    onSuccess: () => { toast.success("Duplicado. Cópia criada em PAUSED para revisão."); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Filtragem
  const filteredCampaigns = useMemo(() => {
    const rows = campaignsQ.data?.campaigns ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  }, [campaignsQ.data, search]);

  const filteredAdSets = useMemo(() => {
    const rows = adsetsQ.data?.adsets ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (!q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)));
  }, [adsetsQ.data, search]);

  const filteredAds = useMemo(() => {
    const rows = adsQ.data?.ads ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (!q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)));
  }, [adsQ.data, search]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const changeLevel = (l: Level) => { setLevel(l); setSelected(new Set()); };

  const selCount = selected.size;
  const isLoading = level === "campaigns" ? campaignsQ.isLoading :
                    level === "adsets" ? adsetsQ.isLoading : adsQ.isLoading;

  // Toolbar handlers baseadas em seleção
  const bulkDuplicate = () => {
    if (level === "campaigns") {
      toast.info("Duplicação de campanha inteira não é suportada, o Meta bloqueia cópias grandes. Duplique um conjunto de anúncios ou um anúncio por vez.", { duration: 7000 });
      return;
    }
    const rows = level === "adsets" ? filteredAdSets : filteredAds;
    const picked = rows.filter((r) => selected.has(r.id));
    if (picked.length !== 1) {
      toast.warning("Selecione exatamente 1 item para duplicar, o Meta limita cópias em lote.");
      return;
    }
    const r = picked[0];
    dupMut.mutate({ id: r.id, accountId: r.accountId, type: level });
  };
  const [editingAdSet, setEditingAdSet] = useState<{ id: string; accountId: string; name: string } | null>(null);
  const [editingAd, setEditingAd] = useState<{ id: string; accountId: string; name: string } | null>(null);

  const bulkEdit = () => {
    if (selCount !== 1) return;
    if (level === "campaigns") {
      const row = filteredCampaigns.find((r) => selected.has(r.id));
      if (row) onEditCampaign({
        id: row.id, accountId: row.accountId, name: row.name,
        dailyBudget: row.dailyBudget, effectiveStatus: row.effectiveStatus,
      });
    } else if (level === "adsets") {
      const row = filteredAdSets.find((r) => selected.has(r.id));
      if (row) setEditingAdSet({ id: row.id, accountId: row.accountId, name: row.name });
    } else {
      const row = filteredAds.find((r) => selected.has(r.id));
      if (row) setEditingAd({ id: row.id, accountId: row.accountId, name: row.name });
    }
  };
  const [chartsOpen, setChartsOpen] = useState(false);
  const [chartItems, setChartItems] = useState<Array<{ id: string; name: string }>>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareItems, setCompareItems] = useState<CompareItem[]>([]);

  const bulkGraphs = () => {
    const rows = level === "campaigns" ? filteredCampaigns : level === "adsets" ? filteredAdSets : filteredAds;
    const all = rows.filter((r) => selected.has(r.id));
    const picked = all.slice(0, 30);
    if (picked.length === 0) return toast.error("Selecione ao menos 1 item.");
    if (all.length > picked.length) toast.warning(`Mostrando os primeiros ${picked.length} de ${all.length} itens no gráfico.`);
    setChartItems(picked.map((r) => ({ id: r.id, name: r.name })));
    setChartsOpen(true);
  };
  const bulkCompare = () => {
    if (selCount < 2) return toast.error("Selecione pelo menos 2 itens para comparar.");
    const rows = level === "campaigns" ? filteredCampaigns : level === "adsets" ? filteredAdSets : filteredAds;
    const allSel = rows.filter((r) => selected.has(r.id));
    const picked = allSel.slice(0, 30);
    if (allSel.length > picked.length) toast.warning(`Comparando os primeiros ${picked.length} de ${allSel.length} itens.`);
    const asCompare: CompareItem[] = picked.map((r) => {
      const base = {
        id: r.id, name: r.name, status: r.effectiveStatus, currency: r.currency,
        spend: r.spend, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr,
        leads: r.leads, cpl: r.cpl, roas: r.roas,
      };
      if ("objective" in r) return { ...base, objective: r.objective ?? null } as CompareItem;
      if ("reach" in r) return { ...base, reach: r.reach } as CompareItem;
      return base as CompareItem;
    });
    setCompareItems(asCompare);
    setCompareOpen(true);
  };


  return (
    <>
      <div className="rounded-xl border border-border bg-card">



      {/* Level tabs */}
      <div className="border-b border-border px-3 pt-3">
        <div className="flex gap-1">
          {([
            { v: "campaigns", l: "Campanhas", count: campaignsQ.data?.campaigns.length },
            { v: "adsets", l: "Conjuntos de anúncios", count: adsetsQ.data?.adsets.length },
            { v: "ads", l: "Anúncios", count: adsQ.data?.ads.length },
          ] as const).map((t) => (
            <button
              key={t.v}
              onClick={() => changeLevel(t.v)}
              className={cn(
                "px-3 py-2 text-xs font-medium rounded-t-md border-b-2 transition-colors",
                level === t.v
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              {t.l}
              {typeof t.count === "number" && <span className="ml-1.5 text-[10px] opacity-60">({t.count})</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap p-3 border-b border-border">
        {level !== "campaigns" && (
          <Button
            variant="outline"
            size="sm"
            disabled={selCount !== 1 || dupMut.isPending}
            onClick={bulkDuplicate}
            title="Duplique um conjunto/anúncio por vez (limite do Meta)"
          >
            {dupMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
            Duplicar
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={selCount !== 1} onClick={bulkEdit}>
          <Pencil className="w-3.5 h-3.5" /> Editar
        </Button>
        <Button variant="outline" size="sm" disabled title="Teste A/B em breve">
          <FlaskConical className="w-3.5 h-3.5" /> Teste A/B
        </Button>
        <Button variant="outline" size="sm" disabled={selCount === 0} onClick={bulkGraphs}>
          <LineChart className="w-3.5 h-3.5" /> Gráficos
        </Button>
        <Button variant="outline" size="sm" disabled={selCount < 2} onClick={bulkCompare}>
          <GitCompare className="w-3.5 h-3.5" /> Comparar
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm"><MoreHorizontal className="w-3.5 h-3.5" /> Mais</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem disabled={selCount === 0} onClick={() => {
              const rows = level === "campaigns" ? filteredCampaigns : level === "adsets" ? filteredAdSets : filteredAds;
              rows.filter((r) => selected.has(r.id)).forEach((r) => toggleMut.mutate({ id: r.id, status: "PAUSED", type: level }));
            }}>
              <Pause className="w-3.5 h-3.5" /> Pausar selecionados
            </DropdownMenuItem>
            <DropdownMenuItem disabled={selCount === 0} onClick={() => {
              const rows = level === "campaigns" ? filteredCampaigns : level === "adsets" ? filteredAdSets : filteredAds;
              rows.filter((r) => selected.has(r.id)).forEach((r) => toggleMut.mutate({ id: r.id, status: "ACTIVE", type: level }));
            }}>
              <Play className="w-3.5 h-3.5" /> Ativar selecionados
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSelected(new Set())} disabled={selCount === 0}>
              Limpar seleção ({selCount})
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por nome ou ID…"
            className="pl-8 pr-3 py-1.5 rounded-md border border-border bg-background text-xs w-64"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando…
          </div>
        ) : level === "campaigns" ? (
          <CampaignsTable
            rows={filteredCampaigns}
            selected={selected}
            onToggleSelect={toggleSelect}
            onSelectAll={(all) => setSelected(all ? new Set(filteredCampaigns.map((r) => r.id)) : new Set())}
            onToggleStatus={(id, status) => toggleMut.mutate({ id, status, type: "campaigns" })}
          />
        ) : level === "adsets" ? (
          <AdSetsTable
            rows={filteredAdSets}
            selected={selected}
            onToggleSelect={toggleSelect}
            onSelectAll={(all) => setSelected(all ? new Set(filteredAdSets.map((r) => r.id)) : new Set())}
            onToggleStatus={(id, status) => toggleMut.mutate({ id, status, type: "adsets" })}
          />
        ) : (
          <AdsTable
            rows={filteredAds}
            selected={selected}
            onToggleSelect={toggleSelect}
            onSelectAll={(all) => setSelected(all ? new Set(filteredAds.map((r) => r.id)) : new Set())}
            onToggleStatus={(id, status) => toggleMut.mutate({ id, status, type: "ads" })}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
        <div>
          {selCount > 0 ? (
            <span className="font-medium text-foreground">{selCount} selecionado(s)</span>
          ) : (
            <span>
              {level === "campaigns"
                ? "Selecione linhas para editar ou comparar. Duplicação disponível só em Conjuntos e Anúncios (1 por vez)."
                : "Selecione 1 linha para duplicar, ou várias para editar/comparar."}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <BarChart3 className="w-3 h-3" /> Métricas do período aplicado nos KPIs acima
        </div>
      </div>
      </div>





    <MetaChartsDialog
      open={chartsOpen}
      onOpenChange={setChartsOpen}
      workspaceId={workspaceId}
      level={level}
      items={chartItems}
      preset={preset}
    />
    <EditAdSetSheet
      workspaceId={workspaceId}
      open={!!editingAdSet}
      onOpenChange={(o) => { if (!o) setEditingAdSet(null); }}
      adSet={editingAdSet}
      onSaved={invalidateAll}
    />
    <EditAdSheet
      workspaceId={workspaceId}
      open={!!editingAd}
      onOpenChange={(o) => { if (!o) setEditingAd(null); }}
      ad={editingAd}
      onSaved={invalidateAll}
    />
    <MetaCompareDialog
      open={compareOpen}
      onOpenChange={setCompareOpen}
      level={level}
      preset={preset}
      items={compareItems}
    />
    </>
  );
}


// ---------- Tabelas específicas por nível ----------

type CampaignRow = {
  id: string; accountId: string; accountName: string | null; currency: string | null;
  name: string; effectiveStatus: string; objective: string | null; dailyBudget: number | null;
  thumbnailUrl?: string | null;
  spend: number; impressions: number; clicks: number; ctr: number;
  leads: number; cpl: number; roas: number;
  results?: number; resultLabel?: string; costPerResult?: number; costPerResultLabel?: string;
};

function TableHead({ selectedAll, onSelectAll, cols }: {
  selectedAll: boolean;
  onSelectAll: (v: boolean) => void;
  cols: string[];
}) {
  return (
    <thead className="bg-muted/40">
      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
        <th className="sticky left-0 z-10 bg-muted/40 px-2 py-2 w-8">
          <input type="checkbox" checked={selectedAll} onChange={(e) => onSelectAll(e.target.checked)} />
        </th>
        <th className="px-2 py-2 w-14 text-left">Ativo</th>
        <th className="sticky left-[80px] z-10 bg-muted/40 px-2 py-2 text-left min-w-[280px]">Criativo / Nome</th>
        {cols.map((c) => <th key={c} className="px-3 py-2 text-right whitespace-nowrap">{c}</th>)}
        <th className="px-2 py-2 w-10"></th>
      </tr>
    </thead>
  );
}


function CampaignsTable({
  rows, selected, onToggleSelect, onSelectAll, onToggleStatus,
}: {
  rows: CampaignRow[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (all: boolean) => void;
  onToggleStatus: (id: string, status: "ACTIVE" | "PAUSED") => void;
}) {
  if (rows.length === 0) {
    return <EmptyState message="Nenhuma campanha encontrada no período." />;
  }
  return (
    <table className="w-full text-xs border-collapse">
      <TableHead
        selectedAll={rows.length > 0 && rows.every((r) => selected.has(r.id))}
        onSelectAll={onSelectAll}
        cols={["Veiculação", "Objetivo", "Investido", "Orçamento diário", "Impressões", "Cliques", "CTR", "Resultados", "Custo/result.", "ROAS"]}
      />
      <tbody>
        {rows.map((r) => {
          const on = selected.has(r.id);
          const active = r.effectiveStatus === "ACTIVE";
          return (
            <tr key={r.id} className={cn("border-t border-border hover:bg-muted/30", on && "bg-primary/5")}>
              <td className="sticky left-0 z-10 bg-inherit px-2 py-2">
                <input type="checkbox" checked={on} onChange={() => onToggleSelect(r.id)} />
              </td>
              <td className="px-2 py-2"><Toggle on={active} onClick={() => onToggleStatus(r.id, active ? "PAUSED" : "ACTIVE")} /></td>
              <td className="sticky left-[80px] z-10 bg-inherit px-2 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CreativeThumb url={r.thumbnailUrl ?? null} alt={r.name} />
                  <div className="min-w-0">
                    <div className="font-medium truncate max-w-[260px]">{r.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[260px]">{r.accountName || r.accountId}</div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-right"><StatusPill status={r.effectiveStatus} /></td>
              <td className="px-3 py-2 text-right text-muted-foreground">{r.objective || "-"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(r.spend, r.currency)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.dailyBudget != null ? money(r.dailyBudget, r.currency) : "CBO"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(r.impressions)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(r.clicks)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.ctr.toFixed(2)}%</td>
              <td className="px-3 py-2 text-right tabular-nums" title={r.resultLabel || "Resultados"}>
                <div className="flex flex-col items-end leading-tight">
                  <span>{num(r.results ?? r.leads)}</span>
                  <span className="text-[9px] text-muted-foreground truncate max-w-[110px]">{r.resultLabel || "Leads"}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums" title={r.costPerResultLabel || "Custo por resultado"}>
                {(r.results ?? r.leads) > 0 ? money(r.costPerResult ?? r.cpl, r.currency) : "-"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.roas > 0 ? `${r.roas.toFixed(2)}x` : "-"}</td>
              <td className="px-2 py-2"><MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type AdSetRow = {
  id: string; accountId: string; accountName: string | null; currency: string | null;
  name: string; effectiveStatus: string; campaignId: string; dailyBudget: number | null; optimizationGoal: string | null;
  thumbnailUrl?: string | null;
  spend: number; impressions: number; clicks: number; ctr: number; leads: number; cpl: number; roas: number; reach: number;
  results?: number; resultLabel?: string; costPerResult?: number; costPerResultLabel?: string;
};

function AdSetsTable({
  rows, selected, onToggleSelect, onSelectAll, onToggleStatus,
}: {
  rows: AdSetRow[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (all: boolean) => void;
  onToggleStatus: (id: string, status: "ACTIVE" | "PAUSED") => void;
}) {
  if (rows.length === 0) return <EmptyState message="Nenhum conjunto de anúncios encontrado." />;
  return (
    <table className="w-full text-xs border-collapse">
      <TableHead
        selectedAll={rows.length > 0 && rows.every((r) => selected.has(r.id))}
        onSelectAll={onSelectAll}
        cols={["Veiculação", "Otimização", "Investido", "Orçamento diário", "Alcance", "Impressões", "CTR", "Resultados", "Custo/result.", "ROAS"]}
      />
      <tbody>
        {rows.map((r) => {
          const on = selected.has(r.id);
          const active = r.effectiveStatus === "ACTIVE";
          return (
            <tr key={r.id} className={cn("border-t border-border hover:bg-muted/30", on && "bg-primary/5")}>
              <td className="sticky left-0 z-10 bg-inherit px-2 py-2">
                <input type="checkbox" checked={on} onChange={() => onToggleSelect(r.id)} />
              </td>
              <td className="px-2 py-2"><Toggle on={active} onClick={() => onToggleStatus(r.id, active ? "PAUSED" : "ACTIVE")} /></td>
              <td className="sticky left-[80px] z-10 bg-inherit px-2 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CreativeThumb url={r.thumbnailUrl ?? null} alt={r.name} />
                  <div className="min-w-0">
                    <div className="font-medium truncate max-w-[260px]">{r.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[260px]">{r.accountName || r.accountId}</div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-right"><StatusPill status={r.effectiveStatus} /></td>
              <td className="px-3 py-2 text-right text-muted-foreground">{r.optimizationGoal || "-"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(r.spend, r.currency)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.dailyBudget != null ? money(r.dailyBudget, r.currency) : "CBO"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(r.reach)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(r.impressions)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.ctr.toFixed(2)}%</td>
              <td className="px-3 py-2 text-right tabular-nums" title={r.resultLabel || "Resultados"}>
                <div className="flex flex-col items-end leading-tight">
                  <span>{num(r.results ?? r.leads)}</span>
                  <span className="text-[9px] text-muted-foreground truncate max-w-[110px]">{r.resultLabel || "Leads"}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums" title={r.costPerResultLabel || "Custo por resultado"}>
                {(r.results ?? r.leads) > 0 ? money(r.costPerResult ?? r.cpl, r.currency) : "-"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.roas > 0 ? `${r.roas.toFixed(2)}x` : "-"}</td>
              <td className="px-2 py-2"><MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type AdRow = {
  id: string; accountId: string; accountName: string | null; currency: string | null;
  name: string; effectiveStatus: string; campaignId: string; adsetId: string;
  thumbnailUrl?: string | null;
  spend: number; impressions: number; clicks: number; ctr: number; leads: number; cpl: number; roas: number; reach: number;
  results?: number; resultLabel?: string; costPerResult?: number; costPerResultLabel?: string;
};

function AdsTable({
  rows, selected, onToggleSelect, onSelectAll, onToggleStatus,
}: {
  rows: AdRow[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (all: boolean) => void;
  onToggleStatus: (id: string, status: "ACTIVE" | "PAUSED") => void;
}) {
  if (rows.length === 0) return <EmptyState message="Nenhum anúncio encontrado." />;
  return (
    <table className="w-full text-xs border-collapse">
      <TableHead
        selectedAll={rows.length > 0 && rows.every((r) => selected.has(r.id))}
        onSelectAll={onSelectAll}
        cols={["Veiculação", "Investido", "Alcance", "Impressões", "Cliques", "CTR", "Resultados", "Custo/result.", "ROAS"]}
      />
      <tbody>
        {rows.map((r) => {
          const on = selected.has(r.id);
          const active = r.effectiveStatus === "ACTIVE";
          return (
            <tr key={r.id} className={cn("border-t border-border hover:bg-muted/30", on && "bg-primary/5")}>
              <td className="sticky left-0 z-10 bg-inherit px-2 py-2">
                <input type="checkbox" checked={on} onChange={() => onToggleSelect(r.id)} />
              </td>
              <td className="px-2 py-2"><Toggle on={active} onClick={() => onToggleStatus(r.id, active ? "PAUSED" : "ACTIVE")} /></td>
              <td className="sticky left-[80px] z-10 bg-inherit px-2 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CreativeThumb url={r.thumbnailUrl ?? null} alt={r.name} />
                  <div className="min-w-0">
                    <div className="font-medium truncate max-w-[260px]">{r.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[260px]">{r.accountName || r.accountId}</div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-right"><StatusPill status={r.effectiveStatus} /></td>
              <td className="px-3 py-2 text-right tabular-nums">{money(r.spend, r.currency)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(r.reach)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(r.impressions)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(r.clicks)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.ctr.toFixed(2)}%</td>
              <td className="px-3 py-2 text-right tabular-nums" title={r.resultLabel || "Resultados"}>
                <div className="flex flex-col items-end leading-tight">
                  <span>{num(r.results ?? r.leads)}</span>
                  <span className="text-[9px] text-muted-foreground truncate max-w-[110px]">{r.resultLabel || "Leads"}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums" title={r.costPerResultLabel || "Custo por resultado"}>
                {(r.results ?? r.leads) > 0 ? money(r.costPerResult ?? r.cpl, r.currency) : "-"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.roas > 0 ? `${r.roas.toFixed(2)}x` : "-"}</td>
              <td className="px-2 py-2"><MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
      <AlertCircle className="w-5 h-5" /> {message}
    </div>
  );
}
