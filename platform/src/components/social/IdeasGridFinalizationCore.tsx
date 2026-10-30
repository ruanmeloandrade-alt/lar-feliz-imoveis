import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Copy,
  FileText,
  Link2,
  Loader2,
  MessageCircle,
  Paperclip,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteSocialIdea, listSocialIdeas, setSocialIdeaImage } from "@/lib/social.functions";
import {
  generateSocialIdeasWithWorkspaceAi,
  listSocialImageProviders,
  refineSocialBriefing,
  setSocialIdeaSlideImages,
} from "@/lib/social-finalization.functions";
import {
  signedUrlFor,
  streamImage,
  uploadDataUrlToBucket,
  uploadFileToBucket,
} from "@/lib/social-stream";
import { generationStatusLabel, selectCreatedIdeas } from "@/lib/social-ideas-reliability";

type ImageProvider = "ideogram" | "recraft" | "freepik" | "gemini";
type IdeaReference = {
  id: string;
  label: string;
  kind: "link" | "image" | "pdf" | "file" | "brand_reference";
  value: string;
  analysis?: string | null;
};
type Slide = {
  n?: number;
  title?: string;
  text?: string;
  image_prompt?: string;
  image_path?: string;
  image_provider?: ImageProvider;
};
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
  image_provider?: ImageProvider;
  accent_color?: string;
  network?: string;
  slides?: Slide[];
};
type IdeaRow = {
  id: string;
  title: string;
  copy_suggestion: string | null;
  niche: string | null;
  metadata: IdeaMeta;
};
export type IdeaPayload = { title: string; caption: string; hashtags: string[]; pinned_comment: string };

const PROVIDER_LABEL: Record<ImageProvider, string> = {
  ideogram: "Ideogram",
  recraft: "Recraft",
  freepik: "Freepik",
  gemini: "Nano Banana",
};

function StoredImage({ path, className = "absolute inset-0 h-full w-full object-cover" }: { path: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    setError(null);
    void signedUrlFor(path)
      .then((next) => { if (alive) setUrl(next); })
      .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : "Falha ao abrir a imagem."); });
    return () => { alive = false; };
  }, [path]);
  if (error) return <div className="absolute inset-0 grid place-items-center bg-destructive/5 px-4 text-center text-[11px] text-destructive">{error}</div>;
  if (!url) return <div className="absolute inset-0 grid place-items-center bg-muted text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  return <img src={url} alt="" className={className} />;
}

async function generateAndStoreImage(args: {
  workspaceId: string;
  provider: ImageProvider;
  prompt: string;
  folder: string;
  aspectRatio?: string;
  brandId?: string | null;
}) {
  let finalDataUrl: string | null = null;
  await streamImage(
    "/api/social/generate-image",
    {
      workspaceId: args.workspaceId,
      prompt: args.prompt,
      provider: args.provider,
      aspectRatio: args.aspectRatio ?? "1:1",
      brandId: args.brandId ?? null,
    },
    (frame) => {
      if (frame.dataUrl) finalDataUrl = frame.dataUrl;
    },
  );
  if (!finalDataUrl) throw new Error("O motor consumiu a solicitação, mas não devolveu uma imagem utilizável.");
  return uploadDataUrlToBucket({ workspaceId: args.workspaceId, dataUrl: finalDataUrl, folder: args.folder });
}

