// Onda 3, Painel de referências visuais da marca.
// Upload direto ao bucket social-media, análise multimodal e memória visual agregada.
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Upload, Trash2, Sparkles, EyeOff, Eye, RefreshCw, Palette, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { uploadFileToBucket } from "@/lib/social-stream";
import {
  listBrandReferences, saveBrandReference, deleteBrandReference,
  toggleBrandReferenceActive, analyzeBrandReference, rebuildVisualMemory,
} from "@/lib/social-references.functions";
import { getBrandContext } from "@/lib/social-brand.functions";
import { cn } from "@/lib/utils";

const MAX_REFS = 20;

type RefRow = {
  id: string;
  label: string | null;
  storage_path: string;
  signed_url: string | null;
  status: string;
  is_active: boolean;
  analysis: {
    style?: string; palette?: string[]; typography?: string;
    composition?: string; mood?: string; textures_effects?: string;
    subjects?: string[]; photo_or_illustration?: string; notes?: string;
  } | null;
};

export function BrandReferencesPanel({ workspaceId }: { workspaceId: string | null }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listBrandReferences);
  const saveFn = useServerFn(saveBrandReference);
  const delFn = useServerFn(deleteBrandReference);
  const toggleFn = useServerFn(toggleBrandReferenceActive);
  const analyzeFn = useServerFn(analyzeBrandReference);
  const rebuildFn = useServerFn(rebuildVisualMemory);
  const getBrand = useServerFn(getBrandContext);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const q = useQuery({
    queryKey: ["brand-references", workspaceId],
    queryFn: () => listFn({ data: { workspaceId: workspaceId as string } }),
    enabled: !!workspaceId,
  });
  const brandQ = useQuery({
    queryKey: ["social-brand-context", workspaceId],
    queryFn: () => getBrand({ data: { workspaceId: workspaceId as string } }),
    enabled: !!workspaceId,
  });

  const refs = (q.data?.references ?? []) as unknown as RefRow[];
  const visualMemory = (brandQ.data?.context as { visual_memory?: string | null } | null)?.visual_memory ?? null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["brand-references", workspaceId] });
    qc.invalidateQueries({ queryKey: ["social-brand-context", workspaceId] });
  };

  const analyzeAndRebuild = async (id: string) => {
    try {
      await analyzeFn({ data: { id, workspaceId: workspaceId as string } });
      await rebuildFn({ data: { workspaceId: workspaceId as string } });
      invalidate();
    } catch (e) { toast.error((e as Error).message); }
  };

  const doUpload = async (files: FileList | null) => {
    if (!files || !workspaceId) return;
    const remaining = MAX_REFS - refs.length;
    if (remaining <= 0) { toast.error(`Limite de ${MAX_REFS} referências atingido.`); return; }
    const list = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      for (const file of list) {
        if (!file.type.startsWith("image/")) { toast.error(`${file.name}: só imagens.`); continue; }
        try {
          const path = await uploadFileToBucket({ workspaceId, file, folder: "brand-refs" });
          const r = await saveFn({ data: { workspaceId, storagePath: path, label: file.name.slice(0, 60) } });
          const created = r.reference as { id: string } | null;
          if (created?.id) {
            // dispara análise em paralelo (sem bloquear)
            analyzeAndRebuild(created.id).catch(() => { /* toast já dispara */ });
          }
        } catch (e) { toast.error(`${file.name}: ${(e as Error).message}`); }
      }
      invalidate();
      toast.success("Referências enviadas. Análise em andamento…");
    } finally { setUploading(false); }
  };

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, workspaceId: workspaceId as string } }),
    onSuccess: async () => {
      await rebuildFn({ data: { workspaceId: workspaceId as string } });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleFn({ data: { id, workspaceId: workspaceId as string, isActive } }),
    onSuccess: async () => {
      await rebuildFn({ data: { workspaceId: workspaceId as string } });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rebuildOnly = useMutation({
    mutationFn: () => rebuildFn({ data: { workspaceId: workspaceId as string } }),
    onSuccess: () => { invalidate(); toast.success("Memória visual recalculada."); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!workspaceId) {
    return <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">Carregando workspace…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-foreground/80 leading-relaxed">
        Envie até <b>{MAX_REFS} imagens</b> que definem o visual da sua marca (posts anteriores, referências, moodboard). A IA analisa cada uma, cores, tipografia, composição, mood, e monta uma <b>memória visual</b> usada automaticamente em todo prompt de imagem gerado no módulo.
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Memória visual da marca</h3>
          </div>
          <button
            onClick={() => rebuildOnly.mutate()}
            disabled={rebuildOnly.isPending || refs.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-[11px] hover:bg-muted disabled:opacity-40"
          >
            {rebuildOnly.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Recalcular
          </button>
        </div>
        <div className="text-xs leading-relaxed">
          {visualMemory
            ? <p className="text-foreground/90 whitespace-pre-wrap">{visualMemory}</p>
            : <p className="text-muted-foreground italic">Nenhuma memória visual ainda. Envie imagens abaixo e aguarde a análise para consolidar o estilo da marca.</p>}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm font-semibold">
            Referências ({refs.length}/{MAX_REFS})
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file" accept="image/*" multiple hidden
              onChange={(e) => { doUpload(e.target.files); e.currentTarget.value = ""; }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || refs.length >= MAX_REFS}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              Enviar imagens
            </button>
          </div>
        </div>

        {q.isLoading ? (
          <div className="text-xs text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando…</div>
        ) : refs.length === 0 ? (
          <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
            Nenhuma referência enviada. Comece pelos 3-5 posts que melhor representam sua marca.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {refs.map((r) => (
              <ReferenceCard
                key={r.id}
                row={r}
                onToggle={() => toggle.mutate({ id: r.id, isActive: !r.is_active })}
                onDelete={() => del.mutate(r.id)}
                onReanalyze={() => analyzeAndRebuild(r.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReferenceCard({ row, onToggle, onDelete, onReanalyze }: {
  row: RefRow;
  onToggle: () => void;
  onDelete: () => void;
  onReanalyze: () => void;
}) {
  const a = row.analysis;
  const pending = row.status !== "ready" || !a;
  return (
    <div className={cn(
      "rounded-lg border overflow-hidden bg-background",
      row.is_active ? "border-border" : "border-border/40 opacity-60",
    )}>
      <div className="aspect-square bg-muted/40 relative">
        {row.signed_url
          ? <img src={row.signed_url} alt={row.label ?? "ref"} className="w-full h-full object-cover" />
          : <div className="w-full h-full grid place-items-center text-muted-foreground text-[10px]">Sem preview</div>}
        {!row.is_active && (
          <div className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded bg-background/80 border border-border">
            Inativa
          </div>
        )}
      </div>
      <div className="p-2.5 space-y-1.5">
        <div className="text-[11px] font-medium truncate">{row.label ?? "Referência"}</div>
        {pending ? (
          <div className="flex items-center gap-1 text-[10px] text-amber-500">
            <AlertTriangle className="w-3 h-3" /> Análise pendente
          </div>
        ) : (
          <div className="space-y-1 text-[10px] text-muted-foreground">
            {a?.style && <div><b>Estilo:</b> {a.style}</div>}
            {a?.mood && <div><b>Mood:</b> {a.mood}</div>}
            {a?.palette && a.palette.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <b>Paleta:</b>
                {a.palette.slice(0, 6).map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-1 rounded border border-border">
                    {c.startsWith("#") && <span className="w-2 h-2 rounded-sm" style={{ background: c }} />}
                    <span>{c}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-1 pt-1">
          <button
            onClick={onToggle}
            title={row.is_active ? "Desativar" : "Ativar"}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
          >
            {row.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onReanalyze}
            title="Reanalisar"
            className="p-1 rounded hover:bg-muted text-muted-foreground"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            title="Remover"
            className="p-1 rounded hover:bg-muted text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
