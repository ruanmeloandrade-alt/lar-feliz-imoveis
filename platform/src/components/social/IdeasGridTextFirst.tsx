import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, MessageCircle, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteSocialIdea, listSocialIdeas } from "@/lib/social.functions";
import { generateSocialIdeasWithWorkspaceAi, refineSocialBriefing } from "@/lib/social-finalization.functions";
import { selectCreatedIdeas } from "@/lib/social-ideas-reliability";
import type { IdeaPayload } from "./IdeasGridFinalizationCore";

type IdeaMeta = {
  hook?: string;
  caption?: string;
  primary_cta?: string;
  pinned_comment?: string;
  hashtags?: string[];
  format?: string;
  slides?: Array<{ n?: number; title?: string; text?: string }>;
};
type IdeaRow = {
  id: string;
  title: string;
  copy_suggestion: string | null;
  metadata: IdeaMeta;
};

export function IdeasGridTextFirst({ workspaceId, onUse }: { workspaceId: string | null; onUse: (idea: IdeaPayload) => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSocialIdeas);
  const deleteFn = useServerFn(deleteSocialIdea);
  const generateFn = useServerFn(generateSocialIdeasWithWorkspaceAi);
  const refineFn = useServerFn(refineSocialBriefing);
  const [brief, setBrief] = useState("");
  const [count, setCount] = useState(4);
  const [network, setNetwork] = useState<"instagram" | "facebook" | "both" | "tiktok">("both");
  const [format, setFormat] = useState<"feed" | "story" | "carrossel" | "qualquer">("qualquer");
  const [carouselSlides, setCarouselSlides] = useState(6);
  const [working, setWorking] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [brandOption, setBrandOption] = useState<{ id: string; company_name: string | null } | null>(null);

  const ideasQ = useQuery({
    queryKey: ["social-ideas", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listFn({ data: { workspaceId: workspaceId! } }),
  });
  const ideas = ((ideasQ.data as { ideas?: IdeaRow[] } | undefined)?.ideas ?? []);

  useEffect(() => {
    if (!workspaceId) return;
    void supabase
      .from("social_brand_context")
      .select("id,company_name")
      .eq("workspace_id", workspaceId)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { id?: string; company_name?: string | null } | null;
        setBrandOption(row?.id ? { id: row.id, company_name: row.company_name ?? null } : null);
        setBrandId(null);
      });
  }, [workspaceId]);

  const improveBrief = async () => {
    if (!workspaceId || !brief.trim()) return;
    setWorking(true);
    try {
      const out = await refineFn({
        data: { workspaceId, briefing: brief.trim(), imageProvider: "ideogram", brandId, references: [] },
      });
      setBrief(out.refinedBriefing);
      toast.success("Pedido aprimorado.");
    } catch (error) {
      toast.error(`Não consegui aprimorar: ${(error as Error).message}`);
    } finally {
      setWorking(false);
    }
  };

  const generateIdeas = async () => {
    if (!workspaceId) return toast.error("Workspace ainda não carregou.");
    if (!brief.trim()) return toast.error("Escreva o pedido para gerar ideias.");
    setWorking(true);
    try {
      const out = await generateFn({
        data: { workspaceId, count, brief: brief.trim(), network, format, brandId, references: [], carouselSlides },
      });
      const ids = Array.isArray(out.ideaIds) ? out.ideaIds.filter((id): id is string => typeof id === "string" && !!id) : [];
      if (!out.created || !ids.length) throw new Error("A IA não confirmou as ideias criadas.");
      const fresh = (await listFn({ data: { workspaceId } })) as { ideas?: IdeaRow[] };
      qc.setQueryData(["social-ideas", workspaceId], fresh);
      const rows = selectCreatedIdeas(fresh.ideas ?? [], ids);
      toast.success(`${rows.length} ideia${rows.length === 1 ? "" : "s"} criada${rows.length === 1 ? "" : "s"} com textos e direcionamento.`);
    } catch (error) {
      toast.error(`Falha ao criar ideias: ${(error as Error).message}`);
    } finally {
      setWorking(false);
    }
  };

  const removeIdea = async (id: string) => {
    if (!workspaceId || !confirm("Excluir esta ideia?")) return;
    await deleteFn({ data: { workspaceId, ideaId: id } });
    await qc.invalidateQueries({ queryKey: ["social-ideas", workspaceId] });
  };

  const copyText = async (label: string, text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copiado.`); }
    catch { toast.error("Não consegui copiar."); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div>
          <div className="text-sm font-semibold">Peça uma ideia</div>
          <div className="text-xs text-muted-foreground">A IA cria estratégia, pauta, legenda, CTA, hashtags e direção para o calendário editorial. A mídia é adicionada por você no post.</div>
        </div>
        <textarea rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Ex: quero uma campanha de 30 dias para aquecer leads e vender meu serviço..." className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <div className="flex flex-wrap gap-2">
          <select value={brandId ?? ""} onChange={(e) => setBrandId(e.target.value || null)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
            <option value="">Sem referência de marca</option>
            {brandOption && <option value={brandOption.id}>{brandOption.company_name || "Marca principal"}</option>}
          </select>
          <select value={network} onChange={(e) => setNetwork(e.target.value as typeof network)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"><option value="both">Instagram + Facebook</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option></select>
          <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"><option value="qualquer">Qualquer formato</option><option value="feed">Feed</option><option value="story">Story</option><option value="carrossel">Carrossel</option></select>
          {format === "carrossel" && <select value={carouselSlides} onChange={(e) => setCarouselSlides(Number(e.target.value))} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">{[4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n} slides</option>)}</select>}
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">{[1,2,3,4,5,6,8].map((n) => <option key={n} value={n}>{n} ideia{n > 1 ? "s" : ""}</option>)}</select>
          <button type="button" onClick={improveBrief} disabled={working || !brief.trim()} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" />Aprimorar pedido</button>
          <button type="button" onClick={generateIdeas} disabled={working} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">{working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Gerar ideias</button>
        </div>
      </div>

      {ideasQ.isLoading ? <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</div> : ideas.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhuma ideia ainda.</div> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ideas.map((idea) => {
            const meta = idea.metadata ?? {};
            const caption = meta.caption || idea.copy_suggestion || "";
            const hashtags = (meta.hashtags ?? []).map((tag) => tag.startsWith("#") ? tag : `#${tag}`);
            return <div key={idea.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{meta.format || "feed"}</div><div className="text-base font-bold">{meta.hook || idea.title}</div></div>
              {caption && <div className="whitespace-pre-line text-sm">{caption}</div>}
              {meta.primary_cta && <div className="rounded-md bg-muted/50 p-2 text-xs"><strong>CTA:</strong> {meta.primary_cta}</div>}
              {meta.slides?.length ? <div className="space-y-1 rounded-md border p-2 text-xs"><strong>Direção do carrossel</strong>{meta.slides.map((slide, index) => <div key={index}>{slide.n ?? index + 1}. {slide.title || slide.text}</div>)}</div> : null}
              {hashtags.length > 0 && <div className="text-xs text-primary">{hashtags.join(" ")}</div>}
              <div className="flex items-center gap-1 border-t border-border pt-2">
                <button onClick={() => void copyText("Legenda", `${caption}\n\n${hashtags.join(" ")}`.trim())} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"><Copy className="h-3 w-3" />Copiar</button>
                <button onClick={() => onUse({ title: idea.title, caption, hashtags, pinned_comment: meta.pinned_comment ?? "" })} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"><MessageCircle className="h-3 w-3" />Usar no post</button>
                <button onClick={() => void removeIdea(idea.id)} className="ml-auto rounded-md border p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>;
          })}
        </div>
      )}
    </div>
  );
}
