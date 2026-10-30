// Tela única, sem IA: escolhe mídia, canais, legenda, dia/hora e publica ou agenda.
// UI "Live composition": composição à esquerda + preview de phone à direita reagindo em tempo real.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { fromZonedTime } from "date-fns-tz";
import {
  X,
  Loader2,
  Image as ImageIcon,
  CalendarClock,
  Instagram,
  Facebook,
  CheckCircle2,
  Upload,
  Trash2,
  Heart,
  MessageCircle,
  Send,
  MoreHorizontal,
  Sparkles,
  Wand2,
  Palette,
  Zap,
  Play,
  Video,
  Target,
  Layers,
  Building2,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  createSocialPost,
  publishSocialPostNow,
  listMetaTargets,
} from "@/lib/social.functions";
import { uploadFileToBucket, streamImage } from "@/lib/social-stream";
import { listSocialProviderOptions } from "@/lib/social-provider-options.functions";
import { refinePostBriefing } from "@/lib/social-wave4.functions";
import { getBrandContext } from "@/lib/social-brand.functions";
import { PromptBuilder } from "@/components/social/PromptBuilder";
import { toast } from "sonner";

const CHANNELS = [
  { key: "ig_feed", net: "IG", label: "Instagram · Feed", aspect: "4:5" },
  { key: "ig_story", net: "IG", label: "Instagram · Story", aspect: "9:16" },
  { key: "ig_reels", net: "IG", label: "Instagram · Reels", aspect: "9:16" },
  { key: "fb_feed", net: "FB", label: "Facebook · Feed", aspect: "1:1" },
  { key: "fb_story", net: "FB", label: "Facebook · Story", aspect: "9:16" },
  { key: "fb_reels", net: "FB", label: "Facebook · Reels", aspect: "9:16" },
] as const;

type ChannelKey = (typeof CHANNELS)[number]["key"];

const CHANNEL_PRESETS: Array<{ label: string; keys: ChannelKey[] }> = [
  { label: "Feed (IG + FB)", keys: ["ig_feed", "fb_feed"] },
  { label: "Story (IG + FB)", keys: ["ig_story", "fb_story"] },
  { label: "Reels (IG + FB)", keys: ["ig_reels", "fb_reels"] },
  { label: "Tudo", keys: ["ig_feed", "ig_story", "ig_reels", "fb_feed", "fb_story", "fb_reels"] },
];

