// Campanha orgânica, estrutura estilo Meta Ads:
//   Aba 1: Campanha  ·  Aba 2: Conjunto de Posts  ·  Aba 3: Posts
// Múltiplos conjuntos por campanha; cada conjunto tem público, canais,
// cadência e ganchos/CTAs próprios. Formatos e peças agora ficam na aba Posts.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  Trash2,
  Megaphone,
  Sparkles,
  Calendar,
  Target,
  Lightbulb,
  Layers,
  Clock,
  Image as ImageIcon,
  CheckCircle2,
  ClipboardList,
  CalendarDays,
  MessageSquare,
  Palette,
  Wand2,
  Instagram,
  Facebook,
  AtSign,
  Zap,
  Users,
  Radio,
  ChevronRight,
  Copy,
  Play,
  Video,
  Building2,
  Pencil,
  Download,
  Upload,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  listSocialCampaigns,
  createSocialCampaign,
  updateSocialCampaign,
  deleteSocialCampaign,
  generateCampaignPosts,
  refinePostBriefing,
} from "@/lib/social-wave4.functions";
import { getBrandContext } from "@/lib/social-brand.functions";
import { getSettingsBundle } from "@/lib/settings.functions";
import { listImageProviders, listMetaTargets } from "@/lib/social.functions";
import {
  uploadFileToBucket,
  uploadDataUrlToBucket,
  signedUrlFor,
  streamImage,
} from "@/lib/social-stream";
import { SOCIAL_KPI_CATALOG, SOCIAL_KPI_GROUPS } from "@/lib/social-dashboard-kpis";
import { buildCampaignSchedule, campaignDateIsInsidePeriod } from "@/lib/social-campaign-rules";
import { channelsForSocialPostFormat, type SocialPostChannel } from "@/lib/social-post-channel-rules";
import { listSocialProviderOptions } from "@/lib/social-provider-options.functions";
import { useIsSuperAdmin } from "@/hooks/use-roles";
import { CampaignMediaStep, type CampaignMedia } from "@/components/social/CampaignMediaStep";
import { PromptBuilder, type AspectRatio } from "@/components/social/PromptBuilder";

type Format = "feed" | "reels" | "carrossel" | "story";
type Channel = "fb_feed" | "ig_feed" | "ig_story" | "ig_reels" | "tiktok" | "linkedin";
type CadenceKind = "daily" | "weekly" | "custom";

type Idea = {
  id: string;
  title: string;
  format: Format;
  angle: string | null;
  copy: string | null;
};
type FormatQuota = {
  format: Format;
  quantity: number;
  notes: string | null;
  slides?: number | null; // usado só em carrossel (nº de imagens por carrossel)
  durationSec?: number | null; // usado em reels/story (duração alvo do vídeo)
};
type Cadence = { kind: CadenceKind; perWeek: number; days: number[]; hour: number; minute: number };

// Um post concreto dentro de um conjunto. Tudo que é por peça mora aqui.
export type PostItem = {
  id: string;
  format: Format;
  slides?: number | null;
  durationSec?: number | null;
  title: string;
  briefing: string | null;
  caption: string | null;
  hashtags: string | null;
  firstComment: string | null;
  imageUrl: string | null;
  imageStoragePath?: string | null;
  logoOverlayUrl?: string | null;
  logoPosition?: { x: number; y: number; scale: number } | null;
  imagePrompt: string | null;
  date: string | null; // yyyy-mm-dd
  time: string | null; // HH:mm
  fromIdeaId?: string | null;
  placement?: Channel[];
  channelTargets?: Record<string, { ref: string; label: string }>;
  slidesData?: Array<{
    id: string;
    imageUrl: string | null;
    title?: string;
    logoOverlayUrl?: string | null;
    logoPosition?: { x: number; y: number; scale: number } | null;
  }>;
};

type PostSet = {
  id: string;
  name: string;
  audience: string | null;
  tone: string | null;
  channels: Channel[];
  /** canal -> conta conectada escolhida (page_id / instagram_id) */
  channelTargets?: Record<string, { ref: string; label: string }>;
  formats: FormatQuota[];
  cadence: Cadence;
  hooks: string[];
  ctas: string[];
  ideas: Idea[];
  posts: PostItem[];
  brandId?: string | null;
};

export type PostDraft = {
  briefing?: string | null;
  title?: string | null;
  caption?: string | null;
  firstComment?: string | null;
  imageUrl?: string | null;
  imagePrompt?: string | null;
  channels?: Channel[] | null;
  fromIdeaId?: string | null;
};

type Plan = {
  sets: PostSet[];
  kpis: string[];
  media: CampaignMedia[];
  campaignChannels?: Channel[];
  drafts?: Record<string, PostDraft>;
  // Legado (compat leitura):
  formats?: FormatQuota[];
  cadence?: Cadence;
  tone?: string | null;
  audience?: string | null;
  hooks?: string[];
  ctas?: string[];
};

type Campaign = {
  id: string;
  name: string;
  theme: string | null;
  objective: string | null;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  color: string | null;
  status: string | null;
  channels: string[] | null;
  plan: Plan | null;
  ideas: Idea[] | null;
};

type TabKey = "campanha" | "conjuntos" | "posts";

const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#0ea5e9"];

const FORMAT_LABEL: Record<Format, string> = {
  feed: "Feed (imagem)",
  reels: "Reels",
  carrossel: "Carrossel",
  story: "Story",
};
const FORMAT_LABEL_SHORT: Record<Format, string> = {
  feed: "Feed",
  reels: "Reels",
  carrossel: "Carrossel",
  story: "Story",
};
const FORMAT_ORDER: Format[] = ["feed", "reels", "carrossel", "story"];

const CHANNEL_LABEL: Record<Channel, string> = {
  ig_feed: "Instagram Feed",
  ig_reels: "Instagram Reels",
  ig_story: "Instagram Story",
  fb_feed: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};
const CHANNEL_ORDER: Channel[] = [
  "ig_feed",
  "ig_reels",
  "ig_story",
  "fb_feed",
  "tiktok",
  "linkedin",
];

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const STATUS_LABEL: Record<string, string> = {
  planned: "Planejada",
  active: "Ativa",
  paused: "Pausada",
  done: "Finalizada",
};

const FORMAT_ICON: Record<Format, typeof ImageIcon> = {
  feed: ImageIcon,
  reels: Zap,
  carrossel: Layers,
  story: MessageSquare,
};

const defaultCadence = (): Cadence => ({
  kind: "weekly",
  perWeek: 3,
  days: [1, 3, 5],
  hour: 9,
  minute: 0,
});

function newSet(name = "Conjunto principal", overrides: Partial<PostSet> = {}): PostSet {
  return {
    id: crypto.randomUUID(),
    name,
    audience: null,
    tone: null,
    channels: [],
    formats: [{ format: "feed", quantity: 4, notes: null }],
    cadence: defaultCadence(),
    hooks: [],
    ctas: [],
    ideas: [],
    posts: [],
    brandId: null,
    ...overrides,
    ...(overrides.posts ? { posts: overrides.posts } : {}),
  };
}

const emptyPlan = (): Plan => ({
  sets: [newSet()],
  kpis: [],
  media: [],
  campaignChannels: [],
  drafts: {},
});

function normalizeSet(s: PostSet): PostSet {
  return {
    ...s,
    channels: s.channels ?? [],
    channelTargets: s.channelTargets ?? {},
    formats: s.formats ?? [],
    hooks: s.hooks ?? [],
    ctas: s.ctas ?? [],
    ideas: s.ideas ?? [],
    cadence: s.cadence ?? defaultCadence(),
    posts: (s.posts ?? []).map((p) => ({ ...p })),
  };
}

// Migra plano legado (sem `sets`) para o novo formato.
function migratePlan(
  legacy: Plan | null | undefined,
  legacyIdeas: Idea[],
  legacyChannels: Channel[],
): Plan {
  if (legacy?.sets?.length) {
    return {
      sets: legacy.sets.map(normalizeSet),
      kpis: legacy.kpis ?? [],
      media: legacy.media ?? [],
      campaignChannels: legacy.campaignChannels ?? [],
      drafts: legacy.drafts ?? {},
    };
  }
  const initialChannels = legacyChannels?.length ? legacyChannels : ["ig_feed" as Channel];
  return {
    sets: [
      newSet("Conjunto principal", {
        audience: legacy?.audience ?? null,
        tone: legacy?.tone ?? null,
        channels: initialChannels,
        formats: legacy?.formats?.length
          ? legacy.formats
          : [{ format: "feed", quantity: 4, notes: null }],
        cadence: legacy?.cadence ?? defaultCadence(),
        hooks: legacy?.hooks ?? [],
        ctas: legacy?.ctas ?? [],
        ideas: legacyIdeas ?? [],
        posts: [],
      }),
    ],
    kpis: legacy?.kpis ?? [],
    media: legacy?.media ?? [],
    campaignChannels: initialChannels,
    drafts: {},
  };
}

// Limites por formato (regras reais das plataformas)
const FORMAT_MAX_QTY: Record<Format, number> = { feed: 60, reels: 60, carrossel: 60, story: 10 };

function newPostItem(
  format: Format,
  quota: FormatQuota | undefined,
  seq: number,
  campaignName: string,
  setName: string,
): PostItem {
  return {
    id: crypto.randomUUID(),
    format,
    slides: format === "carrossel" ? (quota?.slides ?? 6) : null,
    durationSec:
      format === "reels" || format === "story"
        ? (quota?.durationSec ?? (format === "reels" ? 30 : 15))
        : null,
    title: `${campaignName || "Campanha"} · ${setName} · ${FORMAT_LABEL_SHORT[format]} ${seq}`,
    briefing: quota?.notes ?? null,
    caption: null,
    hashtags: null,
    firstComment: null,
    imageUrl: null,
    imagePrompt: null,
    date: null,
    time: null,
  };
}

// Quantidade planejada por formato no conjunto.
function plannedTotal(s: PostSet): number {
  return (s.formats ?? []).reduce((n, f) => n + Math.max(0, f.quantity ?? 0), 0);
}

// Cria os posts que faltam para bater com a quantidade planejada por formato.
// Nunca apaga post existente: quem apaga é o usuário.
function syncSetPosts(s: PostSet, campaignName: string): PostItem[] {
  const posts = [...(s.posts ?? [])];
  for (const q of s.formats ?? []) {
    const target = Math.max(0, Math.min(FORMAT_MAX_QTY[q.format], q.quantity ?? 0));
    const have = posts.filter((p) => p.format === q.format).length;
    for (let i = have; i < target; i += 1) {
      posts.push(newPostItem(q.format, q, i + 1, campaignName, s.name));
    }
  }
  return posts;
}

