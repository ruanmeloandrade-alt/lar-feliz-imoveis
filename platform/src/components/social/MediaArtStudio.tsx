import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Wand2,
  Loader2,
  Download,
  Palette,
  Image as ImageIcon,
  Zap,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PromptBuilder, type AspectRatio } from "@/components/social/PromptBuilder";
import { streamImage } from "@/lib/social-stream";
import { listSocialImageProviders } from "@/lib/social-finalization.functions";
import { useIsSuperAdmin } from "@/hooks/use-roles";

type Provider = "ideogram" | "recraft" | "freepik" | "gemini";
const PROVIDERS: { id: Provider; label: string; icon: typeof Palette }[] = [
  { id: "ideogram", label: "Ideogram", icon: Palette },
  { id: "recraft", label: "Recraft", icon: Sparkles },
  { id: "freepik", label: "Freepik", icon: ImageIcon },
  { id: "gemini", label: "Nano Banana", icon: Zap },
];

export function MediaArtStudio({
  workspaceId,
  compact = false,
}: {
  workspaceId: string | null;
  compact?: boolean;
}) {
  const { isSuperAdmin, loaded: rolesLoaded } = useIsSuperAdmin();
  const providersFn = useServerFn(listSocialImageProviders);
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState<Provider>("ideogram");
  const [connectedProviders, setConnectedProviders] = useState<Provider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [carousel, setCarousel] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin || !workspaceId) {
      setConnectedProviders([]);
      return;
    }
    let alive = true;
    setProvidersLoading(true);
    providersFn({ data: { workspaceId } })
      .then((result) => {
        if (!alive) return;
        const next = (result.providers ?? []) as Provider[];
        setConnectedProviders(next);
        const preferred = next.includes("ideogram") ? "ideogram" : next[0];
        if (preferred) setProvider(preferred);
      })
      .catch(() => {
        if (alive) setConnectedProviders([]);
      })
      .finally(() => {
        if (alive) setProvidersLoading(false);
      });
    return () => { alive = false; };
  }, [workspaceId, providersFn, isSuperAdmin]);

  const availableProviders = PROVIDERS.filter((item) => connectedProviders.includes(item.id));
  const hasProvider = availableProviders.length > 0;

  const generate = async () => {
    if (!isSuperAdmin) return;
    if (!workspaceId || !prompt.trim()) {
      toast.error("Escreva o que deseja criar.");
      return;
    }
    if (!hasProvider) {
      toast.error("Conecte o Ideogram ou outro motor de imagem em Integrações.");
      return;
    }
    setLoading(true);
    try {
      let generated: string[] = [];
      await streamImage(
        "/api/social/generate-image",
        { workspaceId, prompt: prompt.trim(), provider, aspectRatio, carousel },
        (frame) => {
          if (frame.final) generated = frame.dataUrls?.length ? frame.dataUrls : [frame.dataUrl];
        },
      );
      if (!generated.length) throw new Error("O motor não retornou imagens.");
      setImages(generated);
      toast.success(
        carousel ? `${generated.length} imagens geradas para o carrossel.` : "Imagem gerada.",
      );
    } catch (e) {
      console.error(e);
      toast.error(`Falha ao gerar: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!rolesLoaded || !isSuperAdmin) return null;

  if (compact) {
    return (
      <div className="border-t border-border bg-background/80 px-3 py-2 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Descreva a arte que deseja gerar…"
            className="min-w-[220px] flex-1 rounded-md border border-border bg-background px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="h-8 rounded-md border border-border bg-background px-2 text-[11px]"
            title="Motor de imagem"
            disabled={!hasProvider || providersLoading}
          >
            {availableProviders.length ? availableProviders.map((p) => <option key={p.id} value={p.id}>{p.label}</option>) : <option>Sem motor conectado</option>}
          </select>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
            className="h-8 rounded-md border border-border bg-background px-2 text-[11px]"
            title="Formato da arte"
          >
            <option value="1:1">Quadrado</option>
            <option value="4:5">Feed</option>
            <option value="9:16">Story</option>
            <option value="16:9">Horizontal</option>
          </select>
          <label className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[11px]">
            <input type="checkbox" checked={carousel} onChange={(e) => setCarousel(e.target.checked)} />
            Carrossel
          </label>
          <Button variant="outline" size="sm" className="h-8 px-2 text-[11px]" onClick={() => setBuilderOpen(true)} disabled={!workspaceId}>
            <Wand2 className="mr-1 h-3 w-3" /> Aprimorar
          </Button>
          <Button size="sm" className="h-8 px-2 text-[11px]" onClick={generate} disabled={loading || !workspaceId || !prompt.trim() || !hasProvider || providersLoading}>
            {loading || providersLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
            Gerar imagem
          </Button>
        </div>
        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((src, i) => (
              <div key={i} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                <img src={src} alt={`Arte ${i + 1}`} className="h-full w-full object-cover" />
                <a href={src} download={`arte-${i + 1}.png`} className="absolute right-1 top-1 rounded bg-background/90 p-1" title="Baixar arte">
                  <Download className="h-3 w-3" />
                </a>
              </div>
            ))}
            <button onClick={() => setImages([])} className="h-20 w-12 shrink-0 rounded-md border border-dashed border-border text-muted-foreground hover:text-destructive" title="Limpar artes">
              <Trash2 className="mx-auto h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {builderOpen && workspaceId && (
          <PromptBuilder
            workspaceId={workspaceId}
            initialPrompt={prompt}
            initialAspectRatio={aspectRatio}
            onClose={() => setBuilderOpen(false)}
            onApply={(r) => {
              setPrompt(r.prompt);
              setAspectRatio(r.aspectRatio);
              if (r.carouselImages?.length) setImages(r.carouselImages);
              setBuilderOpen(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-primary">
          <Sparkles className="w-4 h-4" /> Criar arte com IA
        </div>
        {provider === "ideogram" && hasProvider && (
          <span className="text-[9px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">IDEOGRAM 3.0</span>
        )}
      </div>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Ex.: uma cafeteria moderna ao amanhecer, tons quentes, espaço para título..." className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/30" />
      {hasProvider ? (
        <div className={cn("grid gap-2", availableProviders.length > 2 ? "grid-cols-4" : "grid-cols-2")}>
          {availableProviders.map((p) => (
            <button key={p.id} onClick={() => setProvider(p.id)} className={cn("flex flex-col items-center gap-1 rounded-md border p-1.5 transition-all", provider === p.id ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted")}>
              <p.icon className="h-3 w-3 text-primary" /><span className="text-[9px] font-bold">{p.label}</span>
            </button>
          ))}
        </div>
      ) : <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">Conecte o Ideogram ou outro motor de imagem em Integrações.</div>}
      <div className="flex flex-wrap items-center gap-2">
        <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
          <option value="1:1">1:1 · Quadrado</option><option value="4:5">4:5 · Feed</option><option value="9:16">9:16 · Story / Reels</option><option value="16:9">16:9 · Horizontal</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={carousel} onChange={(e) => setCarousel(e.target.checked)} /> Carrossel (4 imagens)</label>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setBuilderOpen(true)}><Wand2 className="w-3.5 h-3.5 mr-1.5" /> Aprimorar prompt</Button>
        <Button size="sm" className="h-8 text-xs ml-auto" onClick={generate} disabled={loading || !hasProvider}>{loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}{loading ? "Gerando…" : "Gerar imagem"}</Button>
      </div>
      {images.length > 0 && (
        <div className={cn("grid gap-2", images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {images.map((src, i) => (
            <div key={i} className="relative group rounded-lg overflow-hidden border border-border bg-background"><img src={src} alt={`Arte ${i + 1}`} className="w-full h-auto" /><a href={src} download={`arte-${i + 1}.png`} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-background/90 border rounded-md p-1.5"><Download className="h-3.5 w-3.5" /></a></div>
          ))}
          <button onClick={() => setImages([])} className="col-span-full inline-flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /> Limpar artes</button>
        </div>
      )}
      {builderOpen && workspaceId && (
        <PromptBuilder workspaceId={workspaceId} initialPrompt={prompt} initialAspectRatio={aspectRatio} onClose={() => setBuilderOpen(false)} onApply={(r) => { setPrompt(r.prompt); setAspectRatio(r.aspectRatio); if (r.carouselImages?.length) setImages(r.carouselImages); setBuilderOpen(false); }} />
      )}
    </div>
  );
}
