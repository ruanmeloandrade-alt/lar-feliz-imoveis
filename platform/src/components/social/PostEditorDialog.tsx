// Editor de post existente: edita texto, agendamento, gerencia carrossel
// (adicionar/remover/reordenar/enviar do PC ou gerar com IA), reagendar e excluir.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import {
  X, Loader2, Trash2, Upload, Sparkles, CalendarClock, Type, Hash,
  ArrowLeft, ArrowRight, ImageIcon, Video, Save, AlertTriangle,
  ExternalLink, Download, Palette, RefreshCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsSuperAdmin } from "@/hooks/use-roles";
import { AdminOnlyTag } from "@/components/AdminOnlyDot";
import { supabase } from "@/integrations/supabase/client";
import {
  updateSocialPost, deleteSocialPost, syncSocialPostAssets, publishSocialPostNow,
} from "@/lib/social.functions";
import { retrySocialPostNow } from "@/lib/social-publishing.functions";
import {
  operationalStatusLabel,
  resolveOperationalStatus,
} from "@/lib/social-scheduler.core";
import { openOrCreateCanvaDesign, importCanvaDesignToPost, listCanvaBrandTemplates } from "@/lib/canva.functions";
import {
  signedUrlFor, streamImage, uploadDataUrlToBucket, uploadFileToBucket,
} from "@/lib/social-stream";
import type { SocialAssetRow, SocialPostRow } from "./useSocialPosts";
import { toast } from "sonner";

type EditableAsset = {
  id?: string;              // undefined = novo
  storagePath?: string;     // já uploadado
  previewUrl: string;       // signed url ou objectURL/dataURL
  kind: "image" | "video";
  aspect?: string | null;
  aiGenerated: boolean;
  pendingFile?: File;       // upload local pendente
  pendingDataUrl?: string;  // dataURL de IA pendente
};

