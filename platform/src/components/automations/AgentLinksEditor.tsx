import { useMemo, useState } from "react";
import { Link2, Plus, Trash2, Radar, Copy, Check, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTrackedLinkSites, createTrackedLink, type TrackedLinkSite } from "@/lib/tracked-links.functions";

export type AgentLink = {
  id: string;
  label: string;
  url: string;
  when?: string;
  /** URL original quando o link virou link rastreado. */
  targetUrl?: string;
  /** Slug do link curto (/r/<slug>). */
  trackedSlug?: string;
};

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function normDomain(d: string) {
  return d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
}

function matchSite(url: string, sites: TrackedLinkSite[]) {
  const h = hostOf(url);
  if (!h) return null;
  return (
    sites.find((s) => {
      const d = normDomain(s.domain);
      return d && (h === d || h.endsWith(`.${d}`));
    }) ?? null
  );
}

function slugify(v: string) {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Biblioteca de links do agente IA — vale para o Agente de Prompt e para o
 * Fluxo de Objetivos. Links de sites já trackeados podem virar link curto
 * rastreado (/r/<slug>), identificando agente e etapa nas métricas.
 */
export function AgentLinksEditor({
  value,
  onChange,
  workspaceId,
  agentId,
  agentName,
  contextLabel,
  compact,
}: {
  value: AgentLink[];
  onChange: (v: AgentLink[]) => void;
  workspaceId?: string | null;
  agentId?: string | null;
  agentName?: string;
  contextLabel?: string;
  compact?: boolean;
}) {
  const links = value ?? [];
  const patch = (i: number, p: Partial<AgentLink>) =>
    onChange(links.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const sitesFn = useServerFn(listTrackedLinkSites);
  const sitesQ = useQuery({
    queryKey: ["tracked-link-sites", workspaceId],
    queryFn: () => sitesFn({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
  const sites = (sitesQ.data ?? []) as TrackedLinkSite[];

  return (
    <div className={compact ? "" : "border-t border-border pt-3"}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="min-w-0">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" /> Links que o agente pode enviar
          </label>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Link normal ou <strong>link rastreado</strong>: se o site já estiver no Tracking, o link vira um
            endereço curto do agente e cada clique aparece no Tracking e no Dashboard com o nome do agente e da
            etapa.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            onChange([...links, { id: `lnk-${Date.now()}`, label: "", url: "", when: "" }])
          }
          className="shrink-0 text-[11px] flex items-center gap-1 border border-border rounded px-2 py-1 hover:bg-muted/40"
        >
          <Plus className="w-3 h-3" /> Adicionar link
        </button>
      </div>

      {links.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nenhum link cadastrado. Sem link cadastrado, o agente é orientado a nunca enviar URLs.
        </p>
      ) : (
        <div className="space-y-2">
          {links.map((l, i) => (
            <LinkRow
              key={l.id}
              link={l}
              sites={sites}
              workspaceId={workspaceId}
              agentId={agentId ?? null}
              agentName={agentName}
              contextLabel={contextLabel}
              onPatch={(p) => patch(i, p)}
              onRemove={() => onChange(links.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LinkRow({
  link,
  sites,
  workspaceId,
  agentId,
  agentName,
  contextLabel,
  onPatch,
  onRemove,
}: {
  link: AgentLink;
  sites: TrackedLinkSite[];
  workspaceId?: string | null;
  agentId: string | null;
  agentName?: string;
  contextLabel?: string;
  onPatch: (p: Partial<AgentLink>) => void;
  onRemove: () => void;
}) {
  const createFn = useServerFn(createTrackedLink);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [slugDraft, setSlugDraft] = useState("");

  const isTracked = Boolean(link.trackedSlug);
  const rawUrl = isTracked ? (link.targetUrl ?? "") : link.url;
  const site = useMemo(() => matchSite(rawUrl, sites), [rawUrl, sites]);

  const suggestion =
    slugify(`${agentName ?? "agente"}-${link.label || contextLabel || "link"}`) || "agente-link";

  async function generate() {
    if (!workspaceId) return;
    setBusy(true);
    setErr(null);
    try {
      const out = await createFn({
        data: {
          workspaceId,
          targetUrl: rawUrl,
          slug: (slugDraft || suggestion).trim(),
          agentId: agentId ?? undefined,
          agentName: agentName || undefined,
          contextLabel: contextLabel || undefined,
          linkLabel: link.label || undefined,
        },
      });
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      onPatch({ targetUrl: rawUrl, trackedSlug: out.slug, url: `${origin}/r/${out.slug}` });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-border rounded p-2 space-y-1.5 bg-muted/20">
      <div className="flex items-center gap-1.5">
        <input
          value={link.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder="Nome do link (ex: Catálogo de produtos)"
          className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive p-1"
          aria-label="Remover link"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <input
        value={rawUrl}
        onChange={(e) =>
          isTracked ? onPatch({ targetUrl: e.target.value }) : onPatch({ url: e.target.value })
        }
        placeholder="https://..."
        className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono"
      />

      {isTracked ? (
        <div className="rounded border border-emerald-500/40 bg-emerald-500/5 p-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <Radar className="w-3 h-3" /> Link rastreado do agente
          </div>
          <div className="flex items-center gap-1.5">
            <code className="flex-1 truncate text-[11px] font-mono bg-background border border-border rounded px-2 py-1">
              {link.url}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(link.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="p-1 text-muted-foreground hover:text-foreground"
              aria-label="Copiar link rastreado"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Cada clique entra no Tracking como <strong>link_click</strong> com agente
            {agentName ? ` “${agentName}”` : ""}
            {contextLabel ? ` · etapa “${contextLabel}”` : ""}.
          </p>
          <button
            type="button"
            onClick={() => onPatch({ url: link.targetUrl ?? link.url, targetUrl: undefined, trackedSlug: undefined })}
            className="text-[10px] underline text-muted-foreground hover:text-foreground"
          >
            Voltar a usar o link normal
          </button>
        </div>
      ) : site ? (
        <div className="rounded border border-primary/30 bg-primary/5 p-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-primary font-semibold uppercase tracking-wider">
            <Radar className="w-3 h-3" /> Site trackeado: {site.name || site.domain}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground font-mono">/r/</span>
            <input
              value={slugDraft}
              onChange={(e) => setSlugDraft(slugify(e.target.value))}
              placeholder={suggestion}
              className="flex-1 bg-background border border-border rounded px-2 py-1 text-[11px] font-mono"
            />
            <button
              type="button"
              onClick={generate}
              disabled={busy || !workspaceId}
              className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radar className="w-3 h-3" />} Gerar link
              rastreado
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Opcional. Sem gerar, o agente envia o link normal do jeito que está aí em cima.
          </p>
          {err && <p className="text-[10px] text-destructive">{err}</p>}
        </div>
      ) : rawUrl.trim() ? (
        <p className="text-[10px] text-muted-foreground">
          Domínio fora do Tracking — o agente envia como link normal. Cadastre o site em Tracking → Fontes pra
          poder rastrear.
        </p>
      ) : null}

      <input
        value={link.when ?? ""}
        onChange={(e) => onPatch({ when: e.target.value })}
        placeholder="Enviar quando... (ex: o lead pedir os preços)"
        className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
      />
    </div>
  );
}
