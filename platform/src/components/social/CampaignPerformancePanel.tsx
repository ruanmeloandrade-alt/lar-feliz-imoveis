import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, Eye, Heart, MessageCircle, Share2, Bookmark,
  Play, TrendingUp, CalendarDays, RefreshCw, Layers,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type CampaignRow = {
  id: string;
  name: string;
  color: string | null;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  objective: string | null;
};

type PostRow = {
  id: string;
  campaign_id: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
};

type MetricRow = {
  post_id: string;
  collected_at: string;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  video_views: number | null;
  engagement_rate: number | null;
};

type Agg = {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  videoViews: number;
  interactions: number;
  engagementRate: number;
  measured: number;
  published: number;
  scheduled: number;
  total: number;
};

const EMPTY: Agg = {
  reach: 0, impressions: 0, likes: 0, comments: 0, shares: 0, saves: 0,
  videoViews: 0, interactions: 0, engagementRate: 0, measured: 0,
  published: 0, scheduled: 0, total: 0,
};

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k`
  : String(Math.round(n));

function periodLabel(c: CampaignRow) {
  const f = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : null;
  const a = f(c.starts_at), b = f(c.ends_at);
  if (a && b) return `${a} - ${b}`;
  if (a) return `a partir de ${a}`;
  return "Sem período definido";
}

export function CampaignPerformancePanel({ workspaceId }: { workspaceId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [selected, setSelected] = useState<string | "all">("all");

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const { data: camps } = await supabase
        .from("social_campaigns")
        .select("id,name,color,status,starts_at,ends_at,objective")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      const list = (camps ?? []) as CampaignRow[];
      setCampaigns(list);

      if (list.length === 0) { setPosts([]); setMetrics([]); return; }

      const { data: ps } = await supabase
        .from("social_posts")
        .select("id,campaign_id,status,scheduled_at,published_at")
        .eq("workspace_id", workspaceId)
        .in("campaign_id", list.map((c) => c.id));
      const postList = (ps ?? []) as PostRow[];
      setPosts(postList);

      if (postList.length === 0) { setMetrics([]); return; }
      const { data: ms } = await supabase
        .from("social_post_metrics")
        .select("post_id,collected_at,reach,impressions,likes,comments,shares,saves,video_views,engagement_rate")
        .eq("workspace_id", workspaceId)
        .in("post_id", postList.map((p) => p.id))
        .order("collected_at", { ascending: false });
      setMetrics((ms ?? []) as MetricRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId]);

  // última coleta por post
  const latestByPost = useMemo(() => {
    const map = new Map<string, MetricRow>();
    for (const m of metrics) if (!map.has(m.post_id)) map.set(m.post_id, m);
    return map;
  }, [metrics]);

  const aggFor = useMemo(() => {
    const byCampaign = new Map<string, Agg>();
    for (const c of campaigns) byCampaign.set(c.id, { ...EMPTY });
    for (const p of posts) {
      if (!p.campaign_id) continue;
      const a = byCampaign.get(p.campaign_id);
      if (!a) continue;
      a.total += 1;
      if (p.status === "published") a.published += 1;
      else if (p.status === "scheduled") a.scheduled += 1;
      const m = latestByPost.get(p.id);
      if (!m) continue;
      a.measured += 1;
      a.reach += m.reach ?? 0;
      a.impressions += m.impressions ?? 0;
      a.likes += m.likes ?? 0;
      a.comments += m.comments ?? 0;
      a.shares += m.shares ?? 0;
      a.saves += m.saves ?? 0;
      a.videoViews += m.video_views ?? 0;
      a.engagementRate += m.engagement_rate ?? 0;
    }
    for (const a of byCampaign.values()) {
      a.interactions = a.likes + a.comments + a.shares + a.saves;
      a.engagementRate = a.measured ? a.engagementRate / a.measured : 0;
    }
    return byCampaign;
  }, [campaigns, posts, latestByPost]);

  const visible = useMemo(
    () => (selected === "all" ? campaigns : campaigns.filter((c) => c.id === selected)),
    [campaigns, selected]
  );

  const totals = useMemo(() => {
    const t: Agg = { ...EMPTY };
    let erSum = 0, erCount = 0;
    for (const c of visible) {
      const a = aggFor.get(c.id);
      if (!a) continue;
      t.reach += a.reach; t.impressions += a.impressions; t.likes += a.likes;
      t.comments += a.comments; t.shares += a.shares; t.saves += a.saves;
      t.videoViews += a.videoViews; t.measured += a.measured;
      t.published += a.published; t.scheduled += a.scheduled; t.total += a.total;
      if (a.measured) { erSum += a.engagementRate; erCount += 1; }
    }
    t.interactions = t.likes + t.comments + t.shares + t.saves;
    t.engagementRate = erCount ? erSum / erCount : 0;
    return t;
  }, [visible, aggFor]);

  if (!workspaceId) return null;

  const cards = [
    { label: "Alcance", value: fmt(totals.reach), icon: Eye },
    { label: "Impressões", value: fmt(totals.impressions), icon: BarChart3 },
    { label: "Interações", value: fmt(totals.interactions), icon: TrendingUp },
    { label: "Curtidas", value: fmt(totals.likes), icon: Heart },
    { label: "Comentários", value: fmt(totals.comments), icon: MessageCircle },
    { label: "Compartilhamentos", value: fmt(totals.shares), icon: Share2 },
    { label: "Salvamentos", value: fmt(totals.saves), icon: Bookmark },
    { label: "Views de vídeo", value: fmt(totals.videoViews), icon: Play },
    { label: "Taxa de engajamento", value: `${totals.engagementRate.toFixed(2)}%`, icon: TrendingUp },
    { label: "Posts publicados", value: `${totals.published}/${totals.total}`, icon: Layers },
    { label: "Posts agendados", value: String(totals.scheduled), icon: CalendarDays },
    { label: "Posts medidos", value: String(totals.measured), icon: BarChart3 },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Painel das campanhas orgânicas
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Resultado consolidado do que cada campanha gerou, somando todos os posts do plano.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value as string)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="all">Todas as campanhas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={() => void load()}
            className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border border-border text-xs hover:bg-muted"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Atualizar
          </button>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">
          Nenhuma campanha orgânica criada ainda. Crie uma campanha abaixo para acompanhar as métricas do conjunto.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {cards.map((c) => (
              <div key={c.label} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <c.icon className="w-3.5 h-3.5" /> {c.label}
                </div>
                <div className="text-lg font-semibold mt-1">{c.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Campanha</th>
                  <th className="py-2 px-3 font-medium">Período</th>
                  <th className="py-2 px-3 font-medium">Posts</th>
                  <th className="py-2 px-3 font-medium">Alcance</th>
                  <th className="py-2 px-3 font-medium">Impressões</th>
                  <th className="py-2 px-3 font-medium">Interações</th>
                  <th className="py-2 px-3 font-medium">Comentários</th>
                  <th className="py-2 px-3 font-medium">Eng.</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const a = aggFor.get(c.id) ?? EMPTY;
                  return (
                    <tr key={c.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: c.color || "hsl(var(--primary))" }}
                          />
                          <span className="font-medium">{c.name}</span>
                          {c.status && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                              {c.status}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{periodLabel(c)}</td>
                      <td className="py-2 px-3">{a.published}/{a.total}</td>
                      <td className="py-2 px-3">{fmt(a.reach)}</td>
                      <td className="py-2 px-3">{fmt(a.impressions)}</td>
                      <td className="py-2 px-3">{fmt(a.interactions)}</td>
                      <td className="py-2 px-3">{fmt(a.comments)}</td>
                      <td className="py-2 px-3">{a.engagementRate.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totals.measured === 0 && (
            <p className="text-[11px] text-muted-foreground mt-3">
              Ainda não há métricas coletadas. Os números aparecem depois que os posts da campanha forem publicados nos canais conectados.
            </p>
          )}
        </>
      )}
    </div>
  );
}
