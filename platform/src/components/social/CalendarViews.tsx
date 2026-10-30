// Grades de calendário (Semana / Mês / Dia) e Aprovações e Ideias plugadas
// no banco. Compartilham o hook useSocialPosts.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { CheckCircle2, Copy, Facebook, Heart, Instagram, Loader2, MessageCircle, Send, Sparkles, Trash2, XCircle, Youtube, Download } from "lucide-react";
import { useIsSuperAdmin } from "@/hooks/use-roles";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { deleteSocialPost, updateSocialPost, listSocialIdeas, generateSocialIdeas, publishSocialPostNow, deleteSocialIdea, expandSocialIdea, refineSocialIdea, listImageProviders, setSocialIdeaImage } from "@/lib/social.functions";
import { logApprovalAction } from "@/lib/social-wave4.functions";
import { useSocialPosts, type SocialAssetRow, type SocialChannelRow, type SocialPostRow } from "./useSocialPosts";
import { signedUrlFor, streamImage, uploadDataUrlToBucket } from "@/lib/social-stream";

import { toast } from "sonner";

const DAYS_SHORT = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

function startOfDay(d: Date) { const x = new Date(d); x.setUTCHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setUTCDate(x.getUTCDate()+n); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); const dow = (x.getUTCDay()+6)%7; return addDays(x, -dow); }
function startOfMonth(d: Date) { const x = startOfDay(d); x.setUTCDate(1); return x; }
function sameDay(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

// hook para pegar tz do profile (cached)
function useUserTimezone(): string {
  const [tz, setTz] = useState<string>("America/Sao_Paulo");
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase.from("profiles").select("timezone").eq("id", u.user.id).maybeSingle();
      const zone = (p as { timezone?: string } | null)?.timezone;
      if (zone) setTz(zone);
    })();
  }, []);
  return tz;
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel.startsWith("ig")) return <Instagram className="w-2.5 h-2.5 text-pink-500" />;
  if (channel.startsWith("fb")) return <Facebook className="w-2.5 h-2.5 text-emerald-500" />;
  return null;
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: "bg-emerald-500",
    pending_approval: "bg-amber-500",
    approved: "bg-emerald-500",
    published: "bg-green-600",
    failed: "bg-red-500",
    draft: "bg-muted-foreground",
    rejected: "bg-red-400",
  };
  return <span className={cn("w-1.5 h-1.5 rounded-full", map[status] ?? "bg-muted")} />;
}

function PostChip({
  post, channels, tz, onOpen,
}: { post: SocialPostRow; channels: SocialChannelRow[]; tz: string; onOpen?: (id: string) => void }) {
  const time = post.scheduled_at ? formatInTimeZone(new Date(post.scheduled_at), tz, "HH:mm") : "-";
  return (
    <button
      type="button"
      onClick={() => onOpen?.(post.id)}
      className="w-full text-left rounded-md border border-border bg-background/80 hover:bg-muted hover:border-primary/40 transition-colors px-1.5 py-1 group cursor-pointer"
    >
      <div className="flex items-center gap-1 mb-0.5">
        <StatusDot status={post.status} />
        <span className="text-[9px] tabular-nums text-muted-foreground">{time}</span>
        <div className="flex items-center gap-0.5 ml-auto">
          {channels.filter(c => c.post_id === post.id).slice(0, 3).map(c => (
            <ChannelIcon key={c.id} channel={c.channel} />
          ))}
        </div>
      </div>
      <div className="text-[10px] leading-tight text-foreground line-clamp-2">
        {post.title || post.copy || "Sem título"}
      </div>
    </button>
  );
}


