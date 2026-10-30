// Etapa Mídia, visível somente para super_admin.
// Permite: (1) upload de arquivos do PC/celular já com formato/dimensão sugerida,
// (2) gerar arte por IA usando prompt + dimensão do formato escolhido.
// Persiste em plan.media[]: { format, storagePath, source, prompt?, width, height }.
import { useEffect, useRef, useState } from "react";
import { Upload, Wand2, Loader2, X, Image as ImageIcon, Sparkles, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  streamImage, uploadDataUrlToBucket, uploadFileToBucket, signedUrlFor,
} from "@/lib/social-stream";

export type MediaFormat = "feed" | "reels" | "carrossel" | "story";

export type CampaignMedia = {
  id: string;
  format: MediaFormat;
  storagePath: string;
  source: "upload" | "ai";
  prompt?: string | null;
  width: number;
  height: number;
};

const FORMAT_SPECS: Record<MediaFormat, { label: string; width: number; height: number; aspect: string; note: string }> = {
  feed:      { label: "Feed",      width: 1080, height: 1080, aspect: "1:1",  note: "Quadrado 1:1, ideal p/ post no feed." },
  carrossel: { label: "Carrossel", width: 1080, height: 1350, aspect: "4:5",  note: "Retrato 4:5, recomendado p/ carrossel IG." },
  reels:     { label: "Reels",     width: 1080, height: 1920, aspect: "9:16", note: "Vertical 9:16, capa do Reels." },
  story:     { label: "Story",     width: 1080, height: 1920, aspect: "9:16", note: "Vertical 9:16, tela cheia." },
};

// Redimensiona uma imagem no canvas p/ o formato-alvo (cover / center-crop).
async function resizeFileToFormat(file: File, w: number, h: number): Promise<string> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const srcRatio = bmp.width / bmp.height;
  const dstRatio = w / h;
  let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
  if (srcRatio > dstRatio) {
    sw = bmp.height * dstRatio;
    sx = (bmp.width - sw) / 2;
  } else {
    sh = bmp.width / dstRatio;
    sy = (bmp.height - sh) / 2;
  }
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}

function MediaCard({
  media, onRemove,
}: { media: CampaignMedia; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    signedUrlFor(media.storagePath, 3600).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [media.storagePath]);

  return (
    <div className="relative group rounded-md overflow-hidden border border-border bg-muted aspect-square">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}
      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {url && (
          <a
            href={url}
            download="media.png"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded bg-black/60 text-white hover:bg-black/80 shadow-sm"
            title="Baixar imagem"
          >
            <Download className="w-3 h-3" />
          </a>
        )}
        <button onClick={onRemove}
          className="p-1 rounded bg-black/60 text-white hover:bg-black/80 shadow-sm"
          title="Excluir"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="absolute bottom-0 inset-x-0 px-1.5 py-0.5 text-[9px] bg-black/60 text-white flex items-center gap-1">
        {media.source === "ai" ? <Sparkles className="w-2.5 h-2.5" /> : <ImageIcon className="w-2.5 h-2.5" />}
        {media.width}×{media.height}
      </div>
    </div>
  );
}

