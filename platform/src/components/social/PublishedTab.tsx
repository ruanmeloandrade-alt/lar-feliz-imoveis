// Onda 4, Aba Publicados: lista posts publicados com métricas + formulário de coleta.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, TrendingUp, BarChart3, Heart, Eye, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { listPublishedWithMetrics, upsertPostMetrics } from "@/lib/social-wave4.functions";
import { signedUrlFor } from "@/lib/social-stream";

type Post = {
  id: string; title: string | null; copy: string | null; published_at: string | null;
  hashtags: string[] | null;
};
type Metric = {
  id: string; post_id: string; channel: string; likes: number; comments: number;
  shares: number; saves: number; reach: number; impressions: number;
  engagement_rate: number | null;
};
type Asset = { id: string; post_id: string; storage_path: string };

function MetricAvatar({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { signedUrlFor(path, 3600).then(setUrl); }, [path]);
  return url
    ? <img src={url} alt="" className="w-full h-full object-cover" />
    : <div className="w-full h-full grid place-items-center text-muted-foreground text-xs">…</div>;
}

function MetricsForm({
  post, existing, workspaceId, onSaved,
}: {
  post: Post; existing: Metric | null; workspaceId: string;
  onSaved: () => void;
}) {
  const upsertFn = useServerFn(upsertPostMetrics);
  const [channel, setChannel] = useState(existing?.channel ?? "ig_feed");
  const [likes, setLikes] = useState(existing?.likes ?? 0);
  const [comments, setComments] = useState(existing?.comments ?? 0);
  const [shares, setShares] = useState(existing?.shares ?? 0);
  const [saves, setSaves] = useState(existing?.saves ?? 0);
  const [reach, setReach] = useState(existing?.reach ?? 0);
  const [impressions, setImpressions] = useState(existing?.impressions ?? 0);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await upsertFn({ data: {
        workspaceId, postId: post.id, channel,
        likes, comments, shares, saves, reach, impressions, videoViews: 0,
      } });
      toast.success("Métricas salvas. A IA vai usar isso pra aprender.");
      onSaved();
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-2 bg-muted/20">
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Canal</label>
        <select value={channel} onChange={(e) => setChannel(e.target.value)}
          className="px-2 py-1 rounded border border-border bg-background text-xs">
          <option value="ig_feed">Instagram Feed</option>
          <option value="ig_reels">Instagram Reels</option>
          <option value="ig_story">Instagram Stories</option>
          <option value="fb_feed">Facebook Feed</option>
          <option value="tiktok">TikTok</option>
          <option value="linkedin">LinkedIn</option>
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Curtidas", likes, setLikes, Heart],
          ["Comentários", comments, setComments, MessageCircle],
          ["Compart.", shares, setShares, Share2],
          ["Salvos", saves, setSaves, BarChart3],
          ["Alcance", reach, setReach, Eye],
          ["Impressões", impressions, setImpressions, TrendingUp],
        ].map(([label, val, setter, Icon]) => {
          const IconC = Icon as typeof Heart;
          return (
            <label key={label as string} className="block">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <IconC className="w-2.5 h-2.5" /> {label as string}
              </span>
              <input type="number" min={0} value={val as number}
                onChange={(e) => (setter as (n: number) => void)(Number(e.target.value) || 0)}
                className="mt-0.5 w-full px-2 py-1 rounded border border-border bg-background text-xs tabular-nums" />
            </label>
          );
        })}
      </div>
      <button onClick={save} disabled={saving}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
        {saving && <Loader2 className="w-3 h-3 animate-spin" />} Salvar métricas
      </button>
      {existing?.engagement_rate != null && (
        <div className="text-[10px] text-center text-muted-foreground">
          Engajamento atual: <span className="font-semibold text-primary">{existing.engagement_rate}%</span>
        </div>
      )}
    </div>
  );
}

export function PublishedTab({ workspaceId }: { workspaceId: string | null }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPublishedWithMetrics);
  const { data, isLoading } = useQuery({
    queryKey: ["social-published", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => listFn({ data: { workspaceId: workspaceId! } }),
  });

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando…</div>;
  }

  const d = data as { posts?: Post[]; metrics?: Metric[]; assets?: Asset[] } | undefined;
  const posts = d?.posts ?? [];
  const metrics = d?.metrics ?? [];
  const assets = d?.assets ?? [];

  if (!posts.length) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        Nada publicado ainda. Assim que aprovar e publicar um post, ele aparece aqui pra você registrar as métricas.
      </div>
    );
  }

  const refresh = () => qc.invalidateQueries({ queryKey: ["social-published", workspaceId] });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {posts.map((p) => {
        const asset = assets.find(a => a.post_id === p.id);
        const metric = metrics.find(m => m.post_id === p.id) ?? null;
        return (
          <div key={p.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex">
              <div className="w-24 h-24 bg-muted shrink-0">
                {asset ? <MetricAvatar path={asset.storage_path} /> : null}
              </div>
              <div className="p-3 flex-1 min-w-0">
                <div className="text-xs font-medium line-clamp-1">{p.title || "(sem título)"}</div>
                <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{p.copy}</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  Publicado em {p.published_at?.slice(0, 10) ?? "?"}
                </div>
              </div>
            </div>
            <div className="p-3 border-t border-border">
              {workspaceId && (
                <MetricsForm post={p} existing={metric} workspaceId={workspaceId} onSaved={refresh} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