// ────────────── Week ──────────────
export function WeekGrid({ cursor, today, workspaceId, onOpen, onCreateAt }: { cursor: Date; today: Date; workspaceId: string | null; onOpen?: (id: string) => void; onCreateAt?: (d: Date) => void }) {

  const start = startOfWeek(cursor);
  const end = addDays(start, 7);
  const tz = useUserTimezone();
  const { data, isLoading } = useSocialPosts(workspaceId, { from: start, to: end });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const grouped = useMemo(() => {
    const map = new Map<string, SocialPostRow[]>();
    for (const p of data?.posts ?? []) {
      if (!p.scheduled_at) continue;
      const key = formatInTimeZone(new Date(p.scheduled_at), tz, "yyyy-MM-dd");
      const arr = map.get(key) ?? []; arr.push(p); map.set(key, arr);
    }
    return map;
  }, [data, tz]);

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d, i) => {
        const isToday = sameDay(d, today);
        const key = formatInTimeZone(d, tz, "yyyy-MM-dd");
        const posts = grouped.get(key) ?? [];
        return (
          <div
            key={i}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("[data-post-chip]")) return;
              onCreateAt?.(d);
            }}
            className={cn(
              "group rounded-lg border p-2 min-h-[180px] flex flex-col gap-1 cursor-pointer hover:border-primary/40 transition-colors",
              isToday ? "border-primary bg-primary/5" : "border-border bg-background/50",
            )}
            title="Clique para agendar um post"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold tracking-widest text-muted-foreground">{DAYS_SHORT[i]}</span>
              <span className={cn("text-[10px] tabular-nums", isToday && "text-primary font-semibold")}>{d.getUTCDate()}</span>
            </div>
            {isLoading && i === 0 && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            {posts.map(p => (
              <div key={p.id} data-post-chip>
                <PostChip post={p} channels={data?.channels ?? []} tz={tz} onOpen={onOpen} />
              </div>
            ))}
            {posts.length === 0 && !isLoading && (
              <div className="mt-auto text-[9px] text-muted-foreground/60 group-hover:text-primary/70">+ agendar</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ────────────── Month ──────────────
export function MonthGrid({ cursor, today, workspaceId, onOpen, onCreateAt, onDrillDay }: { cursor: Date; today: Date; workspaceId: string | null; onOpen?: (id: string) => void; onCreateAt?: (d: Date) => void; onDrillDay?: (d: Date) => void }) {

  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = addDays(gridStart, 42);
  const tz = useUserTimezone();
  const { data } = useSocialPosts(workspaceId, { from: gridStart, to: gridEnd });
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const grouped = useMemo(() => {
    const map = new Map<string, SocialPostRow[]>();
    for (const p of data?.posts ?? []) {
      if (!p.scheduled_at) continue;
      const key = formatInTimeZone(new Date(p.scheduled_at), tz, "yyyy-MM-dd");
      const arr = map.get(key) ?? []; arr.push(p); map.set(key, arr);
    }
    return map;
  }, [data, tz]);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="grid grid-cols-7 bg-muted/30 border-b border-border text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
        {DAYS_SHORT.map((d) => <div key={d} className="px-2 py-1.5 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const inMonth = d.getUTCMonth() === cursor.getUTCMonth();
          const isToday = sameDay(d, today);
          const key = formatInTimeZone(d, tz, "yyyy-MM-dd");
          const posts = grouped.get(key) ?? [];
          return (
            <div
              key={i}
              onClick={(e) => {
                // Ignora clique quando o alvo é um post-chip (que tem seu próprio onClick)
                if ((e.target as HTMLElement).closest("[data-post-chip]")) return;
                onCreateAt?.(d);
              }}
              className={cn(
                "group relative min-h-[110px] border-r border-b border-border p-1.5 flex flex-col gap-0.5 cursor-pointer hover:bg-primary/[0.03] transition-colors",
                (i + 1) % 7 === 0 && "border-r-0",
                i >= 35 && "border-b-0",
                !inMonth && "bg-muted/10 text-muted-foreground/60",
              )}
              title="Clique para agendar um post neste dia"
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDrillDay?.(d); }}
                  className="text-[10px] text-muted-foreground hover:text-primary hover:underline"
                >
                  {i < 7 ? DAYS_SHORT[i] : ""}
                </button>
                <span className={cn("text-[11px] tabular-nums px-1 rounded", isToday && "bg-primary text-primary-foreground font-semibold")}>{d.getUTCDate()}</span>
              </div>
              {posts.slice(0, 3).map(p => (
                <div key={p.id} data-post-chip>
                  <PostChip post={p} channels={data?.channels ?? []} tz={tz} onOpen={onOpen} />
                </div>
              ))}
              {posts.length > 3 && (
                <button
                  data-post-chip
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDrillDay?.(d); }}
                  className="text-[9px] text-muted-foreground hover:text-primary text-left"
                >
                  +{posts.length - 3} mais
                </button>
              )}
              <span className="absolute bottom-1 right-1 text-[9px] text-primary/0 group-hover:text-primary/80 pointer-events-none">+ agendar</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────── Day ──────────────
export function DayTimeline({ cursor, workspaceId, onOpen, onCreateAt }: { cursor: Date; workspaceId: string | null; onOpen?: (id: string) => void; onCreateAt?: (d: Date) => void }) {
  const from = startOfDay(cursor);
  const to = addDays(from, 1);
  const tz = useUserTimezone();
  const { data, isLoading } = useSocialPosts(workspaceId, { from, to });
  const posts = data?.posts ?? [];

  const CreateBtn = onCreateAt ? (
    <button
      type="button"
      onClick={() => onCreateAt(cursor)}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
    >
      + Agendar post neste dia
    </button>
  ) : null;

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando…</div>;
  }
  if (!posts.length) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
        <span>Nenhuma publicação agendada para este dia.</span>
        {CreateBtn}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {CreateBtn && <div className="flex justify-end">{CreateBtn}</div>}
      {posts.map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => onOpen?.(p.id)}
          className="w-full text-left flex items-start gap-3 rounded-lg border border-border p-3 bg-background/50 hover:bg-muted hover:border-primary/40 transition-colors cursor-pointer"
        >
          <div className="text-xs font-mono text-muted-foreground w-14 tabular-nums">
            {p.scheduled_at ? formatInTimeZone(new Date(p.scheduled_at), tz, "HH:mm") : "-"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <StatusDot status={p.status} />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{p.status}</span>
              <div className="flex gap-0.5 ml-auto">
                {(data?.channels ?? []).filter(c => c.post_id === p.id).map(c => <ChannelIcon key={c.id} channel={c.channel} />)}
              </div>
            </div>
            <div className="text-xs font-medium truncate">{p.title || "(sem título)"}</div>
            <div className="text-[11px] text-muted-foreground line-clamp-2">{p.copy}</div>
          </div>
        </button>
      ))}
    </div>
  );
}


// ────────────── Aprovações ──────────────
function AssetThumb({ asset }: { asset: SocialAssetRow }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { signedUrlFor(asset.storage_path, 3600).then(setUrl); }, [asset.storage_path]);
  return url
    ? <img src={url} alt="preview" className="w-full h-full object-cover" />
    : <div className="w-full h-full grid place-items-center text-muted-foreground text-[10px]">…</div>;
}

