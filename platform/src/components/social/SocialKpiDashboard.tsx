import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Settings2, Users, Heart, MessageCircle, Eye, Send, TrendingUp, CalendarClock, FileText, AlertTriangle, Sparkles, Instagram, Facebook, BarChart3, Bookmark, X, GripVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  SOCIAL_KPI_CATALOG,
  SOCIAL_KPI_GROUPS,
  DEFAULT_SOCIAL_KPIS,
  type SocialKpiDef,
  type SocialKpiChannel,
} from "@/lib/social-dashboard-kpis";
import { useSocialKpiSelection } from "@/hooks/useSocialKpiSelection";
import { getMetaSocialAccountInsights, listSocialInsightChannels } from "@/lib/meta.functions";

const ICONS: Record<string, typeof Users> = {
  followers_total: Users,
  followers_instagram: Instagram,
  followers_facebook: Facebook,
  accounts_connected: Users,
  likes_total: Heart,
  comments_total: MessageCircle,
  shares_total: Send,
  saves_total: Bookmark,
  interactions_total: TrendingUp,
  engagement_rate_avg: TrendingUp,
  reach_total: Eye,
  impressions_total: Eye,
  profile_views_total: Eye,
  video_views_total: Eye,
  posts_published: FileText,
  posts_scheduled: CalendarClock,
  posts_pending_approval: FileText,
  posts_draft: FileText,
  posts_failed: AlertTriangle,
  ideas_available: Sparkles,
  likes_avg: Heart,
  comments_avg: MessageCircle,
  reach_avg: Eye,
  impressions_avg: Eye,
};

type Values = Record<string, number>;

type InsightChannel = {
  id: string;
  type: "ig" | "fb";
  label: string;
  pageId: string | null;
  avatarUrl: string | null;
  followers: number | null;
};

type SocialPostChannel = "ig_feed" | "ig_story" | "ig_reels" | "fb_feed" | "fb_story" | "fb_reels";

const CHANNEL_TO_POST_CHANNELS: Record<"ig" | "fb", SocialPostChannel[]> = {
  ig: ["ig_feed", "ig_story", "ig_reels"],
  fb: ["fb_feed", "fb_story", "fb_reels"],
};

function formatValue(def: SocialKpiDef, v: number): string {
  if (def.unit === "percent") return `${v.toFixed(2)}%`;
  if (!Number.isFinite(v)) return "0";
  return Math.round(v).toLocaleString("pt-BR");
}

