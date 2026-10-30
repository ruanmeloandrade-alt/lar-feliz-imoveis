import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  listCreativeRanking,
  getCreativeAiCritique,
  generateCreativeVariants,
  compareCreativesWithAi,
} from "@/lib/meta-creatives.functions";
import { Sparkles, Loader2, Wand2, Copy, X, ImageOff, Trophy, Maximize2, GitCompare, CheckSquare, Square, Play } from "lucide-react";
import { toast } from "sonner";

function money(n: number, currency?: string | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(n || 0);
}
function num(n: number, digits = 0) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(n || 0);
}

const PRESETS = [
  { v: "today", l: "Hoje" },
  { v: "yesterday", l: "Ontem" },
  { v: "last_7d", l: "7 dias" },
  { v: "last_14d", l: "14 dias" },
  { v: "last_30d", l: "30 dias" },
  { v: "this_month", l: "Este mês" },
  { v: "last_month", l: "Mês passado" },
] as const;

const SORTS = [
  { v: "spend", l: "Mais gastam" },
  { v: "ctr", l: "Maior CTR" },
  { v: "cpl", l: "Menor CPL" },
  { v: "roas", l: "Maior ROAS" },
  { v: "clicks", l: "Mais cliques" },
] as const;

type Row = Awaited<ReturnType<typeof listCreativeRanking>>["rows"][number];

/** Renderiza mídia do criativo. Vídeo: player nativo com controles. Imagem: full-res. */
function MediaThumb({
  creative,
  fit = "cover",
  playable = false,
}: {
  creative: Pick<Row, "thumbnail" | "mediaType" | "videoUrl">;
  fit?: "cover" | "contain";
  playable?: boolean;
}) {
  const objectClass = fit === "cover" ? "object-cover" : "object-contain";
  if (creative.mediaType === "video" && playable && creative.videoUrl) {
    return (
      <video
        src={creative.videoUrl}
        poster={creative.thumbnail || undefined}
        controls
        playsInline
        preload="metadata"
        className={`w-full h-full ${objectClass} bg-black`}
      />
    );
  }
  if (creative.thumbnail) {
    return (
      <>
        <img
          src={creative.thumbnail}
          alt=""
          loading="lazy"
          decoding="async"
          className={`w-full h-full ${objectClass}`}
        />
        {creative.mediaType === "video" ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-10 w-10 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
          </div>
        ) : null}
      </>
    );
  }
  return <ImageOff className="w-6 h-6 text-muted-foreground" />;
}