export function ApprovalsGrid({ workspaceId }: { workspaceId: string | null }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateSocialPost);
  const deleteFn = useServerFn(deleteSocialPost);
  const publishFn = useServerFn(publishSocialPostNow);
  const logFn = useServerFn(logApprovalAction);
  const { data, isLoading } = useSocialPosts(workspaceId);
  const pending = (data?.posts ?? []).filter(p => p.status === "pending_approval");

  const approve = async (p: SocialPostRow) => {
    if (!workspaceId) return;
    await updateFn({ data: { postId: p.id, workspaceId, patch: { status: "approved" } } });
    await logFn({ data: { workspaceId, postId: p.id, action: "approved", notes: null } }).catch(() => {});
    if (!p.scheduled_at) {
      try {
        const r = await publishFn({ data: { postId: p.id, workspaceId } });
        toast[r.ok ? "success" : "error"](r.ok ? "Publicado." : "Falha em algum canal.");
      } catch (e) { toast.error(`Falha ao publicar: ${(e as Error).message}`); }
    } else {
      toast.success("Aprovado. Será publicado no horário agendado.");
    }
    qc.invalidateQueries({ queryKey: ["social-posts"] });
  };
  const reject = async (id: string) => {
    if (!workspaceId) return;
    const reason = window.prompt("Motivo da recusa (opcional):") ?? null;
    await updateFn({ data: { postId: id, workspaceId, patch: { status: "rejected" } } });
    await logFn({ data: { workspaceId, postId: id, action: "rejected", notes: reason } }).catch(() => {});
    toast.info("Post recusado.");
    qc.invalidateQueries({ queryKey: ["social-posts"] });
  };
  const remove = async (id: string) => {
    if (!workspaceId) return;
    await deleteFn({ data: { postId: id, workspaceId } });
    qc.invalidateQueries({ queryKey: ["social-posts"] });
  };


  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando…</div>;
  if (!pending.length) {
    return <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">Nenhum post aguardando aprovação.</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {pending.map(p => {
        const assets = (data?.assets ?? []).filter(a => a.post_id === p.id);
        return (
          <div key={p.id} className="rounded-xl border border-border bg-card overflow-hidden flex flex-col group">
            <div className="aspect-[4/5] bg-muted relative">
              {assets[0] ? (
                <>
                  <AssetThumb asset={assets[0]} />
                  <a
                    href="#"
                    onClick={async (e) => {
                      e.preventDefault();
                      const url = await signedUrlFor(assets[0].storage_path, 3600);
                      const link = document.createElement('a');
                      if (url) link.href = url;
                      link.download = `post-${p.id}.png`;
                      link.target = "_blank";
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100 shadow-md"
                    title="Baixar imagem"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </>
              ) : <div className="w-full h-full grid place-items-center text-muted-foreground text-xs">Sem imagem</div>}
            </div>
            <div className="p-3 space-y-2 flex-1 flex flex-col">
              <div className="text-xs font-medium line-clamp-2">{p.title || "(sem título)"}</div>
              <div className="text-[11px] text-muted-foreground line-clamp-3 flex-1">{p.copy}</div>
              <div className="flex items-center gap-1 pt-1">
                <button onClick={() => approve(p)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-[11px] hover:bg-primary/90">
                  <CheckCircle2 className="w-3 h-3" /> Aprovar
                </button>
                <button onClick={() => reject(p.id)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-border text-[11px] hover:bg-muted">
                  <XCircle className="w-3 h-3" /> Recusar
                </button>
                <button onClick={() => remove(p.id)} title="Excluir" className="p-1.5 rounded-md border border-border hover:bg-muted">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ApprovalsBadge({ workspaceId }: { workspaceId: string | null }) {
  const { data } = useSocialPosts(workspaceId);
  const count = (data?.posts ?? []).filter(p => p.status === "pending_approval").length;
  if (!count) return null;
  return <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold">{count}</span>;
}

// ────────────── Banco de ideias ──────────────
type SlideItem = { n?: number; title?: string; text?: string; image_prompt?: string; image_url?: string };
type StoryFrame = { n?: number; text?: string; image_prompt?: string; sticker_hint?: string };
type ReelsScene = { n?: number; time?: string; action?: string; on_screen_text?: string; voiceover?: string };
type ReelsScript = {
  duration_seconds?: number; hook?: string; cta?: string; sound_hint?: string; b_roll?: string;
  scenes?: ReelsScene[];
};
type RefinementLog = { at?: string; instruction?: string };
type IdeaMeta = {
  hook?: string;
  caption?: string;
  primary_cta?: string;
  alt_ctas?: string[];
  pinned_comment?: string;
  hashtags?: string[];
  trending_theme?: string;
  format?: string;
  image_prompt?: string;
  image_path?: string;
  image_provider?: string | null;
  image_generated_at?: string;
  accent_color?: string;

  network?: string;
  photo_direction?: string;
  slides?: SlideItem[];
  closing_slide?: { text?: string; cta?: string };
  story_frames?: StoryFrame[];
  reels_script?: ReelsScript;
  shot_list?: string[];
  props?: string[];
  expanded?: boolean;
  refinement_history?: RefinementLog[];
};

type IdeaPayload = {
  title: string;
  caption: string;
  hashtags: string[];
  pinned_comment: string;
};

type IdeaRow = { id: string; title: string; copy_suggestion: string | null; niche: string | null; metadata: IdeaMeta };

// Geradores de imagem aceitos no Banco de ideias.
type ImageProvider = "freepik" | "recraft" | "ideogram" | "gemini";
const IMAGE_PROVIDER_LABEL: Record<ImageProvider, string> = {
  freepik: "Freepik",
  recraft: "Recraft",
  ideogram: "Ideogram",
  gemini: "Nano Banana",
};

// Mostra a arte gerada da ideia (bucket privado, url assinada).
function IdeaImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const u = await signedUrlFor(path);
      if (alive) setUrl(u);
    })();
    return () => { alive = false; };
  }, [path]);
  if (!url) return null;
  return (
    <>
      <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />
    </>
  );
}




export function IdeasGrid({ workspaceId, onUse }: { workspaceId: string | null; onUse: (idea: IdeaPayload) => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSocialIdeas);
  const genFn = useServerFn(generateSocialIdeas);
  const delFn = useServerFn(deleteSocialIdea);
  const providersFn = useServerFn(listImageProviders);
  const setIdeaImageFn = useServerFn(setSocialIdeaImage);
  const refineIdeaFn = useServerFn(refineSocialIdea);

  // Provedores de imagem conectados (Freepik, Recraft, Ideogram, Nano Banana).
  const providersQuery = useQuery({
    queryKey: ["social-image-providers", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => providersFn({ data: { workspaceId: workspaceId! } }),
  });
  const imageProvider = (providersQuery.data as { primary?: ImageProvider | null } | undefined)?.primary ?? null;
  const [imagingIds, setImagingIds] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["social-ideas", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => listFn({ data: { workspaceId: workspaceId! } }),
  });



  const [generating, setGenerating] = useState(false);
  const [brief, setBrief] = useState("");
  const [count, setCount] = useState(4);
  const [network, setNetwork] = useState<"instagram" | "facebook" | "both">("both");
  const [format, setFormat] = useState<"feed" | "reels" | "story" | "carrossel" | "qualquer">("qualquer");
  const [brandHandle, setBrandHandle] = useState<string>("sua_marca");
  const [brandLogo, setBrandLogo] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    (async () => {
      const { data } = await supabase.from("social_brand_context")
        .select("company_name,logo_url").eq("workspace_id", workspaceId).maybeSingle();
      const h = ((data as { company_name?: string } | null)?.company_name || "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24);
      if (h) setBrandHandle(h);
      const logo = (data as { logo_url?: string } | null)?.logo_url ?? null;
      setBrandLogo(logo);
    })();
  }, [workspaceId]);

  const clearOldIdeas = async () => {
    if (!workspaceId) return;
    const currentIdeas = (((data as { ideas?: IdeaRow[] } | undefined)?.ideas) ?? []);
    for (const idea of currentIdeas) {
      try {
        await delFn({ data: { workspaceId, id: idea.id } });
      } catch (e) {
        console.error("Erro ao limpar ideia antiga:", e);
      }
    }
  };

  const removeIdea = async (id: string) => {
    if (!workspaceId) return;
    if (!confirm("Excluir esta ideia do banco?")) return;
    try {
      await delFn({ data: { workspaceId, id } });
      qc.invalidateQueries({ queryKey: ["social-ideas", workspaceId] });
      toast.success("Ideia removida.");
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    }
  };

  // Gera a arte de uma ideia usando o provedor conectado e salva no storage.
  const generateIdeaImage = async (idea: IdeaRow, provider: ImageProvider) => {
    if (!workspaceId) return;
    const m = (idea.metadata ?? {}) as IdeaMeta;
    if (m.image_path) return;
    const fmt = (m.format || "").toLowerCase();
    const aspectRatio = fmt.includes("reels") || fmt.includes("story") ? "9:16" : "1:1";
    const prompt = (m.image_prompt || m.photo_direction || `${m.hook || idea.title}. ${m.caption || idea.copy_suggestion || ""}`).slice(0, 1500);
    setImagingIds(prev => [...prev, idea.id]);
    try {
      let lastFrame: string | null = null;
      await streamImage("/api/social/generate-image", { workspaceId, prompt, provider, aspectRatio }, (f) => {
        if (f.dataUrl) lastFrame = f.dataUrl;
      });
      if (!lastFrame) throw new Error("A IA não devolveu imagem.");
      const path = await uploadDataUrlToBucket({ workspaceId, dataUrl: lastFrame, folder: "ideias" });
      await setIdeaImageFn({ data: { workspaceId, ideaId: idea.id, imagePath: path, provider } });
      qc.invalidateQueries({ queryKey: ["social-ideas", workspaceId] });
    } catch (e) {
      toast.error(`Imagem da ideia falhou: ${(e as Error).message}`);
    } finally {
      setImagingIds(prev => prev.filter(id => id !== idea.id));
    }
  };

  const handleGenerate = async () => {
    if (!workspaceId) return;
    setGenerating(true);
    try {
      // Limpa as ideias antigas antes de gerar novas, a menos que o usuário tenha salvo (futura feature)
      await clearOldIdeas();

      const res = await genFn({ data: { workspaceId, count, brief, network, format } });
      const created = (res as { created: number }).created;
      if (created > 0) toast.success(`${created} ideia${created > 1 ? "s" : ""} gerada${created > 1 ? "s" : ""}.`);
      else toast.error("A IA não devolveu ideias. Tente refinar o pedido.");
      qc.invalidateQueries({ queryKey: ["social-ideas", workspaceId] });

      // Se houver gerador de imagem conectado, cria a arte de cada ideia nova.
      const provider = imageProvider
        ?? ((await providersQuery.refetch()).data as { primary?: ImageProvider | null } | undefined)?.primary
        ?? null;
      if (created > 0 && provider) {
        const fresh = await listFn({ data: { workspaceId } });
        const rows = (((fresh as { ideas?: IdeaRow[] }).ideas) ?? [])
          .filter(i => !((i.metadata ?? {}) as IdeaMeta).image_path)
          .slice(0, created);
        toast.info(`Gerando ${rows.length} arte${rows.length > 1 ? "s" : ""} com ${IMAGE_PROVIDER_LABEL[provider]}…`);
        for (const row of rows) await generateIdeaImage(row, provider);
      }
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setGenerating(false);
    }
  };


  const ideas = (((data as { ideas?: IdeaRow[] } | undefined)?.ideas) ?? []);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailIdea = ideas.find(i => i.id === detailId) ?? null;

  const copyText = async (label: string, text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copiado.`); }
    catch { toast.error("Não consegui copiar."); }
  };

  return (
    <div className="space-y-4">
      {/* Painel de geração */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <div className="text-sm font-semibold">Peça uma ideia</div>
          <div className="ml-auto text-[10px] text-muted-foreground">usa o Contexto da Marca</div>
        </div>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={2}
          placeholder='Ex: "3 ideias para lançar o novo curso, focadas em prova social e urgência"'
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select value={network} onChange={(e) => setNetwork(e.target.value as typeof network)} className="rounded-md border border-border bg-background px-2 py-1 text-xs">
            <option value="both">IG + FB</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="tiktok">TikTok</option>
            <IsSuperAdminOnly>
              <option value="youtube">YouTube (Beta)</option>
            </IsSuperAdminOnly>
          </select>
          <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className="rounded-md border border-border bg-background px-2 py-1 text-xs">
            <option value="qualquer">Qualquer formato</option>
            <option value="feed">Feed</option>
            <option value="reels">Reels</option>
            <option value="story">Story</option>
            <option value="carrossel">Carrossel</option>
          </select>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="rounded-md border border-border bg-background px-2 py-1 text-xs">
            {[1, 2, 3, 4, 5, 6, 8].map(n => <option key={n} value={n}>{n} ideia{n > 1 ? "s" : ""}</option>)}
          </select>
          <button
            onClick={async () => {
              if (!brief.trim()) { toast.error("Descreva o que você quer primeiro."); return; }
              setGenerating(true);
              try {
                const out = await refineIdeaFn({ data: { workspaceId, briefing: brief } }) as any;
                if (out.refinedBriefing) setBrief(out.refinedBriefing);
                toast.success("Briefing aprimorado!");
              } catch (e) {
                toast.error("Falha ao aprimorar prompt.");
              } finally {
                setGenerating(false);
              }
            }}
            disabled={generating || !workspaceId || !brief.trim()}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors shadow-sm"
            title="Aprimorar o pedido usando IA antes de gerar"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Aprimorar prompt
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !workspaceId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Gerar ideias
          </button>
        </div>
      </div>

      {/* Grid de ideias como pré-visualização de post */}
      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando…</div>
      ) : !ideas.length ? (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
          Ainda não há ideias. Descreva acima o que você quer e clique em <span className="text-foreground font-medium">Gerar ideias</span>.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ideas.map((i) => {
            const m = (i.metadata ?? {}) as IdeaMeta;
            const hook = m.hook || i.title;
            const caption = m.caption || i.copy_suggestion || "";
            const hashtags = (m.hashtags ?? []).map(h => h.startsWith("#") ? h : `#${h}`);
            const accent = m.accent_color && /^#[0-9a-f]{6}$/i.test(m.accent_color) ? m.accent_color : "#6366f1";
            const isIG = (m.network ?? "both") !== "facebook";
            return (
              <div key={i.id} className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
                {/* Cabeçalho tipo Instagram */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                  <div
                    className="w-8 h-8 rounded-full ring-2 ring-background bg-gradient-to-br from-pink-500 via-orange-500 to-yellow-400 grid place-items-center overflow-hidden"
                  >
                    {brandLogo
                      ? <img src={brandLogo} alt="" className="w-full h-full object-cover rounded-full" />
                      : <div className="w-6 h-6 rounded-full bg-background grid place-items-center text-[10px] font-bold">{brandHandle.slice(0,2).toUpperCase()}</div>}
                  </div>
                  <div className="text-[13px] font-semibold leading-none">{brandHandle}</div>
                  <div className="text-[11px] text-muted-foreground">· Patrocinado</div>
                  <div className="ml-auto flex items-center gap-1">
                    {isIG ? <Instagram className="w-3.5 h-3.5 text-muted-foreground" /> : <Facebook className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                </div>

                {/* "Foto": arte gerada pela IA quando existe, senão gradiente */}
                <button
                  type="button"
                  onClick={() => setDetailId(i.id)}
                  className="relative aspect-square w-full flex items-end p-4 text-left group overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}88 55%, #0f172a 100%)` }}
                  title="Abrir detalhes e refinar"
                >
                  {m.image_path
                    ? <IdeaImage path={m.image_path} />
                    : (
                      <div className="absolute inset-0 opacity-20 pointer-events-none"
                           style={{ backgroundImage: "radial-gradient(circle at 30% 20%, rgba(255,255,255,.6), transparent 40%), radial-gradient(circle at 70% 80%, rgba(255,255,255,.35), transparent 45%)" }} />
                    )}
                  {imagingIds.includes(i.id) && (
                    <div className="absolute inset-0 bg-black/50 grid place-items-center text-white text-xs gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>gerando arte…</span>
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {m.image_path && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const url = await signedUrlFor(m.image_path!);
                          if (url) {
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = `ideia-${i.id}.png`;
                            link.target = "_blank";
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }
                        }}
                        className="w-7 h-7 grid place-items-center bg-black/40 hover:bg-black/60 text-white rounded-full shadow-sm"
                        title="Baixar imagem"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="text-[10px] uppercase tracking-widest bg-black/40 text-white px-2 py-1 rounded-full">abrir detalhes →</span>
                  </div>
                  <div className="relative text-white">
                    <div className="text-[10px] uppercase tracking-widest opacity-80 mb-1">
                      {m.format || "feed"} · {m.image_path ? `arte ${IMAGE_PROVIDER_LABEL[(m.image_provider as ImageProvider) ?? "freepik"] ?? "IA"}` : "foto ilustrativa"}
                    </div>
                    <div className="text-lg font-bold leading-tight drop-shadow-md line-clamp-4">{hook}</div>
                  </div>
                </button>


                {/* Barra de ações fake */}
                <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground">
                  <Heart className="w-5 h-5" />
                  <MessageCircle className="w-5 h-5" />
                  <Send className="w-5 h-5" />
                </div>

                {/* Legenda */}
                <div className="px-3 pb-2 text-[13px] leading-relaxed">
                  <span className="font-semibold mr-1">{brandHandle}</span>
                  <span className="whitespace-pre-line line-clamp-5 text-foreground/90">{caption}</span>
                  {hashtags.length > 0 && (
                    <div className="mt-1.5 text-[12px] text-primary/90 line-clamp-2">{hashtags.join(" ")}</div>
                  )}
                </div>

                {/* Extras úteis */}
                <div className="px-3 pb-3 space-y-2">
                  {m.trending_theme && (
                    <div className="flex items-start gap-1.5 text-[11px]">
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide">Em alta</span>
                      <span className="text-muted-foreground">{m.trending_theme}</span>
                    </div>
                  )}
                  {m.primary_cta && (
                    <div className="text-[11px]">
                      <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold uppercase tracking-wide mr-1.5">CTA</span>
                      <span className="text-foreground/85">{m.primary_cta}</span>
                    </div>
                  )}
                  {m.alt_ctas && m.alt_ctas.length > 0 && (
                    <div className="text-[11px] text-muted-foreground pl-10 -mt-1">
                      alt: {m.alt_ctas.slice(0, 2).join(" · ")}
                    </div>
                  )}
                  {m.pinned_comment && (
                    <div className="rounded-lg bg-muted/50 border border-border p-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                        <MessageCircle className="w-3 h-3" /> Comentário fixado
                        <button onClick={() => copyText("Comentário fixado", m.pinned_comment!)} className="ml-auto text-muted-foreground hover:text-foreground">
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-[12px] whitespace-pre-line">{m.pinned_comment}</div>
                    </div>
                  )}
                </div>

                {/* Rodapé de ações */}
                <div className="mt-auto flex items-center gap-1 border-t border-border px-3 py-2">
                  {i.niche && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wider">{i.niche}</span>}
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => copyText("Legenda", `${caption}${hashtags.length ? `\n\n${hashtags.join(" ")}` : ""}`)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground"
                      title="Copiar legenda"
                    >
                      <Copy className="w-3 h-3" /> Copiar
                    </button>
                    <button
                      onClick={() => setDetailId(i.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground"
                      title="Detalhar e refinar"
                    >
                      <Sparkles className="w-3 h-3" /> Detalhes
                    </button>
                    <button
                      onClick={() => removeIdea(i.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] text-muted-foreground hover:text-destructive hover:border-destructive/40"
                      title="Excluir ideia"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onUse({
                        title: i.title,
                        caption,
                        hashtags,
                        pinned_comment: m.pinned_comment ?? "",
                      })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90"
                    >
                      <Sparkles className="w-3 h-3" /> Usar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detailIdea && workspaceId && (
        <IdeaDetailDialog
          idea={detailIdea}
          workspaceId={workspaceId}
          brandHandle={brandHandle}
          brandLogo={brandLogo}
          onClose={() => setDetailId(null)}
          onUse={onUse}
        />
      )}
    </div>
  );
}

// ────────────── Dialog de detalhes / refino ──────────────
function IdeaDetailDialog({
  idea, workspaceId, brandHandle, brandLogo, onClose, onUse,
}: {
  idea: IdeaRow;
  workspaceId: string;
  brandHandle: string;
  brandLogo: string | null;
  onClose: () => void;
  onUse: (i: IdeaPayload) => void;
}) {
  const qc = useQueryClient();
  const expandFn = useServerFn(expandSocialIdea);
  const refineFn = useServerFn(refineSocialIdea);

  const [meta, setMeta] = useState<IdeaMeta>((idea.metadata ?? {}) as IdeaMeta);
  const [title, setTitle] = useState<string>(idea.title);
  const [caption, setCaption] = useState<string>(idea.copy_suggestion ?? (meta.caption ?? ""));
  const [expanding, setExpanding] = useState(false);
  const [refining, setRefining] = useState(false);
  const [instruction, setInstruction] = useState("");

  const format = (meta.format ?? "feed").toLowerCase();

  useEffect(() => {
    // Auto-expandir se a ideia ainda não foi detalhada.
    if (meta.expanded) return;
    let cancelled = false;
    (async () => {
      setExpanding(true);
      try {
        const res = await expandFn({ data: { ideaId: idea.id, workspaceId } }) as { metadataJson: string };
        if (cancelled) return;
        const next = JSON.parse(res.metadataJson) as IdeaMeta;
        setMeta(next);
        qc.invalidateQueries({ queryKey: ["social-ideas", workspaceId] });
      } catch (e) {
        toast.error(`Falha ao detalhar: ${(e as Error).message}`);
      } finally {
        if (!cancelled) setExpanding(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea.id]);

  const doRefine = async (customInstruction?: string, provider?: ImageProvider) => {
    const finalInstruction = customInstruction || instruction;
    if (!finalInstruction.trim()) { toast.error("Descreva o que refinar."); return; }
    setRefining(true);
    try {
      const res = await refineFn({ 
        data: { 
          ideaId: idea.id, 
          workspaceId, 
          instruction: finalInstruction.trim(),
          targetImageProvider: provider
        } 
      }) as { title: string; caption: string; metadataJson: string };
      setTitle(res.title);
      setCaption(res.caption);
      setMeta(JSON.parse(res.metadataJson) as IdeaMeta);
      setInstruction("");
      qc.invalidateQueries({ queryKey: ["social-ideas", workspaceId] });
      toast.success("Ideia refinada.");
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setRefining(false);
    }
  };

  const regenerate = async () => {
    setExpanding(true);
    try {
      const res = await expandFn({ data: { ideaId: idea.id, workspaceId, force: true } }) as { metadataJson: string };
      setMeta(JSON.parse(res.metadataJson) as IdeaMeta);
      qc.invalidateQueries({ queryKey: ["social-ideas", workspaceId] });
      toast.success("Plano refeito.");
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setExpanding(false);
    }
  };

  const copyText = async (label: string, text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copiado.`); }
    catch { toast.error("Não consegui copiar."); }
  };

  const hashtags = (meta.hashtags ?? []).map(h => h.startsWith("#") ? h : `#${h}`);
  const accent = meta.accent_color && /^#[0-9a-f]{6}$/i.test(meta.accent_color) ? meta.accent_color : "#6366f1";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-3 sm:p-6" onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b border-border bg-background/95 backdrop-blur">
          <div className="w-8 h-8 rounded-full ring-2 ring-background bg-gradient-to-br from-pink-500 via-orange-500 to-yellow-400 grid place-items-center overflow-hidden">
            {brandLogo ? <img src={brandLogo} alt="" className="w-full h-full object-cover rounded-full" />
              : <div className="w-6 h-6 rounded-full bg-background grid place-items-center text-[10px] font-bold">{brandHandle.slice(0,2).toUpperCase()}</div>}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold leading-tight truncate">{title}</div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{format} · {meta.network ?? "IG+FB"}</div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={regenerate}
              disabled={expanding}
              className="px-2 py-1 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Refazer plano do zero"
            >
              {expanding ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Refazer plano"}
            </button>
            <button
              onClick={() => {
                const providers = (qc.getQueryData(["social-image-providers", workspaceId]) as { providers: ImageProvider[] })?.providers ?? [];
                if (providers.length > 1) {
                  // Se tiver múltiplos, pergunta se quer aprimorar especificamente para Ideogram
                  const choice = window.confirm(`Deseja aprimorar o prompt de imagem de acordo com as diretrizes do Ideogram?\n\n(Isso melhora a tipografia e o realismo se você pretende gerar pelo Ideogram)`);
                  if (choice) {
                    doRefine("Aprimorar este prompt de imagem seguindo rigorosamente as diretrizes de qualidade do Ideogram V2.", "ideogram");
                    return;
                  }
                } else if (providers.includes("ideogram")) {
                  doRefine("Aprimorar este prompt de imagem seguindo rigorosamente as diretrizes de qualidade do Ideogram V2.", "ideogram");
                  return;
                }
                onUse({ title, caption, hashtags, pinned_comment: meta.pinned_comment ?? "" });
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500 text-white text-[11px] font-medium hover:bg-emerald-600 transition-colors shadow-sm"
              title="Aprimorar prompt para Ideogram"
            >
              <Sparkles className="w-3 h-3" /> Aprimorar prompt
            </button>
            <button
              onClick={() => onUse({ title, caption, hashtags, pinned_comment: meta.pinned_comment ?? "" })}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90"
            >
              <Sparkles className="w-3 h-3" /> Usar
            </button>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-muted" title="Fechar">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 grid gap-4 md:grid-cols-3">
          {/* Coluna 1, Copy */}
          <div className="md:col-span-1 space-y-3">
            <div className="rounded-xl border border-border p-3">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Gancho</div>
              <div className="text-sm font-semibold">{meta.hook || title}</div>
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground">Legenda</div>
                <button onClick={() => copyText("Legenda", `${caption}${hashtags.length ? `\n\n${hashtags.join(" ")}` : ""}`)} className="text-muted-foreground hover:text-foreground">
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              <div className="text-sm whitespace-pre-line text-foreground/90">{caption || "-"}</div>
              {hashtags.length > 0 && <div className="mt-2 text-[12px] text-primary/90">{hashtags.join(" ")}</div>}
            </div>
            {meta.primary_cta && (
              <div className="rounded-xl border border-border p-3">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">CTA</div>
                <div className="text-sm">{meta.primary_cta}</div>
                {meta.alt_ctas && meta.alt_ctas.length > 0 && (
                  <div className="mt-1 text-[11px] text-muted-foreground">alt: {meta.alt_ctas.join(" · ")}</div>
                )}
              </div>
            )}
            {meta.pinned_comment && (
              <div className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground">Comentário fixado</div>
                  <button onClick={() => copyText("Comentário fixado", meta.pinned_comment!)} className="text-muted-foreground hover:text-foreground">
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-sm whitespace-pre-line">{meta.pinned_comment}</div>
              </div>
            )}
            {meta.trending_theme && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-[10px] uppercase font-semibold text-amber-600 dark:text-amber-400 mb-1">Em alta</div>
                <div className="text-sm">{meta.trending_theme}</div>
              </div>
            )}
          </div>

          {/* Coluna 2, Plano de produção (dinÃ¢mico por formato) */}
          <div className="md:col-span-2 space-y-3">
            {expanding && !meta.expanded ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Detalhando o plano de produção…
              </div>
            ) : null}

            {meta.photo_direction && (
              <div className="rounded-xl border border-border p-3">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Direção de arte</div>
                <div className="text-sm whitespace-pre-line">{meta.photo_direction}</div>
              </div>
            )}

            {/* Carrossel */}
            {format === "carrossel" && meta.slides && meta.slides.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] uppercase font-semibold text-muted-foreground">Slides do carrossel</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {meta.slides.map((s, idx) => (
                    <div key={idx} className="rounded-xl border border-border overflow-hidden">
                      <div className="aspect-square relative flex items-end p-3" style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}88 55%, #0f172a 100%)` }}>
                        <div className="text-white">
                          <div className="text-[9px] uppercase tracking-widest opacity-80">slide {s.n ?? idx + 1}</div>
                          <div className="text-sm font-bold leading-tight line-clamp-4 drop-shadow">{s.title}</div>
                        </div>
                      </div>
                      <div className="p-2 space-y-1">
                        <div className="text-[12px] whitespace-pre-line text-foreground/90">{s.text}</div>
                        {s.image_prompt && (
                          <div className="rounded-md bg-muted/50 border border-border/50 p-2 text-[11px] leading-snug">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[9px] uppercase tracking-wide font-semibold text-muted-foreground">Prompt de imagem</span>
                              <button onClick={() => copyText("Prompt", s.image_prompt!)} className="text-muted-foreground hover:text-foreground">
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                            <div>{s.image_prompt}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {meta.closing_slide && (
                  <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
                    <div className="text-[10px] uppercase font-semibold text-primary mb-1">Slide de fechamento · CTA</div>
                    <div>{meta.closing_slide.text}</div>
                    {meta.closing_slide.cta && <div className="mt-1 font-semibold">{meta.closing_slide.cta}</div>}
                  </div>
                )}
              </div>
            )}

            {/* Story */}
            {format === "story" && meta.story_frames && meta.story_frames.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] uppercase font-semibold text-muted-foreground">Frames de story</div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {meta.story_frames.map((f, idx) => (
                    <div key={idx} className="min-w-[180px] w-[180px] rounded-xl border border-border overflow-hidden">
                      <div className="aspect-[9/16] relative flex items-end p-3" style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}88 55%, #0f172a 100%)` }}>
                        <div className="text-white text-sm font-bold drop-shadow line-clamp-6">{f.text}</div>
                        <div className="absolute top-2 left-2 text-[9px] uppercase tracking-widest bg-black/30 text-white px-1.5 py-0.5 rounded-full">{f.n ?? idx + 1}/{meta.story_frames!.length}</div>
                      </div>
                      <div className="p-2 space-y-1">
                        {f.sticker_hint && <div className="text-[10px] text-muted-foreground"><span className="font-semibold">Sticker:</span> {f.sticker_hint}</div>}
                        {f.image_prompt && (
                          <div className="rounded-md bg-muted/50 border border-border/50 p-1.5 text-[10px]">
                            <div className="text-[9px] uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">Prompt</div>
                            {f.image_prompt}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reels */}
            {format === "reels" && meta.reels_script && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 border-b border-border flex items-center gap-2 text-[11px]">
                  <span className="font-semibold uppercase tracking-wide">Roteiro de reels</span>
                  {meta.reels_script.duration_seconds ? <span className="text-muted-foreground">· {meta.reels_script.duration_seconds}s</span> : null}
                </div>
                <div className="p-3 space-y-3">
                  {meta.reels_script.hook && (
                    <div>
                      <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Gancho (0-3s)</div>
                      <div className="text-sm font-medium">{meta.reels_script.hook}</div>
                    </div>
                  )}
                  {meta.reels_script.scenes && meta.reels_script.scenes.length > 0 && (
                    <ol className="space-y-2">
                      {meta.reels_script.scenes.map((sc, idx) => (
                        <li key={idx} className="rounded-lg border border-border p-2 text-sm">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Cena {sc.n ?? idx + 1}</span>
                            {sc.time && <span className="text-[10px] text-muted-foreground">{sc.time}</span>}
                          </div>
                          {sc.action && <div><span className="text-[10px] uppercase font-semibold text-muted-foreground mr-1">Ação:</span>{sc.action}</div>}
                          {sc.on_screen_text && <div><span className="text-[10px] uppercase font-semibold text-muted-foreground mr-1">Texto na tela:</span>{sc.on_screen_text}</div>}
                          {sc.voiceover && <div><span className="text-[10px] uppercase font-semibold text-muted-foreground mr-1">Fala/VO:</span>{sc.voiceover}</div>}
                        </li>
                      ))}
                    </ol>
                  )}
                  {meta.reels_script.cta && (
                    <div className="rounded-lg bg-primary/10 border border-primary/40 p-2 text-sm">
                      <span className="text-[10px] uppercase font-semibold text-primary mr-1">CTA final</span>{meta.reels_script.cta}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
                    {meta.reels_script.sound_hint && (
                      <div className="rounded-md bg-muted/40 p-2"><span className="text-[10px] uppercase font-semibold text-muted-foreground block mb-0.5">Áudio/trilha</span>{meta.reels_script.sound_hint}</div>
                    )}
                    {meta.reels_script.b_roll && (
                      <div className="rounded-md bg-muted/40 p-2"><span className="text-[10px] uppercase font-semibold text-muted-foreground block mb-0.5">B-roll</span>{meta.reels_script.b_roll}</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Feed (foto única) */}
            {(format === "feed" || format === "qualquer" || (!meta.slides && !meta.story_frames && !meta.reels_script)) && (
              <div className="space-y-2">
                {meta.image_prompt && (
                  <div className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] uppercase font-semibold text-muted-foreground">Prompt de imagem</div>
                      <button onClick={() => copyText("Prompt", meta.image_prompt!)} className="text-muted-foreground hover:text-foreground">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-sm">{meta.image_prompt}</div>
                  </div>
                )}
                {meta.shot_list && meta.shot_list.length > 0 && (
                  <div className="rounded-xl border border-border p-3">
                    <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Variações de enquadramento</div>
                    <ul className="list-disc pl-4 text-sm space-y-0.5">
                      {meta.shot_list.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {meta.props && meta.props.length > 0 && (
                  <div className="rounded-xl border border-border p-3">
                    <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Props / elementos</div>
                    <div className="flex flex-wrap gap-1">
                      {meta.props.map((p, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-muted">{p}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Refino iterativo */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="text-[10px] uppercase font-semibold text-primary mb-2">Refinar esta ideia</div>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={2}
                placeholder='Ex: "deixa o tom mais leve, foca em prova social, muda pra carrossel de 5 slides"'
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex items-center justify-between mt-2">
                <div className="text-[10px] text-muted-foreground">
                  {meta.refinement_history?.length ? `${meta.refinement_history.length} refino(s) aplicado(s)` : "Nenhum refino ainda"}
                </div>
                <button
                  onClick={() => doRefine()}
                  disabled={refining || !instruction.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {refining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Refinar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IsSuperAdminOnly({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin } = useIsSuperAdmin();
  if (!isSuperAdmin) return null;
  return <>{children}</>;
}

// Placeholder de reexport pra manter compat com imports antigos
export { WeekGrid as SocialWeekGrid };