const CAPTION_MAX = 2200;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function nowLocalInput(tz: string, base?: Date | null) {
  const future = base ? new Date(base) : new Date(Date.now() + 60 * 60 * 1000);
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(future).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${pad(Number(parts.hour) % 24)}:${parts.minute}`;
}

export function PostCreatorDialog({
  open,
  onClose,
  workspaceId,
  initialScheduledAt,
  initialRequest,
  variant = "modal",
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
  provider?: "gemini" | "ideogram" | "recraft" | "freepik";
  initialRequest?: string | null;
  initialScheduledAt?: Date | null;
  variant?: "modal" | "page";
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createSocialPost);
  const publishNowFn = useServerFn(publishSocialPostNow);
  const listTargetsFn = useServerFn(listMetaTargets);
  const refinePostFn = useServerFn(refinePostBriefing);
  const getBrandFn = useServerFn(getBrandContext);
  const listProviderOptionsFn = useServerFn(listSocialProviderOptions);

  const [tz, setTz] = useState<string>("America/Sao_Paulo");
  const [targetImageProvider, setTargetImageProvider] = useState<
    "ideogram" | "recraft" | "freepik" | "gemini"
  >("ideogram");
  const [targetTextProvider, setTargetTextProvider] = useState<"openai" | "gemini">("openai");
  const providerOptionsQ = useQuery({
    queryKey: ["social-provider-options", workspaceId],
    queryFn: () => listProviderOptionsFn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId && open,
    staleTime: 60_000,
  });
  useEffect(() => {
    const primaryImage = providerOptionsQ.data?.primaryImage;
    const primaryText = providerOptionsQ.data?.primaryText;
    if (primaryImage) setTargetImageProvider(primaryImage);
    if (primaryText) setTargetTextProvider(primaryText);
  }, [providerOptionsQ.data?.primaryImage, providerOptionsQ.data?.primaryText]);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [refining, setRefining] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [promptBuilderOpen, setPromptBuilderOpen] = useState(false);
  const [pages, setPages] = useState<Array<{ page_id: string; name: string }>>([]);
  const [igAccounts, setIgAccounts] = useState<
    Array<{ instagram_id: string; username: string; page_id: string }>
  >([]);
  const [fbPageId, setFbPageId] = useState<string>("");
  const [igId, setIgId] = useState<string>("");

  const [feedUploads, setFeedUploads] = useState<
    { file: File; preview: string; kind: "image" | "video" }[]
  >([]);
  const [storyUploads, setStoryUploads] = useState<
    { file: File; preview: string; kind: "image" | "video" }[]
  >([]);
  const feedInputRef = useRef<HTMLInputElement | null>(null);
  const storyInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState<null | "feed" | "story">(null);

  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [generatingContent, setGeneratingContent] = useState(false);
  const [carouselMode, setCarouselMode] = useState(false);
  const [selected, setSelected] = useState<ChannelKey[]>(["ig_feed", "fb_feed"]);
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const [publishNow, setPublishNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewTab, setPreviewTab] = useState<"feed" | "story">("feed");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("id", u.user.id)
        .maybeSingle();
      const zone = (p as { timezone?: string } | null)?.timezone || "America/Sao_Paulo";
      setTz(zone);
      setScheduleAt(nowLocalInput(zone, initialScheduledAt ?? null));
    })();
  }, [initialScheduledAt]);

  useEffect(() => {
    if (!open || !workspaceId) return;
    (async () => {
      try {
        const r = await listTargetsFn({ data: { workspaceId } });
        setPages(r.pages);
        setIgAccounts(r.instagram);
        setFbPageId((prev) => prev || r.pages[0]?.page_id || "");
        setIgId((prev) => prev || r.instagram[0]?.instagram_id || "");
      } catch {
        /* silencia */
      }
    })();
  }, [open, workspaceId, listTargetsFn]);

  useEffect(() => {
    if (open) {
      if (initialRequest && initialRequest.trim()) setCaption(initialRequest);
    } else {
      setCaption("");
      setHashtags("");
      setCarouselMode(false);
      setSelected(["ig_feed", "fb_feed"]);
      setPublishNow(false);
      setSaving(false);
      feedUploads.forEach((u) => URL.revokeObjectURL(u.preview));
      storyUploads.forEach((u) => URL.revokeObjectURL(u.preview));
      setFeedUploads([]);
      setStoryUploads([]);
      setScheduleAt(nowLocalInput(tz, initialScheduledAt ?? null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tz, initialScheduledAt, initialRequest]);

  const needsFb = selected.some((k) => k.startsWith("fb_"));
  const needsIg = selected.some((k) => k.startsWith("ig_"));
  const needsFeed = selected.some((k) => k.endsWith("_feed"));
  const needsStory = selected.some((k) => k.endsWith("_story") || k.endsWith("_reels"));
  const totalUploads = feedUploads.length + storyUploads.length;
  const canPublish = useMemo(
    () =>
      !!workspaceId &&
      totalUploads > 0 &&
      caption.trim().length > 0 &&
      selected.length > 0 &&
      !saving &&
      (publishNow || scheduleAt.length > 0) &&
      (!needsFb || !!fbPageId) &&
      (!needsIg || !!igId) &&
      (!needsFeed || feedUploads.length > 0) &&
      (!needsStory || storyUploads.length > 0),
    [
      workspaceId,
      totalUploads,
      caption,
      selected,
      saving,
      needsFb,
      needsIg,
      fbPageId,
      igId,
      publishNow,
      scheduleAt,
      needsFeed,
      needsStory,
      feedUploads.length,
      storyUploads.length,
    ],
  );

  // Auto-switch preview tab based on selection
  useEffect(() => {
    if (needsFeed && !needsStory) setPreviewTab("feed");
    else if (needsStory && !needsFeed) setPreviewTab("story");
  }, [needsFeed, needsStory]);

  if (!open && variant === "modal") return null;

  const toggleChannel = (key: ChannelKey) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const acceptFiles = (variantKind: "feed" | "story", files: FileList | null) => {
    if (!files) return;
    const setter = variantKind === "feed" ? setFeedUploads : setStoryUploads;
    const current = variantKind === "feed" ? feedUploads : storyUploads;
    const list = Array.from(files).slice(0, 10 - current.length);
    setter((prev) => [
      ...prev,
      ...list.map((f) => ({
        file: f,
        preview: URL.createObjectURL(f),
        kind: (f.type.startsWith("video/") ? "video" : "image") as "image" | "video",
      })),
    ]);
  };
  const removeUpload = (variantKind: "feed" | "story", i: number) => {
    const setter = variantKind === "feed" ? setFeedUploads : setStoryUploads;
    setter((prev) => {
      URL.revokeObjectURL(prev[i].preview);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const handleGenerateContent = async () => {
    if (!workspaceId) {
      toast.error("Workspace não carregado.");
      return;
    }
    const brief = caption.trim() || imagePrompt.trim();
    if (!brief) {
      toast.error("Escreva uma ideia ou briefing primeiro.");
      return;
    }
    setGeneratingContent(true);
    try {
      const out = (await refinePostFn({
        data: {
          workspaceId,
          briefing: brief,
          format: selected.some((channel) => channel.includes("reels"))
            ? "reels"
            : selected.some((channel) => channel.includes("story"))
              ? "story"
              : "feed",
          tone: null,
          audience: null,
          campaignName: "Novo Post Individual",
          campaignObjective: null,
          targetImageProvider: null,
          targetTextProvider,
          brandId,
        },
      })) as {
        suggestedCaption?: string;
        suggestedHashtags?: string[];
      };
      if (out.suggestedCaption) setCaption(out.suggestedCaption);
      if (Array.isArray(out.suggestedHashtags)) setHashtags(out.suggestedHashtags.join(" "));
      toast.success(`Legenda e hashtags geradas com ${targetTextProvider === "openai" ? "OpenAI" : "Gemini"}.`);
    } catch (e) {
      toast.error(`Erro ao gerar texto: ${(e as Error).message}`);
    } finally {
      setGeneratingContent(false);
    }
  };

  const handleSave = async () => {
    if (!canPublish || !workspaceId) return;
    setSaving(true);
    try {
      const assetList: Array<{
        storagePath: string;
        kind: "image" | "video";
        aspect: string | null;
        aiGenerated: boolean;
      }> = [];
      for (const u of feedUploads) {
        const p = await uploadFileToBucket({ workspaceId, file: u.file, folder: "posts" });
        assetList.push({ storagePath: p, kind: u.kind, aspect: "feed", aiGenerated: false });
      }
      for (const u of storyUploads) {
        const p = await uploadFileToBucket({ workspaceId, file: u.file, folder: "posts" });
        assetList.push({ storagePath: p, kind: u.kind, aspect: "story", aiGenerated: false });
      }
      if (!assetList.length) throw new Error("Adicione ao menos uma imagem ou vídeo.");

      let scheduledIso: string | null = null;
      let scheduledLabel = "";
      if (!publishNow) {
        if (!scheduleAt) throw new Error("Escolha uma data/hora de agendamento.");
        const dt = fromZonedTime(scheduleAt, tz);
        if (Number.isNaN(dt.getTime())) throw new Error("Data/hora inválida.");
        if (dt.getTime() < Date.now() - 60_000)
          throw new Error("A data de agendamento precisa ser no futuro.");
        scheduledIso = dt.toISOString();
        scheduledLabel = new Intl.DateTimeFormat("pt-BR", {
          timeZone: tz,
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(dt);
      }

      const { postId } = await createFn({
        data: {
          workspaceId,
          title: caption.slice(0, 120) || null,
          briefing: null,
          copy: caption,
          hashtags: hashtags.split(/\s+/).filter((tag) => tag.startsWith("#")),
          cta: null,
          channels: selected,
          targets: selected.reduce<Record<string, string>>((acc, c) => {
            if (c.startsWith("fb_") && fbPageId) acc[c] = fbPageId;
            if (c.startsWith("ig_") && igId) acc[c] = igId;
            return acc;
          }, {}),
          scheduledAt: scheduledIso,
          status: publishNow ? "approved" : "scheduled",
          aiProvider: targetTextProvider,
          aiPrompt: imagePrompt || null,
          referenceUrls: [],
          assets: assetList,
        },
      });

      if (publishNow && postId) {
        try {
          const r = await publishNowFn({ data: { workspaceId, postId } });
          if (r.ok) toast.success("Publicado nas redes.");
          else toast.error("Falha ao publicar em um ou mais canais. Veja Aprovações.");
        } catch (e) {
          toast.error(`Falha ao publicar: ${(e as Error).message}`);
        }
      } else {
        toast.success(`Post agendado para ${scheduledLabel}.`);
      }

      qc.invalidateQueries({ queryKey: ["social-posts"] });
      onClose();
    } catch (e) {
      toast.error(`Erro ao salvar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const igUsername = igAccounts.find((a) => a.instagram_id === igId)?.username || "sua_conta";
  const fbPageName = pages.find((p) => p.page_id === fbPageId)?.name || "Sua Página";
  const captionPct = Math.min(100, (caption.length / CAPTION_MAX) * 100);

  const dropzone = (kind: "feed" | "story") => {
    const uploads = kind === "feed" ? feedUploads : storyUploads;
    const inputRef = kind === "feed" ? feedInputRef : storyInputRef;
    const label = kind === "feed" ? "Feed" : "Story / Reels";
    const hint = kind === "feed" ? "4:5 ou 1:1" : "9:16";
    const active = kind === "feed" ? needsFeed : needsStory;
    const aspectClass = kind === "feed" ? "aspect-[4/5]" : "aspect-[9/16]";
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-semibold text-foreground">{label}</span>
            <span className="text-[9px] font-mono text-muted-foreground shrink-0">{hint}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              ({uploads.length}/10)
            </span>
            {!active && (
              <span className="text-[9px] text-muted-foreground italic truncate">nenhum canal</span>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => {
              acceptFiles(kind, e.target.files);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploads.length >= 10}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-background text-[10px] hover:bg-muted disabled:opacity-40 transition-all hover:-translate-y-0.5 shrink-0"
          >
            <Upload className="w-3 h-3" /> Enviar
          </button>
        </div>

        {uploads.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(kind);
            }}
            onDragLeave={() => setDragOver((d) => (d === kind ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              acceptFiles(kind, e.dataTransfer.files);
            }}
            className={cn(
              "group w-full rounded-xl border-2 border-dashed bg-muted/30 grid place-items-center transition-all",
              aspectClass,
              kind === "story" && "max-h-72 mx-auto",
              dragOver === kind
                ? "border-primary bg-primary/10 scale-[1.01] ring-4 ring-primary/10"
                : "border-border hover:border-primary/50 hover:bg-primary/5",
            )}
          >
            <div className="flex flex-col items-center gap-2 px-2 text-center text-muted-foreground">
              <div className="w-10 h-10 rounded-full bg-background shadow-sm grid place-items-center text-primary transition-transform group-hover:scale-110 group-hover:-rotate-3">
                <Upload className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">
                Enviar mídia do <strong className="text-foreground">{label}</strong>
              </span>
              <span className="text-[10px] opacity-70">ou arraste um arquivo aqui · {hint}</span>
            </div>
          </button>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 animate-fade-in">
            {uploads.map((u, i) => (
              <div
                key={i}
                className={cn(
                  "relative group rounded-lg overflow-hidden border border-border shadow-sm transition-transform hover:scale-105",
                  kind === "feed" ? "aspect-square" : "aspect-[9/16]",
                )}
              >
                {u.kind === "video" ? (
                  <video src={u.preview} className="w-full h-full object-cover" muted />
                ) : (
                  <img
                    src={u.preview}
                    className="w-full h-full object-cover"
                    alt={`${label} ${i + 1}`}
                  />
                )}

                <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => removeUpload(kind, i)}
                    className="w-6 h-6 grid place-items-center bg-background/90 hover:bg-destructive hover:text-destructive-foreground rounded-md shadow-sm transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <a
                    href={u.preview}
                    download={`media-${i + 1}.${u.kind === "video" ? "mp4" : "png"}`}
                    className="w-6 h-6 grid place-items-center bg-background/90 hover:bg-primary hover:text-primary-foreground rounded-md shadow-sm transition-colors"
                    title="Baixar"
                  >
                    <Download className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
            {uploads.length < 10 && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "grid place-items-center border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all",
                  kind === "feed" ? "aspect-square" : "aspect-[9/16]",
                )}
              >
                <Upload className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // Choose media to preview: prioritize the current tab, fall back to the other
  const previewMedia =
    previewTab === "feed"
      ? (feedUploads[0] ?? storyUploads[0] ?? null)
      : (storyUploads[0] ?? feedUploads[0] ?? null);

  const shell = (
    <div
      className={cn(
        "w-full bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in flex flex-col",
        variant === "modal" && "max-w-5xl max-h-[92vh]",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarClock className="w-4 h-4 text-primary shrink-0" />
          <div className="text-sm font-semibold truncate">Agendar post</div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
        {/* Coluna esquerda: composição */}
        <div className="p-4 sm:p-5 lg:overflow-y-auto space-y-5 border-r border-border min-w-0">
          {/* Módulo de Arte Estratégica */}
          <section className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4 shadow-sm">
            {/* Cabeçalho do Módulo */}
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

            {/* Seletor de Marca */}
            <div className="rounded-md border border-primary/10 bg-background/50 p-2.5 space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                <Building2 className="w-3.5 h-3.5 text-primary" /> Marca Associada
              </div>
              <BrandSelector workspaceId={workspaceId} value={brandId} onChange={setBrandId} />
              <p className="text-[9px] text-muted-foreground italic">
                Vinculando a marca, a IA lerá seu logo, cores e visual style automaticamente.
              </p>
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
                  Arte AI / Mídia do Post
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!workspaceId) {
                        toast.error("Workspace não carregado.");
                        return;
                      }
                      if (!caption.trim()) {
                        toast.error("Escreva um briefing/legenda primeiro.");
                        return;
                      }
                      setRefining(true);
                      try {
                        const out = (await refinePostFn({
                          data: {
                            workspaceId,
                            briefing: caption,
                            format: selected.includes("ig_feed")
                              ? "feed"
                              : selected.includes("ig_story")
                                ? "story"
                                : "reels",
                            tone: null,
                            audience: null,
                            campaignName: "Novo Post Individual",
                            campaignObjective: null,
                            targetImageProvider,
                            targetTextProvider,
                            brandId,
                          },
                        })) as any;
                        if (out.imagePrompt) setImagePrompt(out.imagePrompt);
                        if (out.suggestedCaption) setCaption(out.suggestedCaption);
                        if (Array.isArray(out.suggestedHashtags))
                          setHashtags(out.suggestedHashtags.join(" "));
                        toast.success(`Refinado para ${targetImageProvider}.`);
                      } catch (e) {
                        toast.error(`Erro: ${(e as Error).message}`);
                      } finally {
                        setRefining(false);
                      }
                    }}
                    disabled={refining || !caption.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    {refining ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Criar Prompt com {targetImageProvider.toUpperCase()}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!workspaceId) return;
                      if (!imagePrompt.trim()) {
                        toast.error("Gere ou escreva um prompt primeiro.");
                        return;
                      }
                      if (selected.some((channel) => channel.endsWith("_reels"))) {
                        toast.info("Reels nesta etapa gera texto/legenda. Envie o vídeo para agendar; geração de vídeo ainda não está habilitada.");
                        return;
                      }
                      if (!providerOptionsQ.data?.imageProviders.includes(targetImageProvider)) {
                        toast.error("Conecte um motor de imagem em Integrações.");
                        return;
                      }
                      setGeneratingImage(true);
                      try {
                        let finalUrls: string[] = [];
                        const aspect = needsStory ? "9:16" : "4:5";
                        await streamImage(
                          "/api/social/generate-image",
                          {
                            workspaceId,
                            prompt: imagePrompt,
                            provider: targetImageProvider,
                            aspectRatio: aspect,
                            brandId,
                            carousel: carouselMode && !needsStory,
                          },
                          (f) => {
                            if (f.final) finalUrls = f.dataUrls?.length ? f.dataUrls : [f.dataUrl];
                          },
                        );
                        if (!finalUrls.length) throw new Error("O motor não retornou imagens.");
                        const generatedFiles = await Promise.all(
                          finalUrls.map(async (url, index) => {
                            const res = await fetch(url);
                            const blob = await res.blob();
                            return new File([blob], `ai-post-${index + 1}.png`, {
                              type: "image/png",
                            });
                          }),
                        );
                        const kind = needsStory ? "story" : "feed";
                        const dt = new DataTransfer();
                        generatedFiles.forEach((file) => dt.items.add(file));
                        acceptFiles(kind, dt.files);
                        toast.success(
                          carouselMode
                            ? `${generatedFiles.length} imagens do carrossel anexadas.`
                            : "Arte gerada e anexada.",
                        );
                      } catch (e) {
                        toast.error(`Erro: ${(e as Error).message}`);
                      } finally {
                        setGeneratingImage(false);
                      }
                    }}
                    disabled={generatingImage || !imagePrompt.trim() || !providerOptionsQ.data?.imageProviders.includes(targetImageProvider)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-zinc-800 shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    {generatingImage ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3" />
                    )}
                    Gerar Imagem
                  </button>
                </div>
              </div>

              <textarea
                rows={2}
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Prompt da imagem..."
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary/30 outline-none"
              />
              <label className="inline-flex items-center gap-2 text-[11px] font-medium">
                <input
                  type="checkbox"
                  checked={carouselMode}
                  onChange={(e) => setCarouselMode(e.target.checked)}
                  disabled={needsStory}
                />
                Gerar carrossel com 4 imagens
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {dropzone("feed")}
              {dropzone("story")}
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Mídias do <strong>Feed</strong> vão para canais Feed. Mídias de{" "}
              <strong>Story/Reels</strong> vão para Story e Reels.
            </p>
          </section>

          {/* Canais */}
          <section className="space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Onde publicar
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CHANNEL_PRESETS.map((p) => {
                const allOn = p.keys.every((k) => selected.includes(k));
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() =>
                      setSelected((cur) => {
                        const missing = p.keys.filter((k) => !cur.includes(k));
                        if (missing.length === 0) return cur.filter((k) => !p.keys.includes(k));
                        return Array.from(new Set([...cur, ...p.keys]));
                      })
                    }
                    className={cn(
                      "px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all hover:-translate-y-0.5",
                      allOn
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {allOn && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-1.5 animate-pulse" />
                    )}
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {CHANNELS.map((c) => {
                const on = selected.includes(c.key);
                const Icon = c.net === "IG" ? Instagram : Facebook;
                return (
                  <button
                    key={c.key}
                    onClick={() => toggleChannel(c.key)}
                    className={cn(
                      "group relative flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-[11px] text-left transition-all hover:-translate-y-0.5",
                      on
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-background hover:bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-4 h-4 shrink-0 transition-transform group-hover:scale-110",
                        on && "text-primary",
                      )}
                    />
                    <span className="flex-1 truncate font-medium">{c.label}</span>
                    <span className="text-[9px] font-mono opacity-70 shrink-0">{c.aspect}</span>
                    {on && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground grid place-items-center animate-scale-in">
                        <CheckCircle2 className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Contas */}
          {(needsIg || needsFb) && (
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
              {needsIg && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Instagram className="w-3 h-3" /> Conta Instagram
                  </label>
                  {igAccounts.length === 0 ? (
                    <div className="text-[11px] text-destructive border border-destructive/40 bg-destructive/5 rounded-md px-2 py-1.5">
                      Nenhuma conta IG conectada. Vá em Integrações → Meta.
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-background hover:border-primary/50 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 p-0.5 shrink-0">
                        <div className="w-full h-full rounded-full bg-background" />
                      </div>
                      <select
                        value={igId}
                        onChange={(e) => setIgId(e.target.value)}
                        className="flex-1 bg-transparent text-xs font-medium outline-none min-w-0"
                      >
                        {igAccounts.map((a) => (
                          <option key={a.instagram_id} value={a.instagram_id}>
                            @{a.username}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
              {needsFb && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Facebook className="w-3 h-3" /> Página do Facebook
                  </label>
                  {pages.length === 0 ? (
                    <div className="text-[11px] text-destructive border border-destructive/40 bg-destructive/5 rounded-md px-2 py-1.5">
                      Nenhuma Página FB conectada.
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-background hover:border-primary/50 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-[#1877F2] grid place-items-center shrink-0">
                        <Facebook className="w-4 h-4 text-white" />
                      </div>
                      <select
                        value={fbPageId}
                        onChange={(e) => setFbPageId(e.target.value)}
                        className="flex-1 bg-transparent text-xs font-medium outline-none min-w-0"
                      >
                        {pages.map((p) => (
                          <option key={p.page_id} value={p.page_id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Legenda */}
          <section className="space-y-2">
            <div className="flex justify-between items-end">
              <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Legenda
              </label>
              <button
                type="button"
                onClick={handleGenerateContent}
                disabled={generatingContent}
                className="inline-flex items-center gap-1 rounded-md border border-primary/30 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                {generatingContent ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}{" "}
                Gerar legenda e tags
              </button>
              <span
                className={cn(
                  "text-[10px] font-mono",
                  caption.length > CAPTION_MAX ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {caption.length} / {CAPTION_MAX}
              </span>
            </div>
            <div className="relative">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                placeholder="O que você quer contar hoje?"
                className="w-full p-3.5 pb-4 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
              />
              <div
                className="absolute bottom-0 left-0 h-1 bg-primary rounded-b-xl transition-[width] duration-300"
                style={{ width: `${captionPct}%` }}
              />
            </div>
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#marketing #vendas #conteudo"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
            />
          </section>

          {/* Agendamento */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Agendamento
              </label>
              <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={publishNow}
                  onChange={(e) => setPublishNow(e.target.checked)}
                  className="accent-primary"
                />
                <span className={publishNow ? "text-primary font-medium" : "text-muted-foreground"}>
                  Publicar já
                </span>
              </label>
            </div>
            <div
              className={cn(
                "transition-all overflow-hidden",
                publishNow ? "opacity-40 pointer-events-none" : "",
              )}
            >
              <div className="flex items-center gap-2 p-2 rounded-xl border border-border bg-background focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition-all">
                <CalendarClock className="w-4 h-4 text-muted-foreground shrink-0 ml-1" />
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  disabled={publishNow}
                  className="flex-1 bg-transparent text-xs outline-none min-w-0"
                />
                <span className="text-[10px] text-muted-foreground pr-1 hidden sm:inline">
                  {tz}
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Coluna direita: preview vivo */}
        <div className="relative bg-muted/30 p-4 flex flex-col items-center justify-start gap-3 lg:overflow-y-auto min-w-0">
          <div className="pointer-events-none absolute -z-0 w-64 h-64 bg-primary/10 blur-3xl rounded-full top-1/3 left-1/2 -translate-x-1/2" />

          <div className="flex gap-1 p-1 rounded-full bg-background border border-border shadow-sm">
            <button
              onClick={() => setPreviewTab("feed")}
              className={cn(
                "px-4 py-1.5 rounded-full text-[11px] font-bold transition-all",
                previewTab === "feed"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Feed
            </button>
            <button
              onClick={() => setPreviewTab("story")}
              className={cn(
                "px-4 py-1.5 rounded-full text-[11px] font-bold transition-all",
                previewTab === "story"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Story
            </button>
          </div>

          {previewTab === "feed" ? (
            <div
              key="feed-mock"
              className="relative z-10 w-[220px] rounded-[2rem] border-[8px] border-foreground/90 bg-background shadow-2xl overflow-hidden animate-scale-in transition-transform hover:scale-[1.01]"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-foreground/90 rounded-b-2xl z-20" />
              <div className="bg-background pt-6">
                <div className="flex items-center px-3 py-2 border-b border-border">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 p-0.5">
                    <div className="w-full h-full rounded-full bg-background" />
                  </div>
                  <span className="ml-2 text-[11px] font-bold truncate flex-1">{igUsername}</span>
                  <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="aspect-[4/5] bg-muted grid place-items-center overflow-hidden">
                  {previewMedia ? (
                    previewMedia.kind === "video" ? (
                      <video
                        src={previewMedia.preview}
                        className="w-full h-full object-cover"
                        muted
                        autoPlay
                        loop
                        playsInline
                      />
                    ) : (
                      <img
                        src={previewMedia.preview}
                        className="w-full h-full object-cover animate-fade-in"
                        alt="preview"
                      />
                    )
                  ) : (
                    <div className="text-muted-foreground text-center p-8">
                      <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-[10px] font-medium">O preview aparecerá aqui</p>
                    </div>
                  )}
                </div>
                <div className="px-3 py-2 space-y-1.5">
                  <div className="flex gap-3">
                    <Heart className="w-5 h-5" strokeWidth={1.5} />
                    <MessageCircle className="w-5 h-5" strokeWidth={1.5} />
                    <Send className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                  <p className="text-[10px] font-bold">128 curtidas</p>
                  <p className="text-[10px] leading-relaxed line-clamp-3">
                    <span className="font-bold mr-1">{igUsername}</span>
                    {caption ? (
                      <span>{caption}</span>
                    ) : (
                      <span className="text-muted-foreground italic">
                        Sua legenda aparecerá aqui enquanto você digita…
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div
              key="story-mock"
              className="relative z-10 w-[190px] rounded-[2rem] border-[8px] border-foreground/90 bg-background shadow-2xl overflow-hidden animate-scale-in transition-transform hover:scale-[1.01]"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-foreground/90 rounded-b-2xl z-30" />
              <div className="relative aspect-[9/16] bg-gradient-to-b from-purple-500 via-fuchsia-600 to-orange-500 overflow-hidden">
                {previewMedia &&
                  (previewMedia.kind === "video" ? (
                    <video
                      src={previewMedia.preview}
                      className="absolute inset-0 w-full h-full object-cover"
                      muted
                      autoPlay
                      loop
                      playsInline
                    />
                  ) : (
                    <img
                      src={previewMedia.preview}
                      className="absolute inset-0 w-full h-full object-cover animate-fade-in"
                      alt="preview"
                    />
                  ))}
                <div className="absolute top-4 left-3 right-3 flex gap-1 z-20">
                  <div className="h-0.5 flex-1 bg-white/90 rounded-full" />
                  <div className="h-0.5 flex-1 bg-white/40 rounded-full" />
                  <div className="h-0.5 flex-1 bg-white/40 rounded-full" />
                </div>
                <div className="absolute top-8 left-3 right-3 flex items-center gap-2 z-20">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 p-0.5 shrink-0">
                    <div className="w-full h-full rounded-full bg-background" />
                  </div>
                  <span className="text-[11px] font-bold text-white drop-shadow-md truncate">
                    {igUsername}
                  </span>
                  <span className="text-[10px] text-white/80 drop-shadow-md">agora</span>
                </div>
                {caption && (
                  <div className="absolute bottom-16 left-3 right-3 z-20">
                    <p className="text-[11px] text-white font-medium drop-shadow-lg line-clamp-4 bg-black/20 backdrop-blur-sm rounded-lg px-2 py-1.5">
                      {caption}
                    </p>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 z-20">
                  <div className="flex-1 h-9 rounded-full border border-white/60 bg-white/10 backdrop-blur px-3 flex items-center">
                    <span className="text-white/80 text-[10px]">Enviar mensagem…</span>
                  </div>
                  <Heart className="w-5 h-5 text-white drop-shadow" strokeWidth={1.5} />
                  <Send className="w-5 h-5 text-white drop-shadow" strokeWidth={1.5} />
                </div>
              </div>
            </div>
          )}

          <div className="relative z-10 bg-background/80 backdrop-blur-xl px-4 py-2 rounded-full border border-border shadow-sm flex flex-wrap items-center gap-x-4 gap-y-1 justify-center max-w-full">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  totalUploads > 0 ? "bg-emerald-500" : "bg-muted-foreground/40",
                )}
              />
              <span className="text-[10px] font-semibold text-muted-foreground">
                {totalUploads > 0 ? "Mídia pronta" : "Sem mídia"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  selected.length > 0 ? "bg-primary" : "bg-muted-foreground/40",
                )}
              />
              <span className="text-[10px] font-semibold text-muted-foreground">
                {selected.length} canal{selected.length === 1 ? "" : "is"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  caption.trim() ? "bg-emerald-500" : "bg-muted-foreground/40",
                )}
              />
              <span className="text-[10px] font-semibold text-muted-foreground">Legenda</span>
            </div>
          </div>

          <div className="relative z-10 w-full max-w-[320px] mt-auto pt-3 sticky bottom-0 bg-muted/30 backdrop-blur-sm">
            <button
              disabled={!canPublish}
              onClick={handleSave}
              className={cn(
                "w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-2xl font-bold text-sm shadow-lg transition-all",
                canPublish
                  ? "bg-primary text-primary-foreground hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {publishNow ? "Publicar agora" : "Agendar postagem"}
            </button>
            <button
              onClick={onClose}
              className="w-full mt-2 py-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
      {promptBuilderOpen && (
        <PromptBuilder
          workspaceId={workspaceId || ""}
          initialPrompt={imagePrompt || caption || ""}
          initialAspectRatio={needsStory ? "9:16" : "1:1"}
          mode={totalUploads > 0 ? "enhance" : "create"}
          referenceImageUrl={feedUploads[0]?.preview || storyUploads[0]?.preview || null}
          brandId={brandId}
          onClose={() => setPromptBuilderOpen(false)}
          onApply={({ prompt }) => {
            setImagePrompt(prompt);
            setPromptBuilderOpen(false);
          }}
        />
      )}
    </div>
  );

  if (variant === "page") return shell;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      {shell}
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

  const brand = (data as any)?.context;

  return (
    <div className="flex items-center gap-2">
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary/30"
      >
        <option value="">Nenhuma marca vinculada (IA genérica)</option>
        {brand && (
          <option value={(brand as any).id as string}>
            {brand.company_name || "Marca Principal"}
          </option>
        )}
      </select>
      {value && brand && (
        <div className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[10px] font-medium text-emerald-600 gap-1">
          <CheckCircle2 className="h-3 w-3" /> Lendo Contexto
        </div>
      )}
    </div>
  );
}