export function SocialKpiDashboard({ workspaceId }: { workspaceId: string | null }) {
  const { keys, save } = useSocialKpiSelection(workspaceId);
  const [values, setValues] = useState<Values>({});
  const [channels, setChannels] = useState<InsightChannel[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const listChannels = useServerFn(listSocialInsightChannels);
  const loadInsights = useServerFn(getMetaSocialAccountInsights);

  useEffect(() => {
    if (!workspaceId) return;
    let cancel = false;
    (async () => {
      try {
        const res = await listChannels({ data: { workspaceId } });
        if (cancel) return;
        const next = res.channels as InsightChannel[];
        setChannels(next);
        setSelectedChannelIds((current) => {
          const valid = current.filter((id) => next.some((c) => c.id === id));
          return valid.length ? valid : next.map((c) => c.id);
        });
      } catch (e) {
        if (!cancel) setInsightError(e instanceof Error ? e.message : "Não foi possível carregar canais Meta.");
      }
    })();
    return () => { cancel = true; };
  }, [workspaceId, listChannels]);

  const selectedChannels = useMemo(
    () => channels.filter((c) => selectedChannelIds.includes(c.id)),
    [channels, selectedChannelIds],
  );
  const selectedTypes = useMemo(
    () => Array.from(new Set(selectedChannels.map((c) => c.type))) as Array<"ig" | "fb">,
    [selectedChannels],
  );
  const selectedAccountsByType = useMemo(() => ({
    ig: new Set(selectedChannels.filter((c) => c.type === "ig").map((c) => c.id)),
    fb: new Set(selectedChannels.filter((c) => c.type === "fb").map((c) => c.id)),
  }), [selectedChannels]);

  const toggleInsightChannel = (id: string) => {
    setSelectedChannelIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };

  useEffect(() => {
    if (!workspaceId) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      setInsightError(null);
      const hasSelection = selectedChannels.length > 0;
      const postChannelQuery = hasSelection
        ? supabase.from("social_post_channels")
          .select("post_id,status,channel,target_ref")
          .eq("workspace_id", workspaceId)
          .in("channel", selectedTypes.flatMap((type) => CHANNEL_TO_POST_CHANNELS[type]))
        : supabase.from("social_post_channels")
          .select("post_id,status,channel,target_ref")
          .eq("workspace_id", workspaceId);
      const metricQuery = hasSelection
        ? supabase.from("social_post_metrics")
          .select("likes,comments,shares,saves,reach,impressions,video_views,engagement_rate,channel")
          .eq("workspace_id", workspaceId)
          .in("channel", selectedTypes.flatMap((type) => CHANNEL_TO_POST_CHANNELS[type]))
        : supabase.from("social_post_metrics")
          .select("likes,comments,shares,saves,reach,impressions,video_views,engagement_rate,channel")
          .eq("workspace_id", workspaceId);
      const [postChannelsRes, postsRes, metricsRes, ideasRes, accountRes] = await Promise.all([
        postChannelQuery,
        supabase.from("social_posts").select("id,status").eq("workspace_id", workspaceId),
        metricQuery,
        supabase.from("social_ideas")
          .select("id,used").eq("workspace_id", workspaceId).eq("used", false),
        hasSelection
          ? loadInsights({
            data: {
              workspaceId,
              accounts: selectedChannels.map((channel) => ({ channelType: channel.type, accountId: channel.id })),
            },
          })
          : Promise.resolve(null),
      ]);
      if (cancel) return;

      const channelMatchesSelection = (row: { channel: string; target_ref?: string | null }) => {
        if (!hasSelection) return true;
        const type = row.channel.startsWith("ig_") ? "ig" : row.channel.startsWith("fb_") ? "fb" : null;
        if (!type || !selectedTypes.includes(type)) return false;
        const selectedForType = selectedAccountsByType[type];
        if (!row.target_ref) return selectedForType.size > 0;
        return selectedForType.has(row.target_ref);
      };

      const postChannels = (postChannelsRes.data ?? []).filter(channelMatchesSelection);
      const channelPostIds = hasSelection ? new Set(postChannels.map((p) => p.post_id)) : null;
      const posts = (postsRes.data ?? []).filter((post) => !channelPostIds || channelPostIds.has(post.id));
      const metrics = metricsRes.data ?? [];
      const ideas = ideasRes.data ?? [];
      const accountValues = (accountRes?.values ?? {}) as Values;
      if (accountRes?.errors?.length && Object.keys(accountValues).length === 0) {
        setInsightError("A Meta não liberou esses insights para este canal/período. Verifique permissões da integração.");
      }

      const sum = (field: keyof (typeof metrics)[number]) =>
        metrics.reduce((s, m) => s + (Number(m[field] as number | null | undefined) || 0), 0);
      const avg = (field: keyof (typeof metrics)[number]) => {
        if (metrics.length === 0) return 0;
        return sum(field) / metrics.length;
      };

      const likes = sum("likes");
      const comments = sum("comments");
      const shares = sum("shares");
      const saves = sum("saves");
      const reach = sum("reach");
      const impressions = sum("impressions");
      const videoViews = sum("video_views");

      const publishedCount = posts.filter((p) => p.status === "published").length;
      const engRateAvg = metrics.length > 0
        ? metrics.reduce((s, m) => s + (Number(m.engagement_rate) || 0), 0) / metrics.length
        : 0;

      // Se engagement_rate vier em fração (0-1), converte pra %
      const engRatePct = engRateAvg > 0 && engRateAvg <= 1 ? engRateAvg * 100 : engRateAvg;

      const v: Values = {
        followers_total: 0,
        followers_instagram: 0,
        followers_facebook: 0,
        accounts_connected: selectedChannels.length,

        likes_total: likes,
        comments_total: comments,
        shares_total: shares,
        saves_total: saves,
        interactions_total: likes + comments + shares + saves,
        engagement_rate_avg: engRatePct,

        reach_total: hasSelection ? 0 : reach,
        impressions_total: hasSelection ? 0 : impressions,
        video_views_total: hasSelection ? 0 : videoViews,

        posts_published: new Set([
          ...posts.filter((p) => p.status === "published").map((p) => p.id),
          ...postChannels.filter((p) => p.status === "published").map((p) => p.post_id),
        ]).size,
        posts_scheduled: posts.filter((p) => p.status === "scheduled").length,
        posts_pending_approval: posts.filter((p) => p.status === "pending_approval").length,
        posts_draft: posts.filter((p) => p.status === "draft").length,
        posts_failed: new Set(postChannels.filter((p) => p.status === "failed").map((p) => p.post_id)).size,
        ideas_available: ideas.length,

        likes_avg: publishedCount > 0 ? likes / publishedCount : avg("likes"),
        comments_avg: publishedCount > 0 ? comments / publishedCount : avg("comments"),
        reach_avg: publishedCount > 0 ? reach / publishedCount : avg("reach"),
        impressions_avg: publishedCount > 0 ? impressions / publishedCount : avg("impressions"),
        ...accountValues,
      };
      setValues(v);
      setLoading(false);
    })().catch((e) => {
      if (cancel) return;
      setInsightError(e instanceof Error ? e.message : "Erro ao buscar insights do canal.");
      setLoading(false);
    });
    return () => { cancel = true; };
  }, [workspaceId, selectedChannels, selectedTypes, selectedAccountsByType, loadInsights]);

  const selectedKpiChannels = useMemo<SocialKpiChannel[]>(
    () => selectedTypes.length ? selectedTypes : ["local"],
    [selectedTypes],
  );
  const items = useMemo(() => {
    return keys
      .map((k) => SOCIAL_KPI_CATALOG.find((d) => d.key === k))
      .filter((x): x is SocialKpiDef => !!x && selectedKpiChannels.some((channel) => x.channels.includes(channel)));
  }, [keys, selectedKpiChannels]);

  if (!workspaceId) return null;

  return (
    <div className="mb-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Painel Social Media
          </h3>
          {loading && <span className="text-[10px] text-muted-foreground/60">carregando…</span>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <button
              type="button"
              onClick={() => setChannelsOpen((open) => !open)}
              className="h-8 min-w-[240px] max-w-full rounded-md border border-border bg-background px-2 text-left text-xs outline-none hover:bg-muted/50 focus:ring-2 focus:ring-ring"
              disabled={channels.length === 0}
            >
              {channels.length === 0
                ? "Nenhum canal Meta conectado"
                : selectedChannels.length === channels.length
                  ? `Todas as contas (${channels.length})`
                  : `${selectedChannels.length} conta${selectedChannels.length === 1 ? "" : "s"} selecionada${selectedChannels.length === 1 ? "" : "s"}`}
            </button>
            {channelsOpen && channels.length > 0 && (
              <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border border-border bg-popover p-2 shadow-lg">
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-border pb-2">
                  <button type="button" className="text-[10px] font-medium text-primary hover:underline" onClick={() => setSelectedChannelIds(channels.map((c) => c.id))}>
                    Selecionar todas
                  </button>
                  <button type="button" className="text-[10px] font-medium text-muted-foreground hover:text-foreground" onClick={() => setSelectedChannelIds([])}>
                    Limpar
                  </button>
                </div>
                <div className="max-h-64 space-y-1 overflow-auto">
                  {channels.map((channel) => (
                    <label key={`${channel.type}-${channel.id}`} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/60">
                      <Checkbox checked={selectedChannelIds.includes(channel.id)} onCheckedChange={() => toggleInsightChannel(channel.id)} />
                      <span className="min-w-0 flex-1 truncate">
                        {channel.type === "ig" ? "Instagram" : "Facebook"} · {channel.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setConfigOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-background text-[11px] font-medium hover:bg-muted"
          >
            <Settings2 className="w-3 h-3" /> Configurar KPIs
          </button>
        </div>
      </div>

      {selectedChannels.length > 0 && (
        <div className="mb-2 text-[10px] text-muted-foreground">
          KPIs puxados das contas selecionadas nos últimos 30 dias. Alcance e visualizações vêm dos insights das contas, não de um post isolado.
        </div>
      )}
      {insightError && (
        <div className="mb-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {insightError}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center text-xs text-muted-foreground">
          Nenhum KPI selecionado. Clique em <span className="font-medium text-foreground">Configurar KPIs</span> para escolher.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
          {items.map((def) => {
            const Icon = ICONS[def.key] ?? BarChart3;
            const raw = values[def.key] ?? 0;
            return (
              <div
                key={def.key}
                className="rounded-lg border border-border bg-card p-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
                  <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
                  <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                    {def.label}
                  </div>
                </div>
                <div className="text-xl font-bold tracking-tight tabular-nums font-mono">
                  {loading ? "-" : formatValue(def, raw)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SocialKpiConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        current={keys}
        channelTypes={selectedKpiChannels}
        onSave={save}
      />
    </div>
  );
}

function SocialKpiConfigDialog({
  open,
  onOpenChange,
  current,
  channelTypes,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: string[];
  channelTypes: SocialKpiChannel[];
  onSave: (keys: string[]) => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<string[]>(current);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(current.filter((key) => SOCIAL_KPI_CATALOG.some((k) => k.key === key && channelTypes.some((channel) => k.channels.includes(channel)))));
  }, [open, current, channelTypes]);

  const toggle = (key: string) =>
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  const move = (key: string, dir: -1 | 1) => {
    setSelected((prev) => {
      const i = prev.indexOf(key);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const cp = [...prev];
      [cp[i], cp[j]] = [cp[j], cp[i]];
      return cp;
    });
  };
  const doSave = async () => {
    setSaving(true);
    try { await onSave(selected); onOpenChange(false); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Configurar KPIs do Social Media</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4 max-h-[65vh]">
          <div className="overflow-auto pr-2 space-y-4">
            {SOCIAL_KPI_GROUPS.map((group) => {
              const items = SOCIAL_KPI_CATALOG.filter((k) => k.group === group && channelTypes.some((channel) => k.channels.includes(channel)));
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{group}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {items.map((k) => {
                      const on = selected.includes(k.key);
                      return (
                        <label
                          key={k.key}
                          className={cn(
                            "flex items-start gap-2 px-2.5 py-2 rounded-md border cursor-pointer transition-colors",
                            on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                          )}
                        >
                          <Checkbox checked={on} onCheckedChange={() => toggle(k.key)} className="mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate">{k.label}</div>
                            {k.description && <div className="text-[10px] text-muted-foreground truncate">{k.description}</div>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-border bg-background/50 overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <div className="text-xs font-medium">Ordem no painel</div>
              <button
                className="text-[10px] text-primary hover:underline"
                onClick={() => setSelected(DEFAULT_SOCIAL_KPIS.filter((key) => SOCIAL_KPI_CATALOG.some((k) => k.key === key && channelTypes.some((channel) => k.channels.includes(channel)))))}
              >
                Padrão
              </button>
            </div>
            <div className="flex-1 overflow-auto p-1.5">
              {selected.length === 0 ? (
                <div className="p-3 text-[11px] text-muted-foreground">Selecione ao menos 1 KPI ao lado.</div>
              ) : selected.map((key, i) => {
                const def = SOCIAL_KPI_CATALOG.find((k) => k.key === key);
                return (
                  <div key={key} className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-muted/50">
                    <div className="flex flex-col gap-0.5">
                      <button className="p-0.5 hover:text-primary disabled:opacity-30" disabled={i === 0} onClick={() => move(key, -1)}>▲</button>
                      <button className="p-0.5 hover:text-primary disabled:opacity-30" disabled={i === selected.length - 1} onClick={() => move(key, 1)}>▼</button>
                    </div>
                    <GripVertical className="w-3 h-3 text-muted-foreground" />
                    <div className="text-xs flex-1 truncate">{def?.label ?? key}</div>
                    <button className="p-0.5 text-muted-foreground hover:text-destructive" onClick={() => toggle(key)}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <div className="text-[11px] text-muted-foreground mr-auto self-center">
            {selected.length} KPI{selected.length === 1 ? "" : "s"} selecionado{selected.length === 1 ? "" : "s"}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={doSave} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