function toDate(d: string | null, t: string | null): Date | null {
  if (!d) return null;
  const dt = new Date(`${d}T${t || "09:00"}:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function fmtDateLabel(p: PostItem): string {
  const dt = toDate(p.date, p.time);
  if (!dt) return "Sem agendamento";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

// Distribui datas nos posts do conjunto conforme cadência e período da campanha.
function distributeDates(
  posts: PostItem[],
  starts: string,
  ends: string,
  cadence: Cadence,
): PostItem[] {
  if (!posts.length || !starts) return posts;
  if (!ends) throw new Error("Defina o fim da campanha antes de distribuir as datas.");
  const slots = buildCampaignSchedule(posts.length, starts, ends, cadence);
  const hh = String(cadence.hour).padStart(2, "0");
  const mm = String(cadence.minute).padStart(2, "0");
  return posts.map((p, i) => ({
    ...p,
    date: isoDay(slots[i]),
    time: `${hh}:${mm}`,
  }));
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function channelsForFormat(format: Format, selected: Channel[]): Channel[] {
  if (!selected.length)
    return format === "reels" ? ["ig_reels"] : format === "story" ? ["ig_story"] : ["ig_feed"];
  if (format === "reels") return selected.includes("ig_reels") ? ["ig_reels"] : selected;
  if (format === "story") return selected.includes("ig_story") ? ["ig_story"] : selected;
  const feedLike = selected.filter((c) => ["ig_feed", "fb_feed", "linkedin"].includes(c));
  return feedLike.length ? feedLike : selected;
}

function totalPiecesInSet(s: PostSet): number {
  return (s.posts?.length ?? 0) || plannedTotal(s);
}

export function CampaignsDialog({
  open,
  onClose,
  workspaceId,
  variant = "modal",
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
  variant?: "modal" | "page";
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSocialCampaigns);
  const createFn = useServerFn(createSocialCampaign);
  const updateFn = useServerFn(updateSocialCampaign);
  const deleteFn = useServerFn(deleteSocialCampaign);
  const generateFn = useServerFn(generateCampaignPosts);
  const refinePostFn = useServerFn(refinePostBriefing);
  const { isSuperAdmin } = useIsSuperAdmin();

  const { data, isLoading } = useQuery({
    queryKey: ["social-campaigns", workspaceId],
    enabled: !!workspaceId && open,
    queryFn: async () => listFn({ data: { workspaceId: workspaceId! } }),
  });

  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<TabKey>("campanha");
  const [activeSetId, setActiveSetId] = useState<string | null>(null);

  // Campo do nível campanha
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [objective, setObjective] = useState("");
  const [description, setDescription] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [plan, setPlan] = useState<Plan>(emptyPlan);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setTheme(editing.theme ?? "");
      setObjective(editing.objective ?? "");
      setDescription(editing.description ?? "");
      setStarts(editing.starts_at ? editing.starts_at.slice(0, 10) : "");
      setEnds(editing.ends_at ? editing.ends_at.slice(0, 10) : "");
      setColor(editing.color ?? COLORS[0]);
      const migrated = migratePlan(
        editing.plan,
        editing.ideas ?? [],
        (editing.channels ?? []) as Channel[],
      );
      setPlan(migrated);
      setActiveSetId(migrated.sets[0]?.id ?? null);
      setCreating(true);
      setTab("campanha");
    }
  }, [editing]);

  const reset = () => {
    setEditing(null);
    setCreating(false);
    setTab("campanha");
    setName("");
    setTheme("");
    setObjective("");
    setDescription("");
    setStarts("");
    setEnds("");
    setColor(COLORS[0]);
    const p = emptyPlan();
    setPlan(p);
    setActiveSetId(p.sets[0]?.id ?? null);
  };

  const startNew = () => {
    const p = emptyPlan();
    setPlan(p);
    setActiveSetId(p.sets[0]?.id ?? null);
    setCreating(true);
    setTab("campanha");
  };

  const activeSet = plan.sets.find((s) => s.id === activeSetId) ?? plan.sets[0] ?? null;
  const updateSet = (setId: string, patch: Partial<PostSet>) => {
    setPlan((p) => ({ ...p, sets: p.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }));
  };
  const addSet = () => {
    const s = newSet(`Conjunto ${plan.sets.length + 1}`);
    setPlan((p) => ({ ...p, sets: [...p.sets, s] }));
    setActiveSetId(s.id);
  };
  const duplicateSet = (setId: string) => {
    const src = plan.sets.find((s) => s.id === setId);
    if (!src) return;
    const copy: PostSet = {
      ...src,
      id: crypto.randomUUID(),
      name: `${src.name} (cópia)`,
      ideas: src.ideas.map((i) => ({ ...i, id: crypto.randomUUID() })),
    };
    setPlan((p) => ({ ...p, sets: [...p.sets, copy] }));
    setActiveSetId(copy.id);
  };
  const removeSet = (setId: string) => {
    if (plan.sets.length <= 1) {
      toast.error("A campanha precisa de pelo menos 1 conjunto.");
      return;
    }
    if (!confirm("Excluir este conjunto e todos os posts dele?")) return;
    setPlan((p) => {
      const next = { ...p, sets: p.sets.filter((s) => s.id !== setId) };
      if (activeSetId === setId) setActiveSetId(next.sets[0]?.id ?? null);
      return next;
    });
  };

  // ── Posts (nível 3) ──
  const syncPosts = (setId?: string) => {
    setPlan((p) => ({
      ...p,
      sets: p.sets.map((s) =>
        setId && s.id !== setId ? s : { ...s, posts: syncSetPosts(s, name) },
      ),
    }));
  };
  const updatePost = (setId: string, postId: string, patch: Partial<PostItem>) => {
    setPlan((p) => ({
      ...p,
      sets: p.sets.map((s) =>
        s.id !== setId
          ? s
          : { ...s, posts: s.posts.map((x) => (x.id === postId ? { ...x, ...patch } : x)) },
      ),
    }));
  };
  const duplicatePost = (setId: string, postId: string) => {
    setPlan((p) => ({
      ...p,
      sets: p.sets.map((s) => {
        if (s.id !== setId) return s;
        const idx = s.posts.findIndex((x) => x.id === postId);
        if (idx < 0) return s;
        const copy: PostItem = {
          ...s.posts[idx],
          id: crypto.randomUUID(),
          title: `${s.posts[idx].title} (cópia)`,
        };
        const posts = s.posts.slice();
        posts.splice(idx + 1, 0, copy);
        return { ...s, posts };
      }),
    }));
    toast.success("Post duplicado.");
  };
  const renamePost = (setId: string, postId: string, newTitle: string) => {
    setPlan((p) => ({
      ...p,
      sets: p.sets.map((s) =>
        s.id !== setId
          ? s
          : { ...s, posts: s.posts.map((x) => (x.id === postId ? { ...x, title: newTitle } : x)) },
      ),
    }));
  };
  const removePost = (setId: string, postId: string) => {
    setPlan((p) => ({
      ...p,
      sets: p.sets.map((s) =>
        s.id !== setId ? s : { ...s, posts: s.posts.filter((x) => x.id !== postId) },
      ),
    }));
  };
  const addPost = (setId: string, format: Format) => {
    setPlan((p) => ({
      ...p,
      sets: p.sets.map((s) => {
        if (s.id !== setId) return s;
        const quota = s.formats.find((f) => f.format === format);
        const seq = s.posts.filter((x) => x.format === format).length + 1;
        return { ...s, posts: [...s.posts, newPostItem(format, quota, seq, name, s.name)] };
      }),
    }));
  };
  const applyCadence = (setId: string, cadence: Cadence) => {
    if (!starts) {
      toast.error("Defina o início da campanha na aba Campanha.");
      return;
    }
    try {
      setPlan((p) => ({
        ...p,
        sets: p.sets.map((s) =>
          s.id !== setId
            ? s
            : { ...s, cadence, posts: distributeDates(s.posts, starts, ends, cadence) },
        ),
      }));
      toast.success("Datas distribuídas nos posts do conjunto.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const totalPieces = useMemo(
    () => plan.sets.reduce((n, s) => n + totalPiecesInSet(s), 0),
    [plan.sets],
  );
  const totalIdeas = useMemo(() => plan.sets.reduce((n, s) => n + s.ideas.length, 0), [plan.sets]);
  const allChannels = useMemo(() => {
    const c = new Set<Channel>();
    for (const s of plan.sets) s.channels.forEach((x) => c.add(x));
    return Array.from(c);
  }, [plan.sets]);

  const handleRefineSetPosts = async (setId: string, forcedProvider?: string) => {
    if (!workspaceId) {
      toast.error("Workspace não carregado.");
      return;
    }
    const s = plan.sets.find((x) => x.id === setId);
    if (!s || !s.posts.length) {
      toast.error("Crie posts no conjunto primeiro.");
      return;
    }

    const targetProvider = (forcedProvider as any) || "ideogram";

    toast.info(`Aprimorando ${s.posts.length} posts do conjunto "${s.name}"…`);

    const refinedPosts = [...s.posts];
    for (let i = 0; i < refinedPosts.length; i++) {
      const p = refinedPosts[i];
      try {
        const out = (await refinePostFn({
          data: {
            workspaceId,
            briefing: p.briefing || s.name,
            format: p.format,
            tone: s.tone,
            audience: s.audience,
            campaignName: name,
            campaignObjective: objective,
            targetImageProvider: targetProvider,
            brandId: s.brandId,
          },
        })) as any;

        const basePost = {
          ...p,
          briefing: out.refinedBriefing || p.briefing,
          imagePrompt: out.imagePrompt || p.imagePrompt,
          title: out.suggestedTitle || p.title,
          caption: out.suggestedCaption || p.caption,
          hashtags: Array.isArray(out.suggestedHashtags)
            ? out.suggestedHashtags.join(" ")
            : p.hashtags,
          firstComment: out.suggestedFirstComment || p.firstComment,
        };

        // Lógica para carrossel: Se o formato for carrossel e tiver múltiplos slides (ex: 4-6),
        // o Ideogram V3 agora retorna 4 imagens de uma vez. Mapeamos isso para os slides.
        if (p.format === "carrossel" && p.slides && p.slides > 1) {
          // Inicializa slides se não existirem
          const slides = Array.from({ length: p.slides }).map((_, idx) => ({
            id: crypto.randomUUID(),
            imageUrl: null,
            imagePrompt: out.imagePrompt || p.imagePrompt, // Mesmo prompt base para consistência
            title: `Slide ${idx + 1}`,
          }));
          refinedPosts[i] = { ...basePost, slidesData: slides };
        } else {
          refinedPosts[i] = basePost;
        }
      } catch (e) {
        console.error(`Falha ao refinar post ${i}:`, e);
      }
    }

    setPlan((prev) => ({
      ...prev,
      sets: prev.sets.map((x) => (x.id === setId ? { ...x, posts: refinedPosts } : x)),
    }));
    toast.success("Todos os posts do conjunto foram aprimorados.");
  };

  const saveCore = async (statusOverride?: "planned" | "active"): Promise<string | null> => {
    if (!workspaceId || !name.trim()) {
      toast.error("Dê um nome para a campanha.");
      return null;
    }
    // Empacota `plan` com sets + campos legados (compat leitura antiga).
    const first = plan.sets[0];
    const payload = {
      workspaceId,
      name: name.trim(),
      theme: theme || null,
      objective: objective || null,
      description: description || null,
      startsAt: starts ? new Date(starts + "T00:00:00Z").toISOString() : null,
      endsAt: ends ? new Date(ends + "T23:59:59Z").toISOString() : null,
      channels: allChannels,
      color,
      status: statusOverride ?? ("planned" as const),
      plan: {
        sets: plan.sets,
        kpis: plan.kpis,
        media: plan.media,
        campaignChannels: plan.campaignChannels ?? allChannels,
        drafts: plan.drafts ?? {},
        // Espelho legado (leitura antiga):
        formats: first?.formats ?? [],
        cadence: first?.cadence ?? defaultCadence(),
        tone: first?.tone ?? null,
        audience: first?.audience ?? null,
        hooks: first?.hooks ?? [],
        ctas: first?.ctas ?? [],
      },
      // ideas legado agora fica dentro dos sets.
      ideas: [],
    };
    if (editing) {
      await updateFn({ data: { workspaceId, campaignId: editing.id, patch: payload } });
      return editing.id;
    }
    const res = await createFn({ data: payload });
    return (res as { campaign?: { id: string } }).campaign?.id ?? null;
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const id = await saveCore("planned");
      if (id) {
        toast.success("Estratégia salva.");
        qc.invalidateQueries({ queryKey: ["social-campaigns", workspaceId] });
        reset();
      }
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleActivateAndGenerate = async () => {
    if (!starts || !ends) {
      toast.error("Defina início e fim da campanha.");
      return;
    }
    if (!totalPieces) {
      toast.error("Nenhum conjunto tem posts para gerar.");
      return;
    }
    setGenerating(true);
    try {
      const id = await saveCore("active");
      if (!id) return;
      const res = await generateFn({
        data: { workspaceId: workspaceId!, campaignId: id, replaceExistingDrafts: true },
      });
      toast.success(`${(res as { created: number }).created} peças agendadas.`);
      qc.invalidateQueries({ queryKey: ["social-campaigns", workspaceId] });
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      reset();
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setGenerating(false);
    }
  };

  const removeCamp = async (id: string) => {
    if (!workspaceId) return;
    if (!confirm("Excluir esta campanha? Os posts vinculados ficam sem campanha.")) return;
    await deleteFn({ data: { workspaceId, campaignId: id } });
    qc.invalidateQueries({ queryKey: ["social-campaigns", workspaceId] });
    toast.info("Campanha removida.");
  };

  const duplicateCamp = async (c: Campaign) => {
    if (!workspaceId) return;
    const migrated = migratePlan(c.plan, c.ideas ?? [], (c.channels ?? []) as Channel[]);
    const clonedSets = migrated.sets.map((s) => ({
      ...s,
      id: crypto.randomUUID(),
      ideas: s.ideas.map((i) => ({ ...i, id: crypto.randomUUID() })),
      posts: (s.posts ?? []).map((p) => ({ ...p, id: crypto.randomUUID() })),
    }));
    try {
      await createFn({
        data: {
          workspaceId,
          name: `${c.name} (cópia)`,
          theme: c.theme ?? null,
          objective: c.objective ?? null,
          description: c.description ?? null,
          startsAt: c.starts_at ?? null,
          endsAt: c.ends_at ?? null,
          channels: (c.channels ?? []) as Channel[],
          color: c.color ?? COLORS[0],
          status: "planned" as const,
          plan: { ...migrated, sets: clonedSets },
          ideas: [],
        },
      });
      qc.invalidateQueries({ queryKey: ["social-campaigns", workspaceId] });
      toast.success("Campanha duplicada.");
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    }
  };

  const campaigns = (data as { campaigns?: Campaign[] } | undefined)?.campaigns ?? [];

  const body = (
    <>
      {!creating && (
        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="min-w-0 space-y-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <ClipboardList className="w-3 h-3" /> Campanha · Conjunto de Posts · Posts
              </div>
              <p className="text-sm font-semibold leading-tight">
                Nova campanha orgânica em 3 níveis (estilo Meta Ads).
              </p>
              <p className="text-xs text-muted-foreground max-w-3xl">
                A campanha guarda o objetivo geral. Cada <strong>Conjunto de Posts</strong> define
                seu público, canais, formatos e cadência. Cada <strong>Post</strong> é uma peça que
                entra no calendário.
              </p>
            </div>
            <button
              onClick={startNew}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="w-3 h-3" /> Nova campanha
            </button>
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
              Carregando…
            </div>
          ) : !campaigns.length ? (
            <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-xs text-muted-foreground">
              Nenhuma campanha ainda.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {campaigns.map((c) => {
                const migrated = migratePlan(
                  c.plan,
                  c.ideas ?? [],
                  (c.channels ?? []) as Channel[],
                );
                const setsCount = migrated.sets.length;
                const totalCamp = migrated.sets.reduce((n, s) => n + totalPiecesInSet(s), 0);
                const mediaCount = migrated.media.length;
                return (
                  <div
                    key={c.id}
                    className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ background: c.color ?? "#6366f1" }}
                          />
                          <div className="truncate text-sm font-semibold">{c.name}</div>
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {STATUS_LABEL[c.status ?? "planned"] ?? c.status}
                          </span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {c.objective ?? c.theme ?? c.description ?? "Sem objetivo definido"}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-start gap-1">
                        <button
                          onClick={() => setEditing(c)}
                          className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => duplicateCamp(c)}
                          className="rounded-md border border-border p-1.5 hover:bg-muted"
                          title="Duplicar campanha"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removeCamp(c.id)}
                          className="rounded-md border border-border p-1.5 hover:bg-muted"
                          title="Excluir"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <MiniMetric
                        icon={CalendarDays}
                        label="Período"
                        value={
                          c.starts_at || c.ends_at
                            ? `${c.starts_at?.slice(5, 10) ?? "…"} → ${c.ends_at?.slice(5, 10) ?? "…"}`
                            : "Sem data"
                        }
                      />
                      <MiniMetric icon={Users} label="Conjuntos" value={String(setsCount)} />
                      <MiniMetric icon={Layers} label="Posts" value={String(totalCamp)} />
                      <MiniMetric icon={ImageIcon} label="Mídias" value={String(mediaCount)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {creating && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
          {/* Tabs Meta-style */}
          <div className="border-b border-border bg-card px-3 py-2">
            <div className="flex items-center gap-1">
              <TabButton
                active={tab === "campanha"}
                icon={Target}
                label="Campanha"
                step={1}
                sub={name || "Sem nome"}
                onClick={() => setTab("campanha")}
              />
              <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
              <TabButton
                active={tab === "conjuntos"}
                icon={Users}
                label="Conjunto de Posts"
                step={2}
                sub={`${plan.sets.length} conjunto${plan.sets.length === 1 ? "" : "s"}`}
                onClick={() => setTab("conjuntos")}
              />
              <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
              <TabButton
                active={tab === "posts"}
                icon={Layers}
                label="Posts"
                step={3}
                sub={`${totalPieces} peça${totalPieces === 1 ? "" : "s"}`}
                onClick={() => setTab("posts")}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
            {tab === "campanha" && (
              <CampaignTab
                name={name}
                setName={setName}
                theme={theme}
                setTheme={setTheme}
                objective={objective}
                setObjective={setObjective}
                description={description}
                setDescription={setDescription}
                starts={starts}
                setStarts={setStarts}
                ends={ends}
                setEnds={setEnds}
                color={color}
                setColor={setColor}
                plan={plan}
                setPlan={setPlan}
                workspaceId={workspaceId}
                isSuperAdmin={isSuperAdmin}
              />
            )}

            {tab === "conjuntos" && (
              <ConjuntosTab
                plan={plan}
                activeSetId={activeSetId}
                onSelectSet={setActiveSetId}
                onUpdateSet={updateSet}
                onAddSet={addSet}
                onDuplicateSet={duplicateSet}
                onRemoveSet={removeSet}
                activeSet={activeSet}
                starts={starts}
                ends={ends}
                workspaceId={workspaceId}
              />
            )}

            {tab === "posts" && (
              <PostsTab
                sets={plan.sets}
                campaignName={name}
                starts={starts}
                ends={ends}
                activeSetId={activeSetId}
                onSelectSet={setActiveSetId}
                onSyncPosts={syncPosts}
                onUpdatePost={updatePost}
                onDuplicatePost={duplicatePost}
                onRemovePost={removePost}
                onAddPost={addPost}
                onApplyCadence={applyCadence}
                workspaceId={workspaceId}
                onRefineSetPosts={handleRefineSetPosts}
                onUpdateSet={updateSet}
                onRenamePost={renamePost}
              />
            )}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-border bg-card px-3 py-3">
            <button
              onClick={reset}
              className="w-fit rounded-md border border-border px-3 py-2 text-xs hover:bg-muted"
            >
              Cancelar
            </button>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              <button
                onClick={handleSaveDraft}
                disabled={saving || generating}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Salvar rascunho
              </button>
              <button
                onClick={handleActivateAndGenerate}
                disabled={saving || generating || !totalPieces}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Gerar {totalPieces} peça{totalPieces === 1 ? "" : "s"} no calendário
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (variant === "page") {
    return (
      <div className="rounded-xl border border-border bg-card p-5 flex flex-col min-h-[70vh]">
        {body}
      </div>
    );
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Megaphone className="w-4 h-4 text-primary" />
            {creating ? (editing ? "Editar campanha" : "Nova campanha") : "Campanhas orgânicas"}
          </DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════

function TabButton({
  active,
  icon: Icon,
  label,
  step,
  sub,
  onClick,
}: {
  active: boolean;
  icon: typeof Target;
  label: string;
  step: number;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 min-w-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md px-3 py-2 text-left transition-colors",
        active ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground",
      )}
    >
      <div
        className={cn(
          "grid place-items-center h-7 w-7 rounded-md shrink-0 text-[11px] font-bold",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {step}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-[12px] font-semibold">
          <Icon className="w-3 h-3" /> <span className="truncate">{label}</span>
        </div>
        <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
      </div>
    </button>
  );
}

function MiniMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-0.5 truncate text-xs font-semibold">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ChannelBadge({ channel }: { channel: Channel }) {
  const Icon = channel.startsWith("ig") ? Instagram : channel.startsWith("fb") ? Facebook : AtSign;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
      <Icon className="h-2.5 w-2.5" /> {CHANNEL_LABEL[channel]}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ABA 1, CAMPANHA (objetivo, período, cor, KPIs, mídias)
// ═══════════════════════════════════════════════════════════════════════

function CampaignTab({
  name,
  setName,
  theme,
  setTheme,
  objective,
  setObjective,
  description,
  setDescription,
  starts,
  setStarts,
  ends,
  setEnds,
  color,
  setColor,
  plan,
  setPlan,
  workspaceId,
  isSuperAdmin,
}: {
  name: string;
  setName: (v: string) => void;
  theme: string;
  setTheme: (v: string) => void;
  objective: string;
  setObjective: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  starts: string;
  setStarts: (v: string) => void;
  ends: string;
  setEnds: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  plan: Plan;
  setPlan: (v: Plan) => void;
  workspaceId: string | null;
  isSuperAdmin: boolean;
}) {
  const allFormats: Format[] = useMemo(() => {
    const s = new Set<Format>();
    for (const set of plan.sets) for (const f of set.formats) if (f.quantity > 0) s.add(f.format);
    return Array.from(s);
  }, [plan.sets]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-primary" /> Direção da campanha
          </div>
          <Field label="Nome da campanha *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Lançamento Coleção Verão"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tema">
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="Ex: Verão 2026"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Objetivo estratégico">
              <input
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Ex: gerar leads, vender, educar, aquecer audiência"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Preferência e identidade">
              <input
                placeholder="Ex: Identidade visual, estilo de arte"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>
            <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              Os KPIs são escolhidos no catálogo real abaixo e alimentam o acompanhamento da campanha.
            </div>
          </div>
          <Field label="Descrição / briefing geral">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Contexto, oferta principal, restrições, tom desejado, produto, dores do público e o que não pode faltar."
              className="mt-1 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="h-4 w-4 text-primary" /> Período & identidade
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início *">
              <input
                type="date"
                value={starts}
                onChange={(e) => setStarts(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Fim *">
              <input
                type="date"
                value={ends}
                onChange={(e) => setEnds(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <Field label="Cor no calendário">
            <div className="mt-1 flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-8 w-8 rounded-md border-2 transition-transform hover:scale-105",
                    color === c ? "border-foreground" : "border-transparent",
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Field>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BadgeIcon /> KPIs de acompanhamento (Seleção rápida)
        </div>
        <KpiPicker values={plan.kpis} onChange={(v) => setPlan({ ...plan, kpis: v })} />
      </section>
    </div>
  );
}

function BadgeIcon() {
  return <CheckCircle2 className="h-4 w-4 text-primary" />;
}

// ═══════════════════════════════════════════════════════════════════════
// ABA 2, CONJUNTOS DE POSTS (audiência, canais, formatos, cadência)
// ═══════════════════════════════════════════════════════════════════════

function ConjuntosTab({
  plan,
  activeSetId,
  onSelectSet,
  onUpdateSet,
  onAddSet,
  onDuplicateSet,
  onRemoveSet,
  activeSet,
  starts,
  ends,
  workspaceId,
}: {
  plan: Plan;
  activeSetId: string | null;
  onSelectSet: (id: string) => void;
  onUpdateSet: (id: string, patch: Partial<PostSet>) => void;
  onAddSet: () => void;
  onDuplicateSet: (id: string) => void;
  onRemoveSet: (id: string) => void;
  activeSet: PostSet | null;
  starts: string;
  ends: string;
  workspaceId: string | null;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4">
      {/* Lista de conjuntos */}
      <aside className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Conjuntos
          </div>
          <button
            onClick={onAddSet}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
          >
            <Plus className="w-3 h-3" /> Novo
          </button>
        </div>
        <div className="space-y-1.5">
          {plan.sets.map((s) => {
            const total = totalPiecesInSet(s);
            const active = s.id === activeSetId;
            return (
              <button
                key={s.id}
                onClick={() => onSelectSet(s.id)}
                className={cn(
                  "w-full text-left rounded-md border p-2 transition-colors",
                  active ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                )}
              >
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{s.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {s.audience || "Sem público definido"}
                    </div>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                  <span className="rounded bg-muted px-1.5 py-0.5">{total} posts</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Editor do conjunto ativo */}
      <div className="min-w-0">
        {!activeSet ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Selecione ou adicione um conjunto.
          </div>
        ) : (
          <SetEditor
            set={activeSet}
            onChange={(patch) => onUpdateSet(activeSet.id, patch)}
            onDuplicate={() => onDuplicateSet(activeSet.id)}
            onRemove={() => onRemoveSet(activeSet.id)}
            canRemove={plan.sets.length > 1}
            starts={starts}
            ends={ends}
            campaignChannels={plan.campaignChannels ?? []}
            workspaceId={workspaceId}
          />
        )}
      </div>
    </div>
  );
}

function SetEditor({
  set,
  onChange,
  onDuplicate,
  onRemove,
  canRemove,
  starts,
  ends,
  campaignChannels,
  workspaceId,
}: {
  set: PostSet;
  onChange: (patch: Partial<PostSet>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  canRemove: boolean;
  starts: string;
  ends: string;
  campaignChannels: Channel[];
  workspaceId: string | null;
}) {
  const total = totalPiecesInSet(set);
  const rangeDays =
    starts && ends
      ? Math.max(1, Math.round((new Date(ends).getTime() - new Date(starts).getTime()) / 86400000))
      : null;

  return (
    <div className="space-y-4">
      {/* Header do conjunto */}
      <div className="rounded-lg border border-border bg-card p-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <input
          value={set.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nome do conjunto"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold"
        />
        <div className="flex items-center gap-1">
          <button
            onClick={onDuplicate}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] hover:bg-muted"
          >
            <Copy className="w-3 h-3" /> Duplicar
          </button>
          <button
            onClick={onRemove}
            disabled={!canRemove}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] hover:bg-muted disabled:opacity-40"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Público & tom */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Users className="w-4 h-4 text-primary" /> Público & tom
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Público-alvo">
            <input
              value={set.audience ?? ""}
              onChange={(e) => onChange({ audience: e.target.value || null })}
              placeholder="Ex: mulheres 25-40 SP, donas de clínica estética"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Tom de voz">
            <input
              value={set.tone ?? ""}
              onChange={(e) => onChange({ tone: e.target.value || null })}
              placeholder="Ex: direto, premium, educativo, provocativo"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
        </div>
      </section>

      {/* Ganchos & CTAs */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="w-4 h-4 text-primary" /> Ganchos & CTAs (recorrentes deste conjunto)
        </div>
        <TagList
          label="Ganchos"
          values={set.hooks}
          onChange={(v) => onChange({ hooks: v })}
          placeholder="Ex: você sabia que..."
        />
        <TagList
          label="CTAs"
          values={set.ctas}
          onChange={(v) => onChange({ ctas: v })}
          placeholder="Ex: Comente 'quero' pra receber"
        />
      </section>

      {/* Marca Associada */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="w-4 h-4 text-primary" /> Marca associada (opcional)
        </div>
        <p className="text-[11px] text-muted-foreground -mt-1">
          Selecione a marca para que a IA utilize o contexto visual, logo e referências.
        </p>
        <BrandSelector
          workspaceId={workspaceId}
          value={set.brandId}
          onChange={(id) => onChange({ brandId: id })}
        />
      </section>
    </div>
  );
}

function BrandSelector({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string | null;
  value?: string | null;
  onChange: (id: string | null) => void;
}) {
  const getBrand = useServerFn(getBrandContext);
  const { data } = useQuery({
    queryKey: ["social-brand-context", workspaceId],
    queryFn: () => getBrand({ data: { workspaceId: workspaceId as string } }),
    enabled: !!workspaceId,
  });

  const brand = data?.context;

  return (
    <div className="flex items-center gap-2">
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs"
      >
        <option value="">Nenhuma marca vinculada</option>
        {brand && (
          <option value={(brand as any).id as string}>
            {brand.company_name || "Marca Principal"}
          </option>
        )}
      </select>
      {value && brand && (
        <Badge variant="outline" className="h-8 gap-1 px-2 text-[10px]">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Ativa
        </Badge>
      )}
    </div>
  );
}

function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-background overflow-hidden h-9 w-full">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        className="px-2.5 h-full hover:bg-muted disabled:opacity-40 text-sm font-medium"
      >
        −
      </button>
      <div className="flex-1 flex items-baseline justify-center gap-1 px-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) =>
            onChange(Math.max(min, Math.min(max, parseInt(e.target.value || "0", 10))))
          }
          className="w-10 text-center text-sm font-semibold bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        className="px-2.5 h-full hover:bg-muted disabled:opacity-40 text-sm font-medium"
      >
        +
      </button>
    </div>
  );
}

function CadenceEditor({
  cadence,
  onChange,
  total,
  rangeDays,
}: {
  cadence: Cadence;
  onChange: (c: Cadence) => void;
  total: number;
  rangeDays: number | null;
}) {
  const setC = (patch: Partial<Cadence>) => onChange({ ...cadence, ...patch });
  const hh = String(cadence.hour).padStart(2, "0");
  const mm = String(cadence.minute).padStart(2, "0");

  // Estimativa de resumo
  const summary = (() => {
    if (!total) return "Adicione peças em Formatos & quantidade primeiro.";
    if (cadence.kind === "daily") {
      const dias = total;
      return `${total} peça${total === 1 ? "" : "s"} publicada${total === 1 ? "" : "s"} 1×/dia às ${hh}:${mm}, ocupa ${dias} dia${dias === 1 ? "" : "s"}.`;
    }
    if (cadence.kind === "weekly") {
      const semanas = Math.max(1, Math.ceil(total / Math.max(1, cadence.perWeek)));
      return `${cadence.perWeek} post${cadence.perWeek === 1 ? "" : "s"}/semana às ${hh}:${mm}, ${total} peça${total === 1 ? "" : "s"} em ~${semanas} semana${semanas === 1 ? "" : "s"}.`;
    }
    const dow = cadence.days.length;
    return `Publicações nos dias marcados (${dow || 0} dia${dow === 1 ? "" : "s"}/semana) às ${hh}:${mm}.`;
  })();

  const overflow = rangeDays !== null && cadence.kind === "daily" && total > rangeDays;

  return (
    <div className="space-y-3">
      {/* Passo 1: com qual frequência */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
          1. Com que frequência publicar?
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { k: "daily", title: "Todo dia", sub: "1 post por dia" },
              { k: "weekly", title: "X vezes por semana", sub: "Você escolhe quantos" },
              { k: "custom", title: "Dias fixos", sub: "Seg, Qua, Sex…" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.k}
              type="button"
              onClick={() => setC({ kind: opt.k })}
              className={cn(
                "rounded-lg border p-2.5 text-left transition-colors",
                cadence.kind === opt.k
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border hover:bg-muted",
              )}
            >
              <div className="text-[12px] font-semibold">{opt.title}</div>
              <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                {opt.sub}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Passo 2: quantidade/dias */}
      {cadence.kind === "weekly" && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            2. Quantos posts por semana?
          </div>
          <Stepper
            value={cadence.perWeek}
            onChange={(v) => setC({ perWeek: Math.max(1, Math.min(21, v)) })}
            min={1}
            max={21}
            suffix={cadence.perWeek === 1 ? "post/sem" : "posts/sem"}
          />
        </div>
      )}

      {(cadence.kind === "weekly" || cadence.kind === "custom") && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            {cadence.kind === "custom"
              ? "2. Em quais dias da semana?"
              : "3. Em quais dias da semana (preferência)?"}
          </div>
          <div className="flex gap-1 flex-wrap">
            {DAYS.map((d, i) => {
              const on = cadence.days.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    setC({
                      days: on ? cadence.days.filter((x) => x !== i) : [...cadence.days, i].sort(),
                    })
                  }
                  className={cn(
                    "w-11 h-11 rounded-lg border text-[11px] font-semibold transition-colors",
                    on
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Passo 3: horário */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
          {cadence.kind === "weekly" ? "4." : cadence.kind === "custom" ? "3." : "2."} Que horas
          publicar?
        </div>
        <input
          type="time"
          value={`${hh}:${mm}`}
          onChange={(e) => {
            const [h, m] = e.target.value.split(":").map((x) => parseInt(x || "0", 10));
            setC({ hour: h || 0, minute: m || 0 });
          }}
          className="px-3 py-2 rounded-md border border-border bg-background text-sm font-semibold w-32"
        />
      </div>

      {/* Resumo em linguagem natural */}
      <div
        className={cn(
          "rounded-md p-2.5 text-[11px] flex items-start gap-2",
          overflow ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-muted/60",
        )}
      >
        <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <div>{summary}</div>
          {rangeDays !== null && (
            <div className="text-muted-foreground">
              Período da campanha:{" "}
              <strong className="text-foreground">
                {rangeDays} dia{rangeDays === 1 ? "" : "s"}
              </strong>
            </div>
          )}
          {rangeDays === null && (
            <div className="text-amber-600 dark:text-amber-400">
              ⚠ Defina início e fim na aba Campanha para agendar.
            </div>
          )}
          {overflow && (
            <div>⚠ Muitas peças pro período, reduza a quantidade ou estenda a campanha.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TagList({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [txt, setTxt] = useState("");
  const add = () => {
    if (!txt.trim()) return;
    onChange([...values, txt.trim()]);
    setTxt("");
  };
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground mb-1">{label}</div>
      <div className="flex flex-wrap gap-1 mb-1">
        {values.map((v, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[11px]"
          >
            {v}
            <button
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 px-2 py-1 rounded-md border border-border bg-background text-xs"
        />
        <button
          onClick={add}
          className="px-2 py-1 rounded-md border border-border text-xs hover:bg-muted"
        >
          +
        </button>
      </div>
    </div>
  );
}

function KpiPicker({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const selected = values
    .map((k) => SOCIAL_KPI_CATALOG.find((c) => c.key === k))
    .filter(Boolean) as typeof SOCIAL_KPI_CATALOG;
  const toggle = (key: string) => {
    onChange(values.includes(key) ? values.filter((v) => v !== key) : [...values, key]);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {selected.length === 0 && (
          <span className="text-[11px] text-muted-foreground italic">Nenhum KPI selecionado</span>
        )}
        {selected.map((k) => (
          <span
            key={k.key}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px]"
          >
            {k.label}
            <button onClick={() => toggle(k.key)} className="hover:text-destructive">
              ×
            </button>
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="px-2 py-1 rounded-md border border-border text-xs hover:bg-muted"
      >
        {open ? "Fechar catálogo" : "+ Selecionar KPIs do catálogo"}
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-border bg-background max-h-56 overflow-y-auto p-2 space-y-2">
          {SOCIAL_KPI_GROUPS.map((group) => {
            const items = SOCIAL_KPI_CATALOG.filter((k) => k.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {group}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {items.map((k) => {
                    const on = values.includes(k.key);
                    return (
                      <button
                        key={k.key}
                        type="button"
                        onClick={() => toggle(k.key)}
                        className={cn(
                          "text-left text-[11px] px-2 py-1 rounded border",
                          on
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        {k.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ABA 3, POSTS (editor por peça: briefing, banco de ideias, mídia, textos)
// ═══════════════════════════════════════════════════════════════════════

function PostsTab({
  sets,
  campaignName,
  starts,
  ends,
  activeSetId,
  onSelectSet,
  onSyncPosts,
  onUpdatePost,
  onDuplicatePost,
  onRemovePost,
  onAddPost,
  onApplyCadence,
  workspaceId,
  onRefineSetPosts,
  onUpdateSet,
  onRenamePost,
}: {
  sets: PostSet[];
  campaignName: string;
  starts: string;
  ends: string;
  activeSetId: string | null;
  onSelectSet: (id: string) => void;
  onSyncPosts: (setId?: string) => void;
  onUpdatePost: (setId: string, postId: string, patch: Partial<PostItem>) => void;
  onDuplicatePost: (setId: string, postId: string) => void;
  onRemovePost: (setId: string, postId: string) => void;
  onAddPost: (setId: string, format: Format) => void;
  onApplyCadence: (setId: string, cadence: Cadence) => void;
  workspaceId: string | null;
  onRefineSetPosts?: (setId: string, provider?: string) => Promise<void>;
  onUpdateSet: (setId: string, patch: Partial<PostSet>) => void;
  onRenamePost: (setId: string, postId: string, newTitle: string) => void;
}) {
  const set = sets.find((s) => s.id === activeSetId) ?? sets[0] ?? null;
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [targetImageProvider, setTargetImageProvider] = useState<
    "ideogram" | "recraft" | "freepik" | "gemini"
  >("ideogram");
  const listProviderOptionsFn = useServerFn(listSocialProviderOptions);
  const providerOptionsQ = useQuery({
    queryKey: ["social-provider-options", workspaceId],
    queryFn: () => listProviderOptionsFn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
  useEffect(() => {
    const primary = providerOptionsQ.data?.primaryImage;
    if (primary) setTargetImageProvider(primary);
  }, [providerOptionsQ.data?.primaryImage]);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleRefine = async () => {
    if (!set || !onRefineSetPosts) return;
    setRefining(true);
    try {
      await onRefineSetPosts(set.id, targetImageProvider);
    } finally {
      setRefining(false);
    }
  };

  const posts = set?.posts ?? [];
  const activePost = posts.find((p) => p.id === activePostId) ?? posts[0] ?? null;
  const missing = set ? Math.max(0, plannedTotal(set) - posts.length) : 0;
  const allIdeas = useMemo(
    () => sets.flatMap((s) => s.ideas.map((i) => ({ ...i, setName: s.name, setId: s.id }))),
    [sets],
  );

  if (!set) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        Crie um conjunto primeiro.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Seletor de conjunto + cadência */}
      <section className="rounded-lg border border-border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Layers className="h-4 w-4 shrink-0 text-primary" />

          <select
            value={set.id}
            onChange={(e) => {
              onSelectSet(e.target.value);
              setActivePostId(null);
            }}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.posts?.length ?? 0} posts)
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 ml-auto">
            <Building2 className="w-3.5 h-3.5 text-primary" />
            <BrandSelector
              workspaceId={workspaceId}
              value={set.brandId}
              onChange={(id) => onUpdateSet(set.id, { brandId: id })}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border/60 pt-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Motor visual do conjunto
          </span>
          <select
            value={targetImageProvider}
            onChange={(e) => setTargetImageProvider(e.target.value as typeof targetImageProvider)}
            className="ml-auto h-8 rounded-md border border-border bg-background px-2 text-[11px]"
          >
            {(providerOptionsQ.data?.imageProviders ?? []).map((provider) => (
              <option key={provider} value={provider}>
                {provider === "gemini" ? "Nano Banana" : provider[0].toUpperCase() + provider.slice(1)}
              </option>
            ))}
          </select>
          {!providerOptionsQ.isLoading && !(providerOptionsQ.data?.imageProviders.length) && (
            <span className="text-[10px] text-amber-500">Conecte um motor de imagem.</span>
          )}
        </div>
      </section>

      {posts.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          Nenhum post neste conjunto ainda. Use o botão "Adicionar post" abaixo para criar.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
            {posts.map((p, idx) => {
              const Icon = FORMAT_ICON[p.format];
              const active = activePost?.id === p.id;
              const ready = !!(p.caption || p.imageUrl);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "rounded-md border p-2 transition-colors",
                    active ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                  )}
                >
                  {editingPostId === p.id ? (
                    <div className="flex items-center gap-1 mb-1">
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            onRenamePost(set.id, p.id, editTitle);
                            setEditingPostId(null);
                          } else if (e.key === "Escape") {
                            setEditingPostId(null);
                          }
                        }}
                        onBlur={() => {
                          onRenamePost(set.id, p.id, editTitle);
                          setEditingPostId(null);
                        }}
                        className="flex-1 rounded border border-primary px-1.5 py-0.5 text-[11px] bg-background outline-none"
                      />
                    </div>
                  ) : (
                    <button onClick={() => setActivePostId(p.id)} className="w-full text-left">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-semibold">
                            {p.title || `Post ${idx + 1}`}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {fmtDateLabel(p)}
                          </div>
                        </div>
                        {ready && <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />}
                      </div>
                    </button>
                  )}
                  <div className="mt-1 flex items-center gap-1">
                    <span className="rounded bg-muted px-1 py-0.5 text-[9px]">
                      {FORMAT_LABEL[p.format]}
                    </span>
                    {p.format === "carrossel" && p.slides ? (
                      <span className="rounded bg-muted px-1 py-0.5 text-[9px]">
                        {p.slides} imagens
                      </span>
                    ) : null}

                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditTitle(p.title || `Post ${idx + 1}`);
                          setEditingPostId(p.id);
                        }}
                        title="Renomear post"
                        className="rounded border border-border p-1 hover:bg-muted"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => onDuplicatePost(set.id, p.id)}
                        title="Duplicar post"
                        className="rounded border border-border p-1 hover:bg-muted"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => {
                          onRemovePost(set.id, p.id);
                          if (activePost?.id === p.id) setActivePostId(null);
                        }}
                        title="Excluir post"
                        className="rounded border border-border p-1 hover:bg-muted"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </aside>

          <div className="min-w-0">
            {!activePost ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                Selecione um post.
              </div>
            ) : (
              <PostEditor
                key={activePost.id}
                post={activePost}
                set={set}
                onPatch={(patch) => onUpdatePost(set.id, activePost.id, patch)}
                allIdeas={allIdeas}
                campaignName={campaignName}
                workspaceId={workspaceId}
                starts={starts}
                ends={ends}
              />
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          onClick={() => onAddPost(set.id, (set.formats?.[0]?.format ?? "feed") as Format)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-medium bg-background hover:bg-muted hover:border-primary/50 transition-all shadow-sm"
        >
          <Plus className="h-3 w-3 text-primary" /> Adicionar post
        </button>
        <button
          onClick={handleRefine}
          disabled={refining || !workspaceId}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500 text-white text-[11px] font-bold hover:bg-emerald-600 transition-colors shadow-sm disabled:opacity-50"
          title={`Aprimorar posts com IA (Usando ${targetImageProvider.toUpperCase()})`}
        >
          {refining ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          Aprimorar Posts do Conjunto
        </button>
      </div>
    </div>
  );
}

// ─── Editor de um post ───
function PostEditor({
  post,
  set,
  onPatch,
  allIdeas,
  campaignName,
  workspaceId,
  starts,
  ends,
}: {
  post: PostItem;
  set: PostSet;
  onPatch: (p: Partial<PostItem>) => void;
  allIdeas: Array<Idea & { setName: string; setId: string }>;
  campaignName: string;
  workspaceId: string | null;
  starts: string;
  ends: string;
}) {
  const qc = useQueryClient();
  const refineFn = useServerFn(refinePostBriefing);
  const [refining, setRefining] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [targetImageProvider, setTargetImageProvider] = useState<
    "ideogram" | "recraft" | "freepik" | "gemini"
  >("ideogram");
  const [targetTextProvider, setTargetTextProvider] = useState<"openai" | "gemini">("openai");
  const listProviderOptionsFn = useServerFn(listSocialProviderOptions);
  const listTargetsFn = useServerFn(listMetaTargets);
  const providerOptionsQ = useQuery({
    queryKey: ["social-provider-options", workspaceId],
    queryFn: () => listProviderOptionsFn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
  const postTargetsQ = useQuery({
    queryKey: ["social-post-meta-targets", workspaceId],
    queryFn: () => listTargetsFn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
  useEffect(() => {
    const primaryImage = providerOptionsQ.data?.primaryImage;
    const primaryText = providerOptionsQ.data?.primaryText;
    if (primaryImage) setTargetImageProvider(primaryImage);
    if (primaryText) setTargetTextProvider(primaryText);
  }, [providerOptionsQ.data?.primaryImage, providerOptionsQ.data?.primaryText]);
  const [promptBuilderOpen, setPromptBuilderOpen] = useState(false);
  const [generatingAutomatic, setGeneratingAutomatic] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);

  // Geração de arte (usada pelo botão "Gerar Imagem" e pelo fluxo de aprimoramento)
  // Geração de arte compartilhada com Novo Post e Estúdio.
  const runImageGeneration = async (prompt: string) => {
    if (!workspaceId) {
      toast.error("Workspace não carregado.");
      return;
    }
    if (!prompt.trim()) {
      toast.error("Descreva o briefing ou o prompt da arte primeiro.");
      return;
    }
    if (post.format === "reels") {
      toast.info("Para Reels, gere a legenda/roteiro e envie o vídeo. A geração de vídeo ainda não está habilitada.");
      return;
    }
    if (!providerOptionsQ.data?.imageProviders.includes(targetImageProvider)) {
      toast.error("Conecte um motor de imagem em Integrações antes de gerar a arte.");
      return;
    }
    setGeneratingImage(true);
    try {
      let urls: string[] = [];
      await streamImage(
        "/api/social/generate-image",
        {
          workspaceId,
          prompt,
          provider: targetImageProvider,
          aspectRatio: post.format === "story" || post.format === "reels" ? "9:16" : "4:5",
          brandId: set.brandId,
          carousel: post.format === "carrossel",
        },
        (frame) => {
          if (frame.final) urls = frame.dataUrls?.length ? frame.dataUrls : [frame.dataUrl];
        },
      );
      if (!urls.length) throw new Error("O gerador não retornou nenhuma arte.");
      if (post.format === "carrossel") {
        const wanted = Math.max(2, post.slides ?? 4);
        const slideUrls = urls.slice(0, wanted);
        const persisted = await Promise.all(
          slideUrls.map(async (url, index) => {
            const storagePath = await uploadDataUrlToBucket({
              workspaceId,
              dataUrl: url,
              folder: "campaign-posts",
            });
            const signed = await signedUrlFor(storagePath, 60 * 60 * 24 * 7);
            return {
              id: crypto.randomUUID(),
              imageUrl: signed ?? url,
              storagePath,
              title: `Slide ${index + 1}`,
            };
          }),
        );
        onPatch({
          imageUrl: persisted[0]?.imageUrl ?? null,
          imageStoragePath: persisted[0]?.storagePath ?? null,
          slides: persisted.length,
          slidesData: persisted,
        });
        toast.success(`${persisted.length} imagens do carrossel geradas e salvas.`);
      } else {
        const storagePath = await uploadDataUrlToBucket({
          workspaceId,
          dataUrl: urls[0],
          folder: "campaign-posts",
        });
        const signed = await signedUrlFor(storagePath, 60 * 60 * 24 * 7);
        onPatch({ imageUrl: signed ?? urls[0], imageStoragePath: storagePath });
        toast.success("Arte gerada e salva com sucesso.");
      }
    } catch (e) {
      toast.error(`Erro ao gerar a arte: ${(e as Error).message}`);
    } finally {
      setGeneratingImage(false);
    }
  };

  const { data: bundle } = useQuery({
    queryKey: ["settings-bundle"],
    queryFn: async () =>
      qc.ensureQueryData({ queryKey: ["settings-bundle"], queryFn: () => getSettingsBundle() }),
  });

  const handleGenerateAutomatic = async () => {
    if (!workspaceId) {
      toast.error("Workspace não carregado.");
      return;
    }
    setGeneratingAutomatic(true);
    try {
      const out = (await refineFn({
        data: {
          workspaceId,
          briefing: post.briefing ?? "",
          format: post.format,
          tone: set.tone ?? null,
          audience: set.audience ?? null,
          campaignName: campaignName || null,
          campaignObjective: null,
          targetImageProvider: null, // Apenas textos
          targetTextProvider,
          brandId: set.brandId,
        },
      })) as {
        suggestedTitle?: string;
        suggestedCaption?: string;
        suggestedHashtags?: string[];
        suggestedFirstComment?: string;
      };

      onPatch({
        title: out.suggestedTitle ?? post.title,
        caption: out.suggestedCaption ?? post.caption,
        hashtags: out.suggestedHashtags?.join(" ") ?? post.hashtags,
        firstComment: out.suggestedFirstComment ?? post.firstComment,
      });
      toast.success("Textos gerados com sucesso.");
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setGeneratingAutomatic(false);
    }
  };

  const handleRefine = async () => {
    if (!workspaceId) {
      toast.error("Workspace não carregado.");
      return;
    }
    if (!(post.briefing ?? "").trim()) {
      toast.error("Escreva o briefing do post primeiro.");
      return;
    }

    setRefining(true);
    try {
      const out = (await refineFn({
        data: {
          workspaceId,
          briefing: post.briefing ?? "",
          format: post.format,
          tone: set.tone ?? null,
          audience: set.audience ?? null,
          campaignName: campaignName || null,
          campaignObjective: null,
          targetImageProvider: targetImageProvider,
          targetTextProvider,
          brandId: set.brandId,
        },
      })) as {
        refinedBriefing?: string;
        imagePrompt?: string;
        suggestedTitle?: string;
        suggestedCaption?: string;
        suggestedHashtags?: string[];
        suggestedFirstComment?: string;
      };

      const patch: Partial<PostItem> = {
        briefing: out.refinedBriefing ?? post.briefing,
        imagePrompt: out.imagePrompt ?? post.imagePrompt,
        title: out.suggestedTitle ?? post.title,
        caption: out.suggestedCaption ?? post.caption,
        hashtags: out.suggestedHashtags?.join(" ") ?? post.hashtags,
        firstComment: out.suggestedFirstComment ?? post.firstComment,
      };

      onPatch(patch);
      toast.success(`Briefing e prompt aprimorados para ${targetImageProvider}. Revise e clique em Gerar Imagem quando quiser.`);
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setRefining(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!workspaceId) {
      toast.error("Workspace não carregado.");
      return;
    }
    setUploading(true);
    try {
      const path = await uploadFileToBucket({ workspaceId, file, folder: "campaign-posts" });
      const url = await signedUrlFor(path, 60 * 60 * 24 * 7);
      onPatch({ imageUrl: url, imageStoragePath: path });
      toast.success("Mídia anexada.");
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const Icon = FORMAT_ICON[post.format];
  const validPostChannels = channelsForSocialPostFormat(post.format);
  const selectedPostChannels = (post.placement ?? []).filter((channel) =>
    validPostChannels.includes(channel as SocialPostChannel),
  ) as Channel[];
  const postChannelTargets = post.channelTargets ?? {};
  const optionsForPostChannel = (channel: Channel): Array<{ ref: string; label: string }> => {
    if (channel.startsWith("ig")) {
      return (postTargetsQ.data?.instagram ?? []).map((account) => ({
        ref: account.instagram_id,
        label: `@${account.username}`,
      }));
    }
    if (channel.startsWith("fb")) {
      return (postTargetsQ.data?.pages ?? []).map((page) => ({ ref: page.page_id, label: page.name }));
    }
    return [];
  };
  const updatePostChannel = (channel: Channel, target: { ref: string; label: string } | null) => {
    const nextTargets = { ...postChannelTargets };
    let nextChannels = selectedPostChannels.filter((item) => item !== channel);
    if (target) {
      nextTargets[channel] = target;
      nextChannels = [...nextChannels, channel];
    } else {
      delete nextTargets[channel];
    }
    onPatch({ placement: nextChannels, channelTargets: nextTargets });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{post.title}</div>
            <div className="text-[10px] text-muted-foreground">
              {set.name} · {FORMAT_LABEL[post.format]} · {fmtDateLabel(post)}
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedPostChannels.map((c) => (
              <ChannelBadge key={c} channel={c} />
            ))}
          </div>
        </div>
      </div>

      {/* Agendamento e canais reais */}
      <section className="rounded-lg border border-border bg-card p-3 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <CalendarDays className="h-3.5 w-3.5 text-primary" /> Agendamento e canais
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Data e hora</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Data">
                <input
                  type="date"
                  min={starts || undefined}
                  max={ends || undefined}
                  value={post.date ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value && starts && ends && !campaignDateIsInsidePeriod(`${value}T12:00:00.000Z`, starts, ends)) {
                      toast.error(`Escolha uma data entre ${starts} e ${ends}.`);
                      return;
                    }
                    onPatch({ date: value || null });
                  }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Hora">
                <input
                  type="time"
                  value={post.time ?? ""}
                  onChange={(e) => onPatch({ time: e.target.value || null })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>
            {starts && ends && (
              <div className="text-[10px] text-muted-foreground">Período da campanha: {starts} → {ends}</div>
            )}
            {post.format === "carrossel" && (
              <Field label="Imagens do carrossel">
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={post.slides ?? 6}
                  onChange={(e) => onPatch({ slides: Math.max(2, Math.min(20, Number(e.target.value) || 2)) })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </Field>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Canal e conta deste post</div>
            <p className="text-[10px] text-muted-foreground">Escolha exatamente onde esta peça será publicada. A conta fica salva no próprio post.</p>
            <div className="space-y-2">
              {validPostChannels.map((channel) => {
                const current = postChannelTargets[channel];
                const options = optionsForPostChannel(channel as Channel);
                return (
                  <div key={channel} className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2 rounded-md border border-border p-2">
                    <ChannelBadge channel={channel as Channel} />
                    <select
                      value={current?.ref ?? ""}
                      onChange={(e) => {
                        const option = options.find((item) => item.ref === e.target.value) ?? null;
                        updatePostChannel(channel as Channel, option);
                      }}
                      className="h-8 min-w-0 rounded-md border border-border bg-background px-2 text-[11px]"
                    >
                      <option value="">Não publicar neste canal</option>
                      {options.map((option) => <option key={option.ref} value={option.ref}>{option.label}</option>)}
                    </select>
                  </div>
                );
              })}
              {!postTargetsQ.isLoading && validPostChannels.every((channel) => optionsForPostChannel(channel as Channel).length === 0) && (
                <div className="rounded-md border border-dashed border-border p-2 text-[10px] text-amber-500">Nenhuma conta compatível conectada. Conecte Instagram/Facebook em Integrações.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Banco de ideias */}
      <section className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Lightbulb className="h-3.5 w-3.5 text-primary" /> Banco de Ideias
          </div>
          <button
            type="button"
            onClick={() => setIdeasOpen((v) => !v)}
            className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
          >
            {ideasOpen ? "Fechar" : `Importar (${allIdeas.length})`}
          </button>
        </div>
        {ideasOpen &&
          (allIdeas.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">
              Nenhuma pauta cadastrada. Adicione ideias na aba Conjunto de Posts.
            </div>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {allIdeas.map((i) => (
                <button
                  key={i.id}
                  onClick={() => {
                    onPatch({
                      fromIdeaId: i.id,
                      title: i.title,
                      briefing: [i.angle, i.copy].filter(Boolean).join("\n\n") || post.briefing,
                    });
                    setIdeasOpen(false);
                    toast.success(`Importado: ${i.title}`);
                  }}
                  className="w-full rounded border border-border p-2 text-left hover:bg-muted"
                >
                  <div className="truncate text-[11px] font-semibold">{i.title}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {i.setName} · {FORMAT_LABEL[i.format]}
                    {i.angle ? ` · ${i.angle}` : ""}
                  </div>
                </button>
              ))}
            </div>
          ))}
      </section>

      {/* Módulo de Arte Estratégica e Briefing */}
      <section className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-primary">
            <Sparkles className="h-4 w-4" /> Módulo de Arte Estratégica
            <button
              onClick={() => setPromptBuilderOpen(true)}
              className="ml-2 inline-flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/30 transition-colors"
            >
              <Wand2 className="h-3 w-3" /> Prompt Builder
            </button>
          </div>

          {targetImageProvider === "ideogram" && (
            <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold animate-pulse">
              IDEOGRAM V3 ATIVO
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/70 p-2">
          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Imagem
            <select
              value={targetImageProvider}
              onChange={(e) => setTargetImageProvider(e.target.value as typeof targetImageProvider)}
              className="h-8 rounded-md border border-border bg-background px-2 text-[11px] font-normal normal-case tracking-normal text-foreground"
            >
              {(providerOptionsQ.data?.imageProviders ?? []).map((provider) => (
                <option key={provider} value={provider}>{provider === "gemini" ? "Nano Banana" : provider[0].toUpperCase() + provider.slice(1)}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Texto
            <select
              value={targetTextProvider}
              onChange={(e) => setTargetTextProvider(e.target.value as "openai" | "gemini")}
              className="h-8 rounded-md border border-border bg-background px-2 text-[11px] font-normal normal-case tracking-normal text-foreground"
            >
              {(providerOptionsQ.data?.textProviders ?? []).map((provider) => (
                <option key={provider} value={provider}>{provider === "openai" ? "OpenAI" : "Gemini"}</option>
              ))}
            </select>
          </label>
          {!providerOptionsQ.isLoading && !(providerOptionsQ.data?.imageProviders.length) && <span className="text-[10px] text-amber-500">Sem motor de imagem conectado.</span>}
          {!providerOptionsQ.isLoading && !(providerOptionsQ.data?.textProviders.length) && <span className="text-[10px] text-amber-500">Sem OpenAI/Gemini conectado.</span>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Descrição / Briefing do Post
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleGenerateAutomatic}
                disabled={refining || generatingAutomatic}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-600 shadow-md transition-all active:scale-95 disabled:opacity-50"
                title="Gerar título e legenda automaticamente com base no Briefing e Marca"
              >
                {generatingAutomatic ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
                Gerar Textos (IA)
              </button>
              <button
                type="button"
                onClick={handleRefine}
                disabled={refining || !(post.briefing ?? "").trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {refining ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Aprimorar para {targetImageProvider.toUpperCase()}
              </button>
              {post.format === "reels" ? (
                <span className="rounded-md border border-dashed border-border px-2 py-1.5 text-[10px] text-muted-foreground">Reels: gere textos e envie o vídeo.</span>
              ) : (
                <button
                  type="button"
                  onClick={() => runImageGeneration((post.imagePrompt ?? "").trim() || (post.briefing ?? ""))}
                  disabled={refining || generatingImage || !providerOptionsQ.data?.imageProviders.includes(targetImageProvider) || !((post.imagePrompt ?? "").trim() || (post.briefing ?? "").trim())}
                  className="inline-flex items-center gap-1.5 rounded-md bg-fuchsia-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-fuchsia-700 shadow-md transition-all active:scale-95 disabled:opacity-50"
                  title="Gerar a arte com o prompt atual no motor selecionado"
                >
                  {generatingImage ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
                  Gerar Imagem
                </button>
              )}
            </div>
          </div>
          <div className="relative group">
            <textarea
              rows={4}
              value={post.briefing ?? ""}
              onChange={(e) => onPatch({ briefing: e.target.value })}
              placeholder="O que este post precisa dizer? A IA usará isso para gerar o prompt de imagem e a legenda."
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <div className="text-[10px] text-muted-foreground italic flex items-center gap-1.5 bg-black/5 p-1.5 rounded-md border border-border/40">
            <Target className="h-3.5 w-3.5 text-primary" />
            <span>
              Estratégia: {campaignName || "Nova Campanha"} &bull; {set.name} &bull; Foco em{" "}
              {targetImageProvider.toUpperCase()}
            </span>
          </div>
        </div>
      </section>

      {/* Mídia */}
      <section className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <ImageIcon className="h-3.5 w-3.5 text-primary" /> Mídia do post
        </div>
        {post.imageUrl || (post.slidesData && post.slidesData.some((s) => s.imageUrl)) ? (
          <div className="space-y-3">
            {post.format === "carrossel" && post.slidesData && post.slidesData.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {post.slidesData.map((slide, idx) => (
                  <div
                    key={slide.id}
                    className="relative aspect-square group rounded-md border border-border overflow-hidden bg-muted"
                  >
                    {slide.imageUrl ? (
                      <>
                        <img
                          src={slide.imageUrl}
                          alt={`Slide ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {slide.logoOverlayUrl && (
                          <div
                            className="absolute cursor-move select-none"
                            style={{
                              left: `${slide.logoPosition?.x ?? 50}%`,
                              top: `${slide.logoPosition?.y ?? 50}%`,
                              transform: `translate(-50%, -50%) scale(${slide.logoPosition?.scale ?? 1})`,
                              width: "20%",
                            }}
                            onMouseDown={(e) => {
                              const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                              if (!rect) return;
                              const move = (me: MouseEvent) => {
                                const x = ((me.clientX - rect.left) / rect.width) * 100;
                                const y = ((me.clientY - rect.top) / rect.height) * 100;
                                onPatch({
                                  slidesData: (post.slidesData || []).map((s, i) =>
                                    i === idx
                                      ? { ...s, logoPosition: { ...s.logoPosition!, x, y } }
                                      : s,
                                  ),
                                });
                              };
                              window.addEventListener("mousemove", move);
                              window.addEventListener(
                                "mouseup",
                                () => window.removeEventListener("mousemove", move),
                                { once: true },
                              );
                            }}
                          >
                            <img
                              src={slide.logoOverlayUrl}
                              alt="Logo"
                              className="w-full h-auto pointer-events-none"
                            />
                          </div>
                        )}
                        <a
                          href={slide.imageUrl}
                          download={`slide-${idx + 1}.png`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                          title="Baixar imagem"
                        >
                          <Download className="h-3 w-3" />
                        </a>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground italic">
                        Processando...
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 text-white text-[9px] truncate">
                      {slide.title || `Slide ${idx + 1}`}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="relative group inline-block">
                <img
                  src={post.imageUrl || ""}
                  alt=""
                  className="max-h-64 rounded-md border border-border"
                />
                {post.logoOverlayUrl && (
                  <div
                    className="absolute cursor-move select-none"
                    style={{
                      left: `${post.logoPosition?.x ?? 50}%`,
                      top: `${post.logoPosition?.y ?? 50}%`,
                      transform: `translate(-50%, -50%) scale(${post.logoPosition?.scale ?? 1})`,
                      width: "20%",
                    }}
                    onMouseDown={(e) => {
                      const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                      if (!rect) return;
                      const move = (me: MouseEvent) => {
                        const x = ((me.clientX - rect.left) / rect.width) * 100;
                        const y = ((me.clientY - rect.top) / rect.height) * 100;
                        onPatch({ logoPosition: { ...post.logoPosition!, x, y } });
                      };
                      window.addEventListener("mousemove", move);
                      window.addEventListener(
                        "mouseup",
                        () => window.removeEventListener("mousemove", move),
                        { once: true },
                      );
                    }}
                  >
                    <img
                      src={post.logoOverlayUrl}
                      alt="Logo"
                      className="w-full h-auto pointer-events-none"
                    />
                  </div>
                )}
                {post.imageUrl && (
                  <a
                    href={post.imageUrl}
                    download="post-image.png"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100 shadow-md"
                    title="Baixar imagem"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPatch({ imageUrl: null, slidesData: [], logoOverlayUrl: null })}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
              >
                <Trash2 className="h-3 w-3" /> Remover mídia
              </button>
              {(post.logoOverlayUrl ||
                (post.slidesData && post.slidesData.some((s) => s.logoOverlayUrl))) && (
                <button
                  onClick={() => {
                    if (post.format === "carrossel" && post.slidesData) {
                      onPatch({
                        slidesData: (post.slidesData || []).map((s) => ({
                          ...s,
                          logoOverlayUrl: null,
                        })),
                      });
                    } else {
                      onPatch({ logoOverlayUrl: null });
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted text-amber-600"
                >
                  <X className="h-3 w-3" /> Remover Logo
                </button>
              )}
              {post.format === "carrossel" && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  Carrossel com {post.slidesData?.filter((s) => s.imageUrl).length || 0}/
                  {post.slides || post.slidesData?.length || 0} imagens.
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full rounded-md border border-dashed border-border p-5 text-center text-[11px] hover:bg-muted hover:border-primary/50 transition-all disabled:opacity-40 group"
              >
                {uploading ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                ) : (
                  <>
                    <ImageIcon className="mx-auto mb-2 h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="font-semibold block text-foreground">Enviar mídia manual</span>
                    <span className="text-[10px] text-muted-foreground">
                      Imagens ou vídeos do seu dispositivo
                    </span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-2">
              <input
                type="file"
                accept="image/png"
                className="hidden"
                id={`logo-upload-${post.id}`}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f || !workspaceId) return;
                  try {
                    const path = await uploadFileToBucket({
                      workspaceId,
                      file: f,
                      folder: "logos",
                    });
                    const url = await signedUrlFor(path, 60 * 60 * 24 * 30);
                    if (post.format === "carrossel" && post.slidesData) {
                      onPatch({
                        slidesData: post.slidesData.map((s) => ({
                          ...s,
                          logoOverlayUrl: url,
                          logoPosition: { x: 85, y: 15, scale: 1 },
                        })),
                      });
                    } else {
                      onPatch({
                        logoOverlayUrl: url,
                        logoPosition: { x: 85, y: 15, scale: 1 },
                      });
                    }
                    toast.success("Logo adicionada com sucesso!");
                  } catch (err) {
                    toast.error("Erro ao subir logo.");
                  }
                }}
              />
              <button
                type="button"
                onClick={() => document.getElementById(`logo-upload-${post.id}`)?.click()}
                className="w-full rounded-md border border-dashed border-border p-5 text-center text-[11px] hover:bg-muted hover:border-primary/50 transition-all group"
              >
                <Upload className="mx-auto mb-2 h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="font-semibold block text-foreground">Adicionar Logo PNG</span>
                <span className="text-[10px] text-muted-foreground">
                  Sobrepor logo em todos os slides/peça
                </span>
              </button>
            </div>

            <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-2 opacity-10">
                <Zap className="h-12 w-12 text-primary rotate-12" />
              </div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] uppercase tracking-wider text-primary font-bold flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> {targetImageProvider.toUpperCase()} AI
                </div>
                <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold">
                  OPTIMIZED
                </span>
              </div>
              <div className="text-[11px] font-semibold text-foreground mb-1">
                Prompt da Arte Estratégica
              </div>
              <textarea
                rows={3}
                value={post.imagePrompt ?? ""}
                onChange={(e) => onPatch({ imagePrompt: e.target.value })}
                placeholder={`Clique em aprimorar para gerar o prompt perfeito para ${targetImageProvider}.`}
                className="w-full resize-none rounded-md border border-primary/20 bg-background/80 px-2 py-1.5 text-[11px] placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary/30 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() =>
                  runImageGeneration((post.imagePrompt ?? "").trim() || (post.briefing ?? ""))
                }
                disabled={
                  generatingImage ||
                  refining ||
                  !((post.imagePrompt ?? "").trim() || (post.briefing ?? "").trim())
                }
                className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 shadow-md transition-all active:scale-[0.99] disabled:opacity-50"
              >
                {generatingImage ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5" />
                )}
                {generatingImage
                  ? "Gerando arte..."
                  : `Gerar Imagem com ${targetImageProvider.toUpperCase()}`}
              </button>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[9px] text-muted-foreground italic">
                  A IA respeita o estilo visual da marca.
                </span>
                <div className="flex items-center gap-1">
                  {targetImageProvider === "ideogram" && (
                    <Palette className="h-3 w-3 text-primary" />
                  )}
                  <span className="text-[10px] font-bold text-primary">
                    {targetImageProvider.charAt(0).toUpperCase() + targetImageProvider.slice(1)}{" "}
                    Mode
                  </span>
                </div>
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.currentTarget.value = "";
              }}
            />
          </div>
        )}
      </section>

      {/* Textos */}
      <section className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <MessageSquare className="h-3.5 w-3.5 text-primary" /> Título, legenda e hashtags
        </div>
        <Field label="Título (interno / calendário)">
          <input
            value={post.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Legenda">
          <textarea
            rows={4}
            value={post.caption ?? ""}
            onChange={(e) => onPatch({ caption: e.target.value })}
            placeholder="Legenda final do post."
            className="mt-1 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Hashtags">
          <input
            value={post.hashtags ?? ""}
            onChange={(e) => onPatch({ hashtags: e.target.value })}
            placeholder="#marketing #vendas"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Primeiro comentário (opcional)">
          <textarea
            rows={2}
            value={post.firstComment ?? ""}
            onChange={(e) => onPatch({ firstComment: e.target.value })}
            placeholder="Reforço de CTA no primeiro comentário."
            className="mt-1 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </Field>
      </section>

      {promptBuilderOpen && (
        <PromptBuilder
          workspaceId={workspaceId || ""}
          initialPrompt={post.imagePrompt || post.briefing || ""}
          initialAspectRatio={
            post.format === "feed"
              ? "1:1"
              : post.format === "reels" || post.format === "story"
                ? "9:16"
                : "4:5"
          }
          mode={post.imageUrl ? "enhance" : "create"}
          referenceImageUrl={post.imageUrl}
          brandId={set.brandId}
          onClose={() => setPromptBuilderOpen(false)}
          onApply={({ prompt }) => {
            onPatch({ imagePrompt: prompt });
            setPromptBuilderOpen(false);
            toast.success("Prompt aprimorado. Revise e clique em Gerar Imagem quando quiser.");
          }}
        />
      )}
    </div>
  );
}