export function MetaCreativesPanel({
  workspaceId,
  selectedAccountIds,
  preset,
  sortBy,
}: {
  workspaceId: string;
  selectedAccountIds?: string[];
  preset: string;
  sortBy: (typeof SORTS)[number]["v"];
}) {
  const [selected, setSelected] = useState<Row | null>(null);
  const [expanded, setExpanded] = useState<Row | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState<Row[] | null>(null);

  const listFn = useServerFn(listCreativeRanking);
  const listQ = useQuery({
    queryKey: ["meta-creatives", workspaceId, selectedAccountIds ?? "all", preset, sortBy],
    queryFn: () => listFn({ data: { workspaceId, adAccountIds: selectedAccountIds, preset, sortBy } }),
  });

  const rows = listQ.data?.rows ?? [];
  const pickedRows = useMemo(() => rows.filter((r) => pickedIds.includes(r.adId)), [rows, pickedIds]);

  function togglePick(adId: string) {
    setPickedIds((prev) => {
      if (prev.includes(adId)) return prev.filter((id) => id !== adId);
      if (prev.length >= 4) {
        toast.warning("Máximo de 4 criativos por comparação.");
        return prev;
      }
      return [...prev, adId];
    });
  }

  function enterCompareMode() {
    setCompareMode(true);
    setPickedIds([]);
  }
  function exitCompareMode() {
    setCompareMode(false);
    setPickedIds([]);
  }

  const customMatch = preset.match(/^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
  const presetLabel = customMatch
    ? `${customMatch[1].split("-").reverse().join("/")} → ${customMatch[2].split("-").reverse().join("/")}`
    : (PRESETS.find((p) => p.v === preset)?.l ?? preset);
  const sortLabel = SORTS.find((s) => s.v === sortBy)?.l ?? "ordenação atual";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">Comparativo de criativos + IA</div>
            <div className="text-[11px] text-muted-foreground">Usando o filtro global: {presetLabel} · {sortLabel}.</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!compareMode ? (
            <button
              onClick={enterCompareMode}
              disabled={!rows.length}
              className="h-9 px-3 rounded-md border border-border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
            >
              <GitCompare className="w-3.5 h-3.5" /> Comparar
            </button>
          ) : (
            <>
              <button
                onClick={() => pickedRows.length >= 2 && setCompareOpen(pickedRows)}
                disabled={pickedRows.length < 2}
                className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" /> Comparar {pickedRows.length}/4
              </button>
              <button
                onClick={exitCompareMode}
                className="h-9 px-3 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted"
              >
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
            </>
          )}
        </div>
      </div>

      {compareMode ? (
        <div className="text-[11px] text-muted-foreground bg-primary/5 border border-primary/20 rounded-md px-3 py-2">
          Selecione de 2 a 4 criativos para comparar lado a lado com análise de IA.
        </div>
      ) : null}

      {listQ.isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando criativos…
        </div>
      ) : listQ.error ? (
        <div className="text-sm text-destructive">{(listQ.error as Error).message}</div>
      ) : !rows.length ? (
        <div className="text-sm text-muted-foreground">Nenhum anúncio no filtro global selecionado.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
          {rows.map((r, i) => {
            const picked = pickedIds.includes(r.adId);
            return (
              <div
                key={r.adId}
                className={`group relative rounded-lg border bg-background/40 overflow-hidden flex flex-col transition ${
                  picked ? "border-primary ring-2 ring-primary/40" : "border-border"
                }`}
              >
                <div className="relative aspect-square bg-muted/40 flex items-center justify-center">
                  <MediaThumb creative={r} fit="cover" />

                  <div className="absolute top-1.5 left-1.5 rounded bg-background/85 backdrop-blur px-1.5 py-0.5 text-[9px] font-semibold">
                    #{i + 1}
                  </div>
                  <div className={`absolute top-1.5 right-1.5 rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                    r.status === "ACTIVE" ? "bg-emerald-500/25 text-emerald-500" : "bg-muted text-muted-foreground"
                  }`}>{r.status === "ACTIVE" ? "ATIVO" : r.status}</div>
                  {!compareMode ? (
                    <button
                      onClick={() => setExpanded(r)}
                      title="Expandir"
                      className="absolute bottom-1.5 right-1.5 h-7 w-7 rounded-md bg-background/85 backdrop-blur border border-border inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-background"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => togglePick(r.adId)}
                      className="absolute inset-0 bg-transparent"
                      aria-label="Selecionar para comparar"
                    />
                  )}
                  {compareMode ? (
                    <div className={`absolute bottom-1.5 right-1.5 h-7 w-7 rounded-md inline-flex items-center justify-center backdrop-blur ${
                      picked ? "bg-primary text-primary-foreground" : "bg-background/85 border border-border"
                    }`}>
                      {picked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    </div>
                  ) : null}
                </div>
                <div className="p-2 space-y-1.5 flex-1 flex flex-col">
                  <div className="text-[11px] font-medium leading-tight line-clamp-2">{r.adName}</div>
                  <div className="grid grid-cols-2 gap-1 text-[9px] tabular-nums">
                    <MiniMetric l="Gasto" v={money(r.spend, r.currency)} />
                    <MiniMetric l="CTR" v={`${num(r.ctr, 2)}%`} />
                    <MiniMetric l="CPL" v={r.cpl > 0 ? money(r.cpl, r.currency) : "N/D"} />
                    <MiniMetric l="ROAS" v={r.roas > 0 ? `${num(r.roas, 2)}x` : "N/D"} />
                  </div>
                  {!compareMode ? (
                    <button
                      onClick={() => setSelected(r)}
                      className="mt-1 h-7 rounded bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-medium inline-flex items-center justify-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> Analisar IA
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {expanded && (
        <ExpandedModal creative={expanded} onClose={() => setExpanded(null)} onAnalyze={() => { setSelected(expanded); setExpanded(null); }} />
      )}

      {selected && (
        <CreativeAiModal
          workspaceId={workspaceId}
          creative={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {compareOpen && (
        <CompareAiModal
          workspaceId={workspaceId}
          creatives={compareOpen}
          onClose={() => { setCompareOpen(null); exitCompareMode(); }}
        />
      )}
    </div>
  );
}

function MiniMetric({ l, v }: { l: string; v: string }) {
  return (
    <div className="rounded bg-muted/40 px-1.5 py-0.5">
      <div className="text-[8px] uppercase tracking-wider text-muted-foreground leading-none">{l}</div>
      <div className="font-semibold text-[10px] leading-tight truncate">{v}</div>
    </div>
  );
}

function ExpandedModal({
  creative, onClose, onAnalyze,
}: { creative: Row; onClose: () => void; onAnalyze: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-auto rounded-xl border border-border bg-card p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 h-8 w-8 rounded-md hover:bg-muted inline-flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center">
          <MediaThumb creative={creative} fit="contain" playable />
        </div>


        <div className="space-y-2">
          <div className="text-base font-semibold">{creative.adName}</div>
          <div className="text-xs text-muted-foreground">{creative.status}</div>
          {creative.headline ? <div className="text-sm font-medium">{creative.headline}</div> : null}
          {creative.body ? <div className="text-sm text-muted-foreground whitespace-pre-wrap">{creative.body}</div> : null}
          <div className="grid grid-cols-4 gap-2 pt-2">
            <MiniMetric l="Gasto" v={money(creative.spend, creative.currency)} />
            <MiniMetric l="CTR" v={`${num(creative.ctr, 2)}%`} />
            <MiniMetric l="CPL" v={creative.cpl > 0 ? money(creative.cpl, creative.currency) : "N/D"} />
            <MiniMetric l="ROAS" v={creative.roas > 0 ? `${num(creative.roas, 2)}x` : "N/D"} />
          </div>
        </div>
        <button
          onClick={onAnalyze}
          className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4" /> Analisar com IA
        </button>
      </div>
    </div>
  );
}

function CreativeAiModal({
  workspaceId, creative, onClose,
}: { workspaceId: string; creative: Row; onClose: () => void }) {
  const critiqueFn = useServerFn(getCreativeAiCritique);
  const variantsFn = useServerFn(generateCreativeVariants);
  const [angle, setAngle] = useState("");
  const [count, setCount] = useState(3);

  const critiqueQ = useQuery({
    queryKey: ["meta-creative-critique", workspaceId, creative.adId],
    queryFn: () => critiqueFn({ data: { workspaceId, adId: creative.adId } }),
  });

  const variantsM = useMutation({
    mutationFn: () => variantsFn({ data: { workspaceId, adId: creative.adId, count, angle: angle || undefined } }),
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => toast.success("Variações geradas."),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-auto rounded-xl border border-border bg-card p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 h-8 w-8 rounded-md hover:bg-muted inline-flex items-center justify-center"
        ><X className="w-4 h-4" /></button>

        <div className="flex items-center gap-3">
          {creative.thumbnail ? (
            <img src={creative.thumbnail} alt="" className="w-16 h-16 rounded-md object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center"><ImageOff className="w-6 h-6 text-muted-foreground" /></div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{creative.adName}</div>
            <div className="text-[11px] text-muted-foreground">{creative.status} · CTR {num(creative.ctr, 2)}% · CPL {creative.cpl > 0 ? money(creative.cpl, creative.currency) : "N/D"}</div>
          </div>
        </div>

        <section className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" /> Crítica da IA
          </div>
          {critiqueQ.isLoading ? (
            <div className="py-4 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Analisando…</div>
          ) : critiqueQ.error ? (
            <div className="text-sm text-destructive">{(critiqueQ.error as Error).message}</div>
          ) : (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{critiqueQ.data?.critique}</pre>
          )}
        </section>

        <section className="space-y-2 border-t border-border pt-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Wand2 className="w-3.5 h-3.5" /> Gerar variações de texto
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[11px] text-muted-foreground">Ângulo (opcional)</label>
              <input
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                placeholder="ex: dor, prova social, urgência…"
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Qtd</label>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="mt-1 h-9 w-16 rounded-md border border-border bg-background px-2 text-sm"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <button
              onClick={() => variantsM.mutate()}
              disabled={variantsM.isPending}
              className="h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 inline-flex items-center gap-2 disabled:opacity-60"
            >
              {variantsM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Gerar
            </button>
          </div>

          {variantsM.data && (
            <div className="space-y-3 pt-2">
              {variantsM.data.variants.length === 0 ? (
                <div className="text-sm text-muted-foreground">A IA não retornou variações. Tente de novo com outro ângulo.</div>
              ) : variantsM.data.variants.map((v, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Variação {i + 1} · {v.angle}</div>
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(`${v.headline}\n\n${v.primary_text}\n\nCTA: ${v.cta}`);
                        toast.success("Copiado.");
                      }}
                      className="text-[11px] text-primary inline-flex items-center gap-1 hover:underline"
                    ><Copy className="w-3 h-3" /> Copiar</button>
                  </div>
                  <div className="text-sm font-semibold">{v.headline}</div>
                  <div className="text-sm whitespace-pre-wrap text-muted-foreground">{v.primary_text}</div>
                  <div className="text-[11px] text-muted-foreground">CTA: <span className="font-mono">{v.cta}</span></div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CompareAiModal({
  workspaceId, creatives, onClose,
}: { workspaceId: string; creatives: Row[]; onClose: () => void }) {
  const compareFn = useServerFn(compareCreativesWithAi);
  const compareQ = useQuery({
    queryKey: ["meta-creative-compare", workspaceId, creatives.map((c) => c.adId).join(",")],
    queryFn: () => compareFn({ data: { workspaceId, adIds: creatives.map((c) => c.adId) } }),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-6xl max-h-[92vh] overflow-auto rounded-xl border border-border bg-card p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 h-8 w-8 rounded-md hover:bg-muted inline-flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-primary" />
          <div>
            <div className="text-base font-semibold">Comparativo A/B · {creatives.length} criativos</div>
            <div className="text-[11px] text-muted-foreground">Análise lado a lado com veredicto da IA.</div>
          </div>
        </div>

        <div className={`grid gap-3 ${creatives.length === 2 ? "grid-cols-2" : creatives.length === 3 ? "grid-cols-3" : "grid-cols-2 md:grid-cols-4"}`}>
          {creatives.map((c, i) => (
            <div key={c.adId} className="rounded-lg border border-border bg-background/40 overflow-hidden flex flex-col">
              <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                <MediaThumb creative={c} fit="contain" playable />
                <div className="absolute top-2 left-2 rounded-md bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-bold z-10">
                  {String.fromCharCode(65 + i)}
                </div>
              </div>

              <div className="p-3 space-y-2 flex-1">
                <div className="text-xs font-semibold line-clamp-2">{c.adName}</div>
                <div className="grid grid-cols-2 gap-1">
                  <MiniMetric l="Gasto" v={money(c.spend, c.currency)} />
                  <MiniMetric l="CTR" v={`${num(c.ctr, 2)}%`} />
                  <MiniMetric l="CPL" v={c.cpl > 0 ? money(c.cpl, c.currency) : "N/D"} />
                  <MiniMetric l="ROAS" v={c.roas > 0 ? `${num(c.roas, 2)}x` : "N/D"} />
                  <MiniMetric l="Cliques" v={num(c.clicks)} />
                  <MiniMetric l="Leads" v={num(c.leads)} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <section className="space-y-2 border-t border-border pt-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" /> Veredicto da IA
          </div>
          {compareQ.isLoading ? (
            <div className="py-6 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Comparando criativos…</div>
          ) : compareQ.error ? (
            <div className="text-sm text-destructive">{(compareQ.error as Error).message}</div>
          ) : (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{compareQ.data?.analysis}</pre>
          )}
        </section>
      </div>
    </div>
  );
}