function FormatSection({
  format, workspaceId, media, onChange, ideaPrompts,
}: {
  format: MediaFormat;
  workspaceId: string;
  media: CampaignMedia[];
  onChange: (next: CampaignMedia[]) => void;
  ideaPrompts: string[];
}) {
  const spec = FORMAT_SPECS[format];
  const fileRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<"upload" | "ai" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const items = media.filter(m => m.format === format);

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy("upload");
    try {
      const added: CampaignMedia[] = [];
      for (const f of Array.from(files)) {
        const dataUrl = await resizeFileToFormat(f, spec.width, spec.height);
        const path = await uploadDataUrlToBucket({
          workspaceId, dataUrl, folder: `campaigns/${format}`, ext: "png",
        });
        added.push({
          id: crypto.randomUUID(), format, storagePath: path,
          source: "upload", width: spec.width, height: spec.height,
        });
      }
      onChange([...media, ...added]);
      toast.success(`${added.length} mídia(s) adicionada(s) em ${spec.label}.`);
    } catch (e) {
      toast.error(`Falha no upload: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const generate = async () => {
    if (!prompt.trim()) { toast.error("Escreva um prompt para a arte."); return; }
    setBusy("ai"); setPreview(null);
    try {
      let finalUrl: string | null = null;
      await streamImage("/api/social/generate-image", {
        workspaceId, prompt: prompt.trim(),
        size: `${spec.width}x${spec.height}`,
        aspectRatio: spec.aspect,
      }, (frame) => {
        setPreview(frame.dataUrl);
        if (frame.final) finalUrl = frame.dataUrl;
      });
      if (!finalUrl) throw new Error("Sem imagem final.");
      const path = await uploadDataUrlToBucket({
        workspaceId, dataUrl: finalUrl, folder: `campaigns/${format}`, ext: "png",
      });
      const created: CampaignMedia = {
        id: crypto.randomUUID(), format, storagePath: path,
        source: "ai", prompt: prompt.trim(),
        width: spec.width, height: spec.height,
      };
      onChange([...media, created]);
      setPrompt(""); setPreview(null);
      toast.success("Arte gerada e salva.");
    } catch (e) {
      toast.error(`Falha ao gerar: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{spec.label}</div>
          <div className="text-[10px] text-muted-foreground">
            {spec.width}×{spec.height} · {spec.aspect}, {spec.note}
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border text-[11px] hover:bg-muted disabled:opacity-50">
            {busy === "upload" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            Adicionar mídia
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" hidden
            onChange={(e) => onFiles(e.target.files)} />
        </div>
      </div>

      <div className="flex items-start gap-1.5">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder={`Prompt da arte em ${spec.label} (${spec.aspect})…`}
          className="flex-1 px-2 py-1.5 rounded-md border border-border bg-background text-[11px] resize-none" />
        <button
          onClick={generate}
          disabled={busy !== null || !prompt.trim()}
          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50">
          {busy === "ai" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          Criar arte
        </button>
      </div>

      {ideaPrompts.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-muted-foreground">Prompts do Banco de Ideias:</div>
          <div className="flex flex-wrap gap-1">
            {ideaPrompts.slice(0, 8).map((p, i) => (
              <button key={i} onClick={() => setPrompt(p)}
                className="px-1.5 py-0.5 rounded border border-border text-[9px] hover:bg-muted max-w-[220px] truncate"
                title={p}>
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {preview && busy === "ai" && (
        <div className="relative rounded-md overflow-hidden border border-border">
          <img src={preview} alt="" className="w-full max-h-64 object-contain filter blur-md" />
          <div className="absolute inset-0 flex items-center justify-center text-white text-[11px] bg-black/30">
            gerando…
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {items.map(m => (
            <MediaCard key={m.id} media={m}
              onRemove={() => onChange(media.filter(x => x.id !== m.id))} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CampaignMediaStep({
  workspaceId, formats, media, onChange, ideaPrompts = [],
}: {
  workspaceId: string;
  formats: MediaFormat[];
  media: CampaignMedia[];
  onChange: (next: CampaignMedia[]) => void;
  ideaPrompts?: string[];
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-md bg-fuchsia-500/10 border border-fuchsia-400/40 px-3 py-2 text-[11px] text-fuchsia-700 dark:text-fuchsia-300">
        <strong>Etapa Mídia (super admin)</strong>, Faça upload dos arquivos (já são redimensionados
        para o formato correto) ou gere arte por IA com prompt e dimensão de cada formato.
      </div>
      {formats.length === 0 && (
        <div className="text-[11px] text-muted-foreground p-3 border border-dashed border-border rounded-md">
          Nenhum formato selecionado na etapa <em>Formatos</em>. Volte e escolha ao menos um.
        </div>
      )}
      {formats.map(f => (
        <FormatSection
          key={f}
          format={f}
          workspaceId={workspaceId}
          media={media}
          onChange={onChange}
          ideaPrompts={ideaPrompts}
        />
      ))}
    </div>
  );
}