function SetIdeasEditor({
  set,
  onChange,
}: {
  set: PostSet;
  onChange: (patch: Partial<PostSet>) => void;
}) {
  const [title, setTitle] = useState("");
  const [angle, setAngle] = useState("");
  const [format, setFormat] = useState<Format>("feed");

  const add = () => {
    if (!title.trim()) return;
    onChange({
      ideas: [
        ...set.ideas,
        {
          id: crypto.randomUUID(),
          title: title.trim(),
          format,
          angle: angle || null,
          copy: null,
        },
      ],
    });
    setTitle("");
    setAngle("");
  };
  const removeIdea = (id: string) => onChange({ ideas: set.ideas.filter((i) => i.id !== id) });

  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-2">
      <div className="text-[11px] font-semibold flex items-center gap-1">
        <Users className="w-3 h-3 text-primary" /> {set.name}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Título da pauta"
          className="px-3 py-1.5 rounded-md border border-border bg-background text-xs"
        />
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as Format)}
          className="px-2 py-1.5 rounded-md border border-border bg-background text-xs"
        >
          {FORMAT_ORDER.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </select>
        <button
          onClick={add}
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90"
        >
          <Plus className="w-3 h-3" /> Adicionar
        </button>
      </div>
      <input
        value={angle}
        onChange={(e) => setAngle(e.target.value)}
        placeholder="Ângulo / gancho (opcional)"
        className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-xs"
      />
      {set.ideas.length > 0 && (
        <div className="space-y-1">
          {set.ideas.map((i, idx) => (
            <div
              key={i.id}
              className="flex items-center gap-2 rounded-md border border-border p-1.5 text-[11px]"
            >
              <span className="w-4 text-center text-muted-foreground">{idx + 1}</span>
              <span className="px-1 py-0.5 rounded bg-muted text-[9px] uppercase">
                {FORMAT_LABEL[i.format]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{i.title}</div>
                {i.angle && (
                  <div className="text-[9px] text-muted-foreground truncate">{i.angle}</div>
                )}
              </div>
              <button onClick={() => removeIdea(i.id)} className="p-1 rounded hover:bg-muted">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Vinculação de conta por canal ----------
function ChannelLinker({
  set,
  onChange,
  workspaceId,
}: {
  set: PostSet;
  onChange: (patch: Partial<PostSet>) => void;
  workspaceId: string | null;
}) {
  const listTargets = useServerFn(listMetaTargets);
  const [picking, setPicking] = useState<Channel | null>(null);

  const targetsQ = useQuery({
    queryKey: ["meta-targets", workspaceId],
    queryFn: () => listTargets({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const links = set.channelTargets ?? {};

  const optionsFor = (ch: Channel): Array<{ ref: string; label: string }> => {
    if (ch.startsWith("ig")) {
      return (targetsQ.data?.instagram ?? []).map((i) => ({
        ref: i.instagram_id,
        label: `@${i.username}`,
      }));
    }
    if (ch.startsWith("fb")) {
      return (targetsQ.data?.pages ?? []).map((p) => ({ ref: p.page_id, label: p.name }));
    }
    return [];
  };

  const setLink = (ch: Channel, opt: { ref: string; label: string } | null) => {
    const nextLinks = { ...links };
    if (opt) nextLinks[ch] = opt;
    else delete nextLinks[ch];
    onChange({
      channelTargets: nextLinks,
      channels: opt
        ? set.channels.includes(ch)
          ? set.channels
          : [...set.channels, ch]
        : set.channels.filter((x) => x !== ch),
    });
    setPicking(null);
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Radio className="w-4 h-4 text-primary" /> Canais deste conjunto
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">
        Escolha o canal e vincule <strong>qual conta conectada</strong> vai publicar. Sem conta
        vinculada, o canal não é ativado.
      </p>

      <div className="space-y-1.5">
        {CHANNEL_ORDER.map((ch) => {
          const Icon = ch.startsWith("ig") ? Instagram : ch.startsWith("fb") ? Facebook : AtSign;
          const link = links[ch];
          const on = set.channels.includes(ch) && !!link;
          const opts = optionsFor(ch);
          const supported = ch.startsWith("ig") || ch.startsWith("fb");
          const isPicking = picking === ch;

          return (
            <div
              key={ch}
              className={cn(
                "rounded-md border px-2.5 py-2 transition-colors",
                on ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      on ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="truncate font-medium">{CHANNEL_LABEL[ch]}</span>
                  {link && (
                    <span className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                      {link.label}
                    </span>
                  )}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {!supported ? (
                    <span className="text-[10px] text-muted-foreground">Conecte a integração</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setPicking(isPicking ? null : ch)}
                        className="rounded-md border border-border px-2 py-1 text-[10px] hover:bg-muted"
                      >
                        {link ? "Trocar conta" : "Vincular conta"}
                      </button>
                      {link && (
                        <button
                          type="button"
                          onClick={() => setLink(ch, null)}
                          className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted"
                          title="Desvincular canal"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                      {on && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                    </>
                  )}
                </div>
              </div>

              {isPicking && supported && (
                <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                  {targetsQ.isLoading ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Carregando contas conectadas...
                    </div>
                  ) : opts.length === 0 ? (
                    <div className="text-[10px] text-amber-500">
                      Nenhuma conta {ch.startsWith("ig") ? "Instagram" : "Facebook"} conectada.
                      Conecte em Integrações.
                    </div>
                  ) : (
                    opts.map((o) => (
                      <button
                        key={o.ref}
                        type="button"
                        onClick={() => setLink(ch, o)}
                        className={cn(
                          "flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-[11px] hover:bg-muted",
                          link?.ref === o.ref ? "border-primary text-primary" : "border-border",
                        )}
                      >
                        <span className="truncate">{o.label}</span>
                        {link?.ref === o.ref && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