export function IdeasGridFinalization({ workspaceId, onUse }: { workspaceId: string | null; onUse: (idea: IdeaPayload) => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSocialIdeas);
  const deleteFn = useServerFn(deleteSocialIdea);
  const setIdeaImageFn = useServerFn(setSocialIdeaImage);
  const providersFn = useServerFn(listSocialImageProviders);
  const refineBriefFn = useServerFn(refineSocialBriefing);
  const generateFn = useServerFn(generateSocialIdeasWithWorkspaceAi);
  const setSlideImagesFn = useServerFn(setSocialIdeaSlideImages);

  const [brief, setBrief] = useState("");
  const [count, setCount] = useState(4);
  const [network, setNetwork] = useState<"instagram" | "facebook" | "both" | "tiktok">("both");
  const [format, setFormat] = useState<"feed" | "story" | "carrossel" | "qualquer">("qualquer");
  const [carouselSlides, setCarouselSlides] = useState(6);
  const [working, setWorking] = useState(false);
  const [imagingIds, setImagingIds] = useState<string[]>([]);
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
  const [lastCreated, setLastCreated] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [brandHandle, setBrandHandle] = useState("sua_marca");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [brandOption, setBrandOption] = useState<{ id: string; company_name: string | null } | null>(null);
  const [references, setReferences] = useState<IdeaReference[]>([]);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [uploadingReference, setUploadingReference] = useState(false);
  const referenceFileRef = useRef<HTMLInputElement | null>(null);

  const ideasQ = useQuery({
    queryKey: ["social-ideas", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listFn({ data: { workspaceId: workspaceId! } }),
  });
  const providersQ = useQuery({
    queryKey: ["social-image-providers", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => providersFn({ data: { workspaceId: workspaceId! } }),
  });
  const primaryProvider = (providersQ.data?.primary ?? null) as ImageProvider | null;
  const ideas = ((ideasQ.data as { ideas?: IdeaRow[] } | undefined)?.ideas ?? []);
  const detail = ideas.find((idea) => idea.id === detailId) ?? null;

  useEffect(() => {
    if (!workspaceId) return;
    void supabase
      .from("social_brand_context")
      .select("id,company_name")
      .eq("workspace_id", workspaceId)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { id?: string; company_name?: string | null } | null;
        if (row?.id) {
          setBrandOption({ id: row.id, company_name: row.company_name ?? null });
          setBrandId(row.id);
        } else {
          setBrandOption(null);
          setBrandId(null);
        }
        const raw = row?.company_name ?? "";
        const handle = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24);
        if (handle) setBrandHandle(handle);
      });
  }, [workspaceId]);

  const requestReferences = references.map(({ label, kind, value, analysis }) => ({ label, kind, value, analysis: analysis ?? null }));

  const addReferenceUrl = () => {
    const value = referenceUrl.trim();
    if (!value) return;
    try { new URL(value); } catch { toast.error("Cole um link válido para usar como referência."); return; }
    setReferences((prev) => [...prev, { id: crypto.randomUUID(), label: value, kind: "link", value }]);
    setReferenceUrl("");
  };

  const uploadReference = async (file: File) => {
    if (!workspaceId) { toast.error("Workspace ainda não carregou."); return; }
    setUploadingReference(true);
    try {
      const path = await uploadFileToBucket({ workspaceId, file, folder: "idea-references" });
      const kind: IdeaReference["kind"] = file.type === "application/pdf" ? "pdf" : file.type.startsWith("image/") ? "image" : "file";
      setReferences((prev) => [...prev, { id: crypto.randomUUID(), label: file.name, kind, value: path }]);
      toast.success(`${file.name} adicionado como referência desta geração.`);
    } catch (error) {
      toast.error(`Não consegui anexar a referência: ${(error as Error).message}`);
    } finally {
      setUploadingReference(false);
    }
  };

  const copyText = async (label: string, text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copiado.`); }
    catch { toast.error("Não consegui copiar."); }
  };

  const generateImagesForIdea = async (idea: IdeaRow, provider: ImageProvider, selectedBrandId: string | null) => {
    if (!workspaceId) return;
    const meta = idea.metadata ?? {};
    const isCarousel = meta.format === "carrossel" && Array.isArray(meta.slides) && meta.slides.length > 0;
    setImagingIds((prev) => prev.includes(idea.id) ? prev : [...prev, idea.id]);
    setImageErrors((prev) => { const next = { ...prev }; delete next[idea.id]; return next; });
    try {
      if (isCarousel) {
        const generated: Array<{ index: number; imagePath: string; provider: ImageProvider }> = [];
        for (let index = 0; index < meta.slides!.length; index += 1) {
          const slide = meta.slides![index];
          if (slide.image_path) continue;
          const prompt = (slide.image_prompt || `${slide.title ?? ""}. ${slide.text ?? ""}`).trim();
          if (!prompt) throw new Error(`Slide ${index + 1} está sem prompt visual.`);
          const path = await generateAndStoreImage({
            workspaceId,
            provider,
            prompt,
            aspectRatio: "4:5",
            folder: `ideias/${idea.id}`,
            brandId: selectedBrandId,
          });
          generated.push({ index, imagePath: path, provider });
        }
        if (generated.length) await setSlideImagesFn({ data: { workspaceId, ideaId: idea.id, images: generated } });
      } else if (!meta.image_path) {
        const prompt = (meta.image_prompt || `${meta.hook || idea.title}. ${meta.caption || idea.copy_suggestion || ""}`).trim();
        if (!prompt) throw new Error("A ideia está sem prompt visual.");
        const path = await generateAndStoreImage({
          workspaceId,
          provider,
          prompt,
          aspectRatio: meta.format === "story" ? "9:16" : "4:5",
          folder: "ideias",
          brandId: selectedBrandId,
        });
        await setIdeaImageFn({ data: { workspaceId, ideaId: idea.id, imagePath: path, provider } });
      }
      await qc.invalidateQueries({ queryKey: ["social-ideas", workspaceId] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida na geração da imagem.";
      setImageErrors((prev) => ({ ...prev, [idea.id]: message }));
      toast.error(`Arte de “${idea.title}” falhou: ${message}`);
    } finally {
      setImagingIds((prev) => prev.filter((id) => id !== idea.id));
    }
  };

  const improveBrief = async () => {
    if (!workspaceId) { toast.error("Workspace ainda não carregou. Recarregue a página se isso persistir."); return; }
    if (!brief.trim()) { toast.error("Escreva o pedido antes de aprimorar."); return; }
    setWorking(true);
    try {
      const out = await refineBriefFn({ data: { workspaceId, briefing: brief, imageProvider: primaryProvider ?? "ideogram", brandId, references: requestReferences } });
      setBrief(out.refinedBriefing);
      toast.success("Pedido aprimorado. Revise e clique em Gerar ideias.");
    } catch (error) {
      toast.error(`Não consegui aprimorar: ${(error as Error).message}`);
    } finally {
      setWorking(false);
    }
  };

  const generateIdeas = async () => {
    if (!workspaceId) { toast.error("Workspace ainda não carregou. Recarregue a página se isso persistir."); return; }
    setWorking(true);
    setLastCreated(0);
    try {
      const selectedBrandId = brandId;
      const out = await generateFn({
        data: { workspaceId, count, brief, network, format, brandId: selectedBrandId, references: requestReferences, carouselSlides },
      });
      const ideaIds = Array.isArray(out.ideaIds) ? out.ideaIds.filter((id): id is string => typeof id === "string" && Boolean(id)) : [];
      if (!out.created || !ideaIds.length) throw new Error("A IA não confirmou os IDs das ideias criadas.");

      const fresh = (await listFn({ data: { workspaceId } })) as { ideas?: IdeaRow[] };
      qc.setQueryData(["social-ideas", workspaceId], fresh);
      const rows = selectCreatedIdeas(fresh.ideas ?? [], ideaIds);
      if (rows.length !== ideaIds.length) {
        await qc.invalidateQueries({ queryKey: ["social-ideas", workspaceId] });
        throw new Error(`Foram criadas ${ideaIds.length} ideias, mas só ${rows.length} retornaram na leitura imediata.`);
      }

      setLastCreated(rows.length);
      toast.success(`${rows.length} ideia${rows.length === 1 ? "" : "s"} criada${rows.length === 1 ? "" : "s"}. As artes serão geradas em segundo plano.`);
      setWorking(false);

      const provider = primaryProvider ?? (((await providersQ.refetch()).data?.primary as ImageProvider | null) ?? null);
      if (!provider) {
        toast.info("As ideias já foram criadas. Conecte um motor de imagem para gerar as artes.");
        return;
      }

      toast.info(`Gerando ${rows.length} arte${rows.length === 1 ? "" : "s"} com ${PROVIDER_LABEL[provider]} sem bloquear novas ideias…`);
      void (async () => {
        for (const row of rows) await generateImagesForIdea(row, provider, selectedBrandId);
      })();
    } catch (error) {
      toast.error(`Falha ao criar ideias: ${(error as Error).message}`);
    } finally {
      setWorking(false);
    }
  };

  const removeIdea = async (id: string) => {
    if (!workspaceId || !confirm("Excluir esta ideia?")) return;
    try {
      await deleteFn({ data: { workspaceId, id } });
      setImageErrors((prev) => { const next = { ...prev }; delete next[id]; return next; });
      await qc.invalidateQueries({ queryKey: ["social-ideas", workspaceId] });
    } catch (error) {
      toast.error(`Não consegui excluir: ${(error as Error).message}`);
    }
  };

  const status = generationStatusLabel(lastCreated, imagingIds.length);

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">Peça uma ideia</div>
          <div className="ml-auto text-[10px] text-muted-foreground">IA de texto do workspace · {primaryProvider ? `${PROVIDER_LABEL[primaryProvider]} para imagem` : "sem motor de imagem"}</div>
        </div>

        {!workspaceId && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Carregando o workspace. Se esta mensagem permanecer, recarregue a página antes de gerar.
          </div>
        )}

        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} placeholder="Explique do seu jeito o post que você precisa…" className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Marca de referência</span>
            <select value={brandId ?? ""} onChange={(e) => setBrandId(e.target.value || null)} className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs">
              <option value="">Sem referência de marca</option>
              {brandOption && <option value={brandOption.id}>{brandOption.company_name || "Marca principal"}</option>}
            </select>
          </label>
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Referências desta geração</span>
            <button type="button" onClick={() => setReferencesOpen((value) => !value)} className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-muted">
              <span className="inline-flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" />Adicionar referência</span>
              <span className="text-muted-foreground">{references.length} anexada{references.length === 1 ? "" : "s"}</span>
            </button>
          </div>
        </div>

        {referencesOpen && (
          <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/20 p-3">
            <div className="flex flex-wrap gap-2">
              <input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addReferenceUrl(); } }} placeholder="Link de post, anúncio, moodboard ou referência" className="min-w-[220px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs" />
              <button type="button" onClick={addReferenceUrl} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted"><Link2 className="h-3.5 w-3.5" />Link</button>
              <button type="button" onClick={() => referenceFileRef.current?.click()} disabled={uploadingReference} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-50">{uploadingReference ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Arquivo/PDF</button>
              <input ref={referenceFileRef} type="file" accept="image/*,application/pdf,.pdf" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadReference(file); e.currentTarget.value = ""; }} />
            </div>
            {references.length > 0 && <div className="flex flex-wrap gap-1.5">{references.map((ref) => <span key={ref.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-[10px]">{ref.kind === "link" ? <Link2 className="h-3 w-3" /> : ref.kind === "pdf" ? <FileText className="h-3 w-3" /> : <Paperclip className="h-3 w-3" />}<span className="max-w-52 truncate">{ref.label}</span><button type="button" onClick={() => setReferences((prev) => prev.filter((item) => item.id !== ref.id))} className="rounded-full p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button></span>)}</div>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select value={network} onChange={(e) => setNetwork(e.target.value as typeof network)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"><option value="both">Instagram + Facebook</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option></select>
          <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"><option value="qualquer">Qualquer formato</option><option value="feed">Feed</option><option value="story">Story</option><option value="carrossel">Carrossel</option></select>
          {format === "carrossel" && <select value={carouselSlides} onChange={(e) => setCarouselSlides(Number(e.target.value))} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">{[4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n} slides</option>)}</select>}
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">{[1,2,3,4,5,6,8].map((n) => <option key={n} value={n}>{n} ideia{n > 1 ? "s" : ""}</option>)}</select>
          <button type="button" onClick={improveBrief} disabled={working || !brief.trim()} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" />Aprimorar prompt</button>
          <button type="button" onClick={generateIdeas} disabled={working} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">{working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Gerar ideias</button>
        </div>
        {status && <div className="text-[11px] text-muted-foreground">{status}</div>}
      </div>

      {ideasQ.isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</div>
      ) : ideas.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhuma ideia ainda.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ideas.map((idea) => {
            const meta = idea.metadata ?? {};
            const imagePath = meta.image_path || meta.slides?.find((slide) => slide.image_path)?.image_path;
            const imageError = imageErrors[idea.id];
            const hashtags = (meta.hashtags ?? []).map((tag) => tag.startsWith("#") ? tag : `#${tag}`);
            const caption = meta.caption || idea.copy_suggestion || "";
            return (
              <div key={idea.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                <button type="button" onClick={() => setDetailId(idea.id)} className="relative aspect-square w-full overflow-hidden bg-muted text-left">
                  {imagePath ? <StoredImage path={imagePath} /> : imageError ? <div className="absolute inset-0 grid place-items-center bg-destructive/5 px-6 text-center text-xs"><div><div className="font-semibold text-destructive">Ideia criada; a arte falhou</div><div className="mt-1 break-words text-muted-foreground">{imageError}</div></div></div> : <div className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-muted-foreground">Ideia criada · arte aguardando geração</div>}
                  {imagingIds.includes(idea.id) && <div className="absolute inset-0 grid place-items-center bg-black/60 text-xs text-white"><div className="flex flex-col items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Gerando arte…</div></div>}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12 text-white"><div className="text-[10px] uppercase tracking-widest opacity-80">{meta.format || "feed"}{meta.format === "carrossel" && meta.slides?.length ? ` · ${meta.slides.length} slides` : ""}</div><div className="text-lg font-bold leading-tight">{meta.hook || idea.title}</div></div>
                </button>
                <div className="space-y-2 p-3">
                  <div className="text-[13px] leading-relaxed"><span className="mr-1 font-semibold">{brandHandle}</span>{caption}</div>
                  {hashtags.length > 0 && <div className="text-xs text-primary">{hashtags.join(" ")}</div>}
                  <div className="flex items-center gap-1 border-t border-border pt-2">
                    <button onClick={() => void copyText("Legenda", `${caption}\n\n${hashtags.join(" ")}`.trim())} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"><Copy className="h-3 w-3" />Copiar</button>
                    <button onClick={() => setDetailId(idea.id)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"><MessageCircle className="h-3 w-3" />Detalhes</button>
                    <button onClick={() => void removeIdea(idea.id)} className="rounded-md border p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                    <button onClick={() => onUse({ title: idea.title, caption, hashtags, pinned_comment: meta.pinned_comment ?? "" })} className="ml-auto rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground">Usar</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detail && <IdeaDetail idea={detail} imaging={imagingIds.includes(detail.id)} imageError={imageErrors[detail.id]} onClose={() => setDetailId(null)} onUse={onUse} />}
    </div>
  );
}

function IdeaDetail({ idea, imaging, imageError, onClose, onUse }: { idea: IdeaRow; imaging: boolean; imageError?: string; onClose: () => void; onUse: (idea: IdeaPayload) => void }) {
  const meta = idea.metadata ?? {};
  const caption = meta.caption || idea.copy_suggestion || "";
  const hashtags = (meta.hashtags ?? []).map((tag) => tag.startsWith("#") ? tag : `#${tag}`);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur"><div className="min-w-0"><div className="truncate text-sm font-semibold">{idea.title}</div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{meta.format || "feed"}</div></div><div className="ml-auto flex gap-1"><button onClick={() => onUse({ title: idea.title, caption, hashtags, pinned_comment: meta.pinned_comment ?? "" })} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">Usar</button><button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted"><XCircle className="h-4 w-4" /></button></div></div>
        <div className="grid gap-4 p-4 md:grid-cols-3">
          <div className="space-y-3"><div className="rounded-xl border p-3"><div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Legenda</div><div className="whitespace-pre-line text-sm">{caption || "-"}</div>{hashtags.length > 0 && <div className="mt-2 text-xs text-primary">{hashtags.join(" ")}</div>}</div>{meta.primary_cta && <div className="rounded-xl border p-3"><div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">CTA</div><div className="text-sm">{meta.primary_cta}</div></div>}{meta.pinned_comment && <div className="rounded-xl border p-3"><div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Comentário fixado</div><div className="text-sm">{meta.pinned_comment}</div></div>}</div>
          <div className="space-y-3 md:col-span-2">
            {meta.format === "carrossel" && meta.slides?.length ? <><div className="text-[11px] font-semibold uppercase text-muted-foreground">Slides do carrossel</div><div className="grid gap-3 sm:grid-cols-2">{meta.slides.map((slide, index) => <div key={index} className="overflow-hidden rounded-xl border border-border"><div className="relative aspect-[4/5] bg-muted">{slide.image_path ? <StoredImage path={slide.image_path} /> : <div className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-muted-foreground">{imaging ? <Loader2 className="h-5 w-5 animate-spin" /> : imageError || "Imagem deste slide ainda não foi gerada"}</div>}<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 text-white"><div className="text-[9px] uppercase tracking-widest">slide {slide.n ?? index + 1}</div><div className="font-bold leading-tight">{slide.title}</div></div></div><div className="space-y-2 p-3"><div className="text-sm">{slide.text}</div>{slide.image_prompt && <div className="rounded-md bg-muted/50 p-2 text-[11px]"><div className="mb-1 text-[9px] font-semibold uppercase text-muted-foreground">Prompt visual</div>{slide.image_prompt}</div>}</div></div>)}</div></> : <div className="overflow-hidden rounded-xl border border-border"><div className="relative aspect-[4/5] bg-muted">{meta.image_path ? <StoredImage path={meta.image_path} /> : <div className="absolute inset-0 grid place-items-center px-5 text-center text-sm text-muted-foreground">{imaging ? <Loader2 className="h-5 w-5 animate-spin" /> : imageError || "Imagem ainda não gerada"}</div>}</div>{meta.image_prompt && <div className="p-3 text-sm"><div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Prompt visual</div>{meta.image_prompt}</div>}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
