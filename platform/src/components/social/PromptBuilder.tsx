import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { socialApiHeaders } from "@/lib/social-stream";

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:5";
type ImageProvider = "ideogram" | "recraft" | "freepik" | "gemini";

export interface PromptBuilderProps {
  workspaceId: string;
  initialPrompt?: string;
  initialAspectRatio?: AspectRatio;
  initialProvider?: ImageProvider;
  onApply: (result: {
    prompt: string;
    aspectRatio: AspectRatio;
    dataUrl?: string;
    suggestedCaption?: string;
    suggestedTitle?: string;
    carouselImages?: string[];
  }) => void;
  onClose: () => void;
  mode?: "create" | "enhance";
  referenceImageUrl?: string | null;
  brandId?: string | null;
}

export function PromptBuilder({
  workspaceId,
  initialPrompt = "",
  initialAspectRatio = "1:1",
  initialProvider = "ideogram",
  onApply,
  onClose,
}: PromptBuilderProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(initialAspectRatio);
  const [provider, setProvider] = useState<ImageProvider>(initialProvider);
  const [loading, setLoading] = useState(false);
  const [enhanced, setEnhanced] = useState("");
  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  const enhance = async () => {
    if (!prompt.trim()) return toast.error("Escreva o que você quer criar.");
    setLoading(true);
    try {
      const r = await fetch("/api/social/refine-content", {
        method: "POST",
        headers: await socialApiHeaders(),
        body: JSON.stringify({
          workspaceId,
          text: prompt.trim(),
          mode: "image_prompt",
          imageProvider: provider,
          aspectRatio,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { prompt?: string };
      if (!data.prompt) throw new Error("A IA não retornou um prompt aprimorado.");
      setEnhanced(data.prompt);
      toast.success("Prompt aprimorado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const finalPrompt = enhanced || prompt;
  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-bold">Aprimorar prompt</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Escreva normalmente. O Vanessa Simoni adapta seu pedido para o motor escolhido.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold mb-1.5 block">O que você quer criar?</label>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setEnhanced("");
              }}
              rows={5}
              placeholder="Ex.: post para uma cafeteria anunciando promoção de café da manhã..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1.5 block">Motor da imagem</label>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as ImageProvider);
                  setEnhanced("");
                }}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="ideogram">Ideogram</option>
                <option value="recraft">Recraft</option>
                <option value="freepik">Freepik</option>
                <option value="gemini">Nano Banana</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block">Formato</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="1:1">1:1 · Quadrado</option>
                <option value="4:5">4:5 · Feed</option>
                <option value="9:16">9:16 · Story / Reels</option>
                <option value="16:9">16:9 · Horizontal</option>
              </select>
            </div>
          </div>
          <Button onClick={enhance} disabled={loading || !prompt.trim()} className="w-full">
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Aprimorar com IA
          </Button>
          {enhanced && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs font-semibold mb-2">Prompt aprimorado</div>
              <textarea
                value={enhanced}
                onChange={(e) => setEnhanced(e.target.value)}
                rows={7}
                className="w-full rounded-md border bg-background px-3 py-2 text-xs resize-y"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Você pode editar antes de usar.
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => onApply({ prompt: finalPrompt, aspectRatio })}
            disabled={!finalPrompt.trim()}
          >
            Usar prompt
          </Button>
        </div>
      </div>
    </div>
  );
}