function pad(n: number) { return String(n).padStart(2, "0"); }
function isoToLocalInput(iso: string | null, tz: string): string {
  if (!iso) return "";
  return formatInTimeZone(new Date(iso), tz, "yyyy-MM-dd'T'HH:mm");
}
function nowLocalInput(tz: string): string {
  const now = new Date(Date.now() + 60 * 60 * 1000);
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${pad(Number(parts.hour) % 24)}:${parts.minute}`;
}

export function PostEditorDialog({
  open, onClose, workspaceId, post, initialAssets, provider,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
  post: SocialPostRow | null;
  initialAssets: SocialAssetRow[];
  provider: "gemini" | "ideogram" | "recraft" | "freepik";
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateSocialPost);
  const deleteFn = useServerFn(deleteSocialPost);
  const syncAssetsFn = useServerFn(syncSocialPostAssets);
  const publishFn = useServerFn(publishSocialPostNow);
  const retryFn = useServerFn(retrySocialPostNow);
  const openCanvaFn = useServerFn(openOrCreateCanvaDesign);
  const importCanvaFn = useServerFn(importCanvaDesignToPost);
  const listTemplatesFn = useServerFn(listCanvaBrandTemplates);

  const { isSuperAdmin } = useIsSuperAdmin();
  const [tz, setTz] = useState<string>("America/Sao_Paulo");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [cta, setCta] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [assets, setAssets] = useState<EditableAsset[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [canvaTemplateId, setCanvaTemplateId] = useState("");
  const [canvaDesignId, setCanvaDesignId] = useState<string | null>(null);
  const [openingCanva, setOpeningCanva] = useState(false);
  const [importingCanva, setImportingCanva] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const readonly = post?.status === "published";
  const operationalStatus = resolveOperationalStatus({
    status: post?.status ?? "scheduled",
    nextAttemptAt: post?.next_publish_attempt_at,
  });
  const operationalLabel = operationalStatusLabel(operationalStatus);

  const templateQuery = useQuery({
    queryKey: ["canva-brand-templates"],
    enabled: open && !readonly,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => listTemplatesFn({ data: { query: "" } }),
  });

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase.from("profiles")
        .select("timezone").eq("id", u.user.id).maybeSingle();
      const zone = (p as { timezone?: string } | null)?.timezone || "America/Sao_Paulo";
      setTz(zone);
    })();
  }, []);

  // Popula ao abrir
  useEffect(() => {
    if (!open || !post) return;
    setTitle(post.title ?? "");
    setCaption(post.copy ?? "");
    setHashtags((post.hashtags ?? []).join(" "));
    setCta(post.cta ?? "");
    setScheduleAt(post.scheduled_at ? isoToLocalInput(post.scheduled_at, tz) : nowLocalInput(tz));
    setGenPrompt(post.briefing ?? "");
    setCanvaTemplateId("");
    setCanvaDesignId(post.canva_design_id ?? null);
    // resolve URLs assinadas dos assets atuais
    (async () => {
      const sorted = [...initialAssets].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const withUrls = await Promise.all(sorted.map(async (a) => ({
        id: a.id, storagePath: a.storage_path, kind: a.kind, aspect: a.aspect,
        aiGenerated: a.ai_generated,
        previewUrl: (await signedUrlFor(a.storage_path, 3600)) ?? "",
      } as EditableAsset)));
      setAssets(withUrls);
    })();
  }, [open, post, tz, initialAssets]);

  useEffect(() => {
    if (open) return;
    // cleanup previews locais
    assets.forEach(a => { if (a.pendingFile && a.previewUrl.startsWith("blob:")) URL.revokeObjectURL(a.previewUrl); });
  }, [open, assets]);

  if (!open || !post || !workspaceId) return null;

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).slice(0, 10 - assets.length);
    setAssets(prev => [
      ...prev,
      ...list.map<EditableAsset>((f) => ({
        pendingFile: f,
        previewUrl: URL.createObjectURL(f),
        kind: f.type.startsWith("video/") ? "video" : "image",
        aiGenerated: false,
      })),
    ]);
  };

  const removeAsset = (idx: number) => {
    setAssets(prev => {
      const copy = [...prev];
      const [rm] = copy.splice(idx, 1);
      if (rm.pendingFile && rm.previewUrl.startsWith("blob:")) URL.revokeObjectURL(rm.previewUrl);
      return copy;
    });
  };

  const move = (idx: number, dir: -1 | 1) => {
    setAssets(prev => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  };

  const handleGenerate = async () => {
    if (!genPrompt.trim() || !workspaceId) return;
    setGenerating(true);
    let lastUrl = "";
    let final = false;
    try {
      await streamImage("/api/social/generate-image",
        { workspaceId, prompt: genPrompt.trim(), provider },
        ({ dataUrl, final: f }) => { lastUrl = dataUrl; final = f; });
      if (!lastUrl || !final) throw new Error("Geração incompleta.");
      setAssets(prev => [
        ...prev,
        { pendingDataUrl: lastUrl, previewUrl: lastUrl, kind: "image", aiGenerated: true },
      ]);
      toast.success("Imagem gerada. Não esqueça de salvar.");
    } catch (e) {
      toast.error(`Falha na geração: ${(e as Error).message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenCanva = async (useTemplate: boolean) => {
    if (!workspaceId || !post) return;
    if (useTemplate && !canvaTemplateId.trim()) {
      toast.error("Informe o ID do Brand Template para fazer autofill.");
      return;
    }
    setOpeningCanva(true);
    try {
      const res = await openCanvaFn({
        data: {
          workspaceId,
          postId: post.id,
          templateId: useTemplate ? canvaTemplateId.trim() : null,
        },
      });
      setCanvaDesignId(res.designId);
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      if (res.editUrl) window.open(res.editUrl, "_blank", "noopener,noreferrer");
      toast.success(useTemplate ? "Autofill criado no Canva." : "Design aberto no Canva.");
    } catch (e) {
      toast.error(`Canva: ${(e as Error).message}`);
    } finally {
      setOpeningCanva(false);
    }
  };

  const handleImportCanva = async () => {
    if (!workspaceId || !post) return;
    setImportingCanva(true);
    try {
      const result = await importCanvaFn({ data: { workspaceId, postId: post.id, designId: canvaDesignId } });
      if (result.storagePath) {
        const previewUrl = (await signedUrlFor(result.storagePath, 3600)) ?? "";
        setAssets(prev => [
          ...prev,
          {
            id: result.asset?.id,
            storagePath: result.storagePath,
            previewUrl,
            kind: "image",
            aspect: result.asset?.aspect ?? null,
            aiGenerated: false,
          },
        ]);
      }
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success("Arte final importada do Canva para o post.");
    } catch (e) {
      toast.error(`Importação Canva: ${(e as Error).message}`);
    } finally {
      setImportingCanva(false);
    }
  };

  const uploadPendings = async (): Promise<EditableAsset[]> => {
    const out: EditableAsset[] = [];
    for (const a of assets) {
      if (a.storagePath) { out.push(a); continue; }
      if (a.pendingFile) {
        const path = await uploadFileToBucket({ workspaceId, file: a.pendingFile, folder: "posts" });
        out.push({ ...a, storagePath: path, pendingFile: undefined });
      } else if (a.pendingDataUrl) {
        const path = await uploadDataUrlToBucket({ workspaceId, dataUrl: a.pendingDataUrl });
        out.push({ ...a, storagePath: path, pendingDataUrl: undefined });
      }
    }
    return out;
  };

  const persistAll = async (opts?: { publishNow?: boolean; newStatus?: SocialPostRow["status"] }) => {
    setSaving(true);
    try {
      // 1) uploads
      const uploaded = await uploadPendings();
      // 2) sync assets
      await syncAssetsFn({
        data: {
          postId: post.id, workspaceId,
          assets: uploaded.map(a => ({
            id: a.id, storagePath: a.storagePath!, kind: a.kind,
            aspect: a.aspect ?? null, aiGenerated: a.aiGenerated,
          })),
        },
      });
      // 3) update post fields
      const hashArr = hashtags.split(/\s+/).map(s => s.trim()).filter(t => t.startsWith("#")).slice(0, 30);
      const scheduledDate = scheduleAt ? fromZonedTime(scheduleAt, tz) : null;
      if (scheduledDate && Number.isNaN(scheduledDate.getTime())) throw new Error("Data/hora inválida.");
      if (scheduledDate && opts?.newStatus !== "approved" && scheduledDate.getTime() < Date.now() - 60_000) {
        throw new Error("Para reagendar, escolha uma data/hora no futuro.");
      }
      const scheduledIso = scheduledDate ? scheduledDate.toISOString() : null;
      const nextStatus = opts?.newStatus ?? (scheduledIso ? "scheduled" : "draft");
      await updateFn({
        data: {
          postId: post.id, workspaceId,
          patch: {
            title: title || null,
            briefing: genPrompt || null,
            copy: caption || null,
            hashtags: hashArr,
            cta: cta || null,
            scheduledAt: scheduledIso,
            status: nextStatus,
          },
        },
      });
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      return true;
    } catch (e) {
      toast.error(`Erro ao salvar: ${(e as Error).message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const ok = await persistAll();
    if (ok) { toast.success("Alterações salvas."); onClose(); }
  };

  const handlePublishNow = async () => {
    setPublishing(true);
    try {
      const ok = await persistAll({ newStatus: "approved" });
      if (!ok) return;
      const r = await publishFn({ data: { postId: post.id, workspaceId } });
      if (r.ok) toast.success("Publicado.");
      else toast.error("Falha em algum canal. Veja os detalhes neste post.");
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      onClose();
    } catch (e) {
      toast.error(`Falha ao publicar: ${(e as Error).message}`);
    } finally { setPublishing(false); }
  };

  const handleRetryNow = async () => {
    setPublishing(true);
    try {
      const ok = await persistAll({ newStatus: "approved" });
      if (!ok) return;
      const result = await retryFn({ data: { postId: post.id, workspaceId } });
      if (result.ok) toast.success("Publicado.");
      else toast.error("Nova tentativa concluída com falha em algum canal.");
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      onClose();
    } catch (e) {
      toast.error(`Falha ao tentar novamente: ${(e as Error).message}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Excluir este post? Essa ação não pode ser desfeita.")) return;
    setDeleting(true);
    try {
      await deleteFn({ data: { postId: post.id, workspaceId } });
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success("Post excluído.");
      onClose();
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally { setDeleting(false); }
  };

  const canSave = useMemo(
    () => !saving && (caption.trim().length > 0 || assets.length > 0),
    [saving, caption, assets],
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-4xl my-8 rounded-xl border border-border bg-card overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">Editar post</div>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{operationalLabel}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">TZ: {tz}</span>
            {readonly && (
              <span className="text-[10px] flex items-center gap-1 text-amber-600">
                <AlertTriangle className="w-3 h-3" /> Já publicado, só é possível excluir.
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-7 h-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
          {/* Esquerda, carrossel/mídia */}
          <div className="p-5 border-b lg:border-b-0 lg:border-r border-border space-y-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center justify-between">
                <span>Mídia ({assets.length}/10)</span>
                <div className="flex items-center gap-1">
                  <input
                    ref={fileInputRef}
                    type="file" accept="image/*,video/*" multiple hidden
                    onChange={(e) => { onPickFiles(e.target.files); e.currentTarget.value = ""; }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={readonly || assets.length >= 10}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[10px] hover:bg-muted disabled:opacity-40"
                    title="Enviar do computador (fotos ou vídeos)"
                  >
                    <Upload className="w-3 h-3" /> Enviar
                  </button>
                </div>
              </label>

              {assets.length === 0 ? (
                <div className="aspect-[4/5] rounded-lg border border-dashed border-border/60 grid place-items-center text-muted-foreground text-xs">
                  Nenhuma mídia. Envie do computador ou gere com IA abaixo.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {assets.map((a, i) => (
                    <div key={i} className="relative aspect-square rounded-md overflow-hidden border border-border group">
                      {a.kind === "video" ? (
                        <video src={a.previewUrl} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={a.previewUrl} className="w-full h-full object-cover" alt="asset" />
                      )}
                      <div className="absolute top-0.5 left-0.5 flex gap-0.5">
                        <span className="text-[9px] px-1 rounded bg-background/80 text-foreground font-mono">{i + 1}</span>
                        {a.aiGenerated && <span className="text-[9px] px-1 rounded bg-primary/80 text-primary-foreground">IA</span>}
                        {a.kind === "video" && <Video className="w-3 h-3 text-white drop-shadow" />}
                      </div>
                      {!readonly && (
                        <div className="absolute inset-x-0 bottom-0 flex justify-between p-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/60 to-transparent">
                          <button onClick={() => move(i, -1)} className="p-1 rounded hover:bg-white/20 text-white disabled:opacity-30" disabled={i === 0}><ArrowLeft className="w-3 h-3" /></button>
                          <button onClick={() => removeAsset(i)} className="p-1 rounded hover:bg-red-500/70 text-white"><Trash2 className="w-3 h-3" /></button>
                          <button onClick={() => move(i, 1)} className="p-1 rounded hover:bg-white/20 text-white disabled:opacity-30" disabled={i === assets.length - 1}><ArrowRight className="w-3 h-3" /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!readonly && (
              <div className="rounded-md border border-border bg-muted/20 p-2.5 space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Palette className="w-3 h-3" /> Canva
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <input
                    value={canvaTemplateId}
                    onChange={(e) => setCanvaTemplateId(e.target.value)}
                    list="canva-template-options-editor"
                    placeholder="Brand Template ID opcional para autofill"
                    className="min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <datalist id="canva-template-options-editor">
                    {(templateQuery.data?.templates ?? []).map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </datalist>
                  <button
                    onClick={() => handleOpenCanva(true)}
                    disabled={openingCanva || !canvaTemplateId.trim()}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {openingCanva ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                    Autofill
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() => handleOpenCanva(false)}
                    disabled={openingCanva}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {openingCanva ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                    Abrir editor
                  </button>
                  <button
                    onClick={handleImportCanva}
                    disabled={importingCanva || !canvaDesignId}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {importingCanva ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    Trazer arte final
                  </button>
                </div>
              </div>
            )}

            {!readonly && isSuperAdmin && (
              <div className="rounded-md border border-fuchsia-400/40 bg-fuchsia-500/[0.04] p-2.5 space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  <Sparkles className="w-3 h-3" /> Gerar imagem com IA ({({gemini:"Nano Banana",ideogram:"Ideogram",recraft:"Recraft",freepik:"Freepik"} as Record<string,string>)[provider]})
                  <AdminOnlyTag />
                </label>
                <textarea
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  placeholder="Descreva a imagem que quer adicionar ao carrossel…"
                  className="w-full min-h-[60px] rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleGenerate}
                  disabled={!genPrompt.trim() || generating || assets.length >= 10}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {generating ? <><Loader2 className="w-3 h-3 animate-spin" /> Gerando…</>
                              : <><ImageIcon className="w-3 h-3" /> Adicionar imagem gerada</>}
                </button>
              </div>
            )}
          </div>

          {/* Direita, texto + agenda */}
          <div className="p-5 space-y-4">
            <div className={cn(
              "rounded-md border p-3 text-xs space-y-1.5",
              operationalStatus === "failed" ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/20",
            )}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">Publicação</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{operationalLabel}</span>
              </div>
              <div className="text-muted-foreground">
                Tentativas: <span className="text-foreground font-medium">{post.publish_attempts ?? 0}/{post.max_publish_attempts ?? 4}</span>
              </div>
              {post.last_publish_attempt_at && (
                <div className="text-muted-foreground">
                  Última tentativa: <span className="text-foreground">{formatInTimeZone(new Date(post.last_publish_attempt_at), tz, "dd/MM/yyyy HH:mm")}</span>
                </div>
              )}
              {post.next_publish_attempt_at && (
                <div className="text-muted-foreground">
                  Próxima tentativa: <span className="text-foreground">{formatInTimeZone(new Date(post.next_publish_attempt_at), tz, "dd/MM/yyyy HH:mm")}</span>
                </div>
              )}
              {post.last_error && (
                <div className="rounded border border-destructive/20 bg-background/60 px-2 py-1.5 text-destructive break-words">
                  {post.last_error}
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Título interno</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={readonly}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1.5">
                <Type className="w-3 h-3" /> Legenda
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                disabled={readonly}
                className="w-full min-h-[120px] rounded-md border border-border bg-background px-3 py-2 text-xs resize-y focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
              <div className="text-[10px] text-muted-foreground text-right mt-1">{caption.length} caracteres</div>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1.5">
                <Hash className="w-3 h-3" /> Hashtags
              </label>
              <input
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                disabled={readonly}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">CTA</label>
              <input
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                disabled={readonly}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1.5">
                <CalendarClock className="w-3 h-3" /> Reagendar
              </label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                disabled={readonly}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
              <div className="text-[10px] text-muted-foreground mt-1">Fuso: {tz}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-muted/20">
          <button
            onClick={handleDelete}
            disabled={deleting || saving}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-destructive/40 text-destructive text-xs hover:bg-destructive/10 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Excluir agendamento
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-muted">Cancelar</button>
            {!readonly && (
              <>
                {post.status === "failed" ? (
                  <button
                    onClick={handleRetryNow}
                    disabled={publishing || saving || !canSave}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-destructive/40 text-destructive text-xs hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                    Publicar agora novamente
                  </button>
                ) : (
                  <button
                    onClick={handlePublishNow}
                    disabled={publishing || saving || !canSave}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs hover:bg-muted disabled:opacity-50"
                  >
                    {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Publicar agora
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Salvar alterações
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}