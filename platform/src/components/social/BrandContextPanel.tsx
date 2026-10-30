import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Loader2, Upload, X, Plus, Link2, ThumbsUp, ThumbsDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getBrandContext, saveBrandContext, type BrandContext } from "@/lib/social-brand.functions";
import { uploadFileToBucket, signedUrlFor } from "@/lib/social-stream";
import {
  listBrandReferences,
  saveBrandReference,
  deleteBrandReference,
} from "@/lib/social-references.functions";

type FieldDef = { key: keyof BrandContext; label: string; placeholder: string; rows?: number };

const SECTIONS: Array<{ title: string; fields: FieldDef[] }> = [
  {
    title: "Identidade",
    fields: [
      { key: "company_name", label: "Nome da empresa", placeholder: "Ex: Vanessa Simoni" },
      { key: "segment", label: "Segmento / nicho", placeholder: "Ex: SaaS de marketing para PMEs" },
      { key: "positioning", label: "Posicionamento", placeholder: "Como a marca quer ser vista no mercado", rows: 2 },
      { key: "main_promise", label: "Promessa principal", placeholder: "O que a marca entrega, em 1 frase" },
      { key: "differentials", label: "Diferenciais", placeholder: "O que só você faz / faz melhor", rows: 3 },
      { key: "products_services", label: "Produtos / serviços", placeholder: "Liste os principais produtos ou serviços", rows: 3 },
    ],
  },
  {
    title: "Público",
    fields: [
      { key: "target_audience", label: "Público-alvo", placeholder: "Perfil, cargo, idade, contexto", rows: 3 },
      { key: "audience_pains", label: "Principais dores do público", placeholder: "1 por linha", rows: 3 },
      { key: "audience_desires", label: "Principais desejos do público", placeholder: "1 por linha", rows: 3 },
    ],
  },
  {
    title: "Voz e visual",
    fields: [
      { key: "tone_of_voice", label: "Tom de voz", placeholder: "Ex: direto, próximo, brasileiro, sem corporativês", rows: 2 },
      { key: "visual_style", label: "Estilo visual desejado", placeholder: "Ex: minimalista, fundo escuro, tipografia forte", rows: 2 },
      { key: "post_types", label: "Tipos de post que costuma usar", placeholder: "Ex: educativo, autoridade, oferta, bastidor", rows: 2 },
    ],
  },
  {
    title: "Regras",
    fields: [
      { key: "forbidden_words", label: "Palavras proibidas", placeholder: "1 por linha ou separadas por vírgula", rows: 2 },
      { key: "forbidden_themes", label: "Temas proibidos", placeholder: "1 por linha ou separadas por vírgula", rows: 2 },
      { key: "competitors_references", label: "Concorrentes / marcas de referência", placeholder: "Marcas ou perfis de referência", rows: 3 },
    ],
  },
  {
    title: "Objetivos por canal",
    fields: [
      { key: "instagram_goal", label: "Objetivo no Instagram", placeholder: "Ex: gerar leads qualificados / posicionar autoridade", rows: 2 },
      { key: "facebook_goal", label: "Objetivo no Facebook", placeholder: "Ex: comunidade, retargeting, alcance local", rows: 2 },
      { key: "tiktok_goal", label: "Objetivo no TikTok", placeholder: "Ex: alcance viral, topo de funil, cultura", rows: 2 },
      { key: "linkedin_goal", label: "Objetivo no LinkedIn", placeholder: "Ex: autoridade B2B, atração de talento, vendas complexas", rows: 2 },
      { key: "organic_traffic_goal", label: "Objetivo geral do tráfego orgânico", placeholder: "Ex: crescer alcance no nicho X e converter em trial", rows: 2 },
    ],
  },
];

const MAX_PER_SENTIMENT = 20;

type BrandRef = {
  id: string;
  storage_path: string | null;
  source_url: string | null;
  sentiment: "like" | "dislike" | null;
  signed_url: string | null;
  label: string | null;
};

function ReferencesGallery({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listBrandReferences);
  const saveFn = useServerFn(saveBrandReference);
  const delFn = useServerFn(deleteBrandReference);

  const q = useQuery({
    queryKey: ["social-brand-refs", workspaceId],
    queryFn: () => listFn({ data: { workspaceId } }),
  });

  const refs = ((q.data?.references ?? []) as BrandRef[]);
  const likes = refs.filter((r) => (r.sentiment ?? "like") === "like");
  const dislikes = refs.filter((r) => r.sentiment === "dislike");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["social-brand-refs", workspaceId] });

  const addUrl = useMutation({
    mutationFn: (v: { url: string; sentiment: "like" | "dislike" }) =>
      saveFn({ data: { workspaceId, sourceUrl: v.url, sentiment: v.sentiment } }),
    onSuccess: () => { invalidate(); toast.success("Referência adicionada."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addFile = useMutation({
    mutationFn: async (v: { file: File; sentiment: "like" | "dislike" }) => {
      const path = await uploadFileToBucket({ workspaceId, file: v.file, folder: "brand-refs" });
      return saveFn({ data: { workspaceId, storagePath: path, sentiment: v.sentiment } });
    },
    onSuccess: () => { invalidate(); toast.success("Imagem enviada."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, workspaceId } }),
    onSuccess: () => { invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isError) {
    const message = q.error instanceof Error ? q.error.message : "Falha ao carregar referências.";
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">Referências indisponíveis: {message}</div>;
  }

  return (
    <div className="space-y-6">
      <RefBucket
        title="Referências que GOSTA"
        icon={<ThumbsUp className="w-4 h-4 text-emerald-500" />}
        items={likes}
        max={MAX_PER_SENTIMENT}
        onAddUrl={(url) => addUrl.mutate({ url, sentiment: "like" })}
        onAddFile={(file) => addFile.mutate({ file, sentiment: "like" })}
        onRemove={(id) => remove.mutate(id)}
        busy={addUrl.isPending || addFile.isPending}
        loading={q.isLoading}
      />
      <RefBucket
        title="Referências que NÃO gosta"
        icon={<ThumbsDown className="w-4 h-4 text-rose-500" />}
        items={dislikes}
        max={MAX_PER_SENTIMENT}
        onAddUrl={(url) => addUrl.mutate({ url, sentiment: "dislike" })}
        onAddFile={(file) => addFile.mutate({ file, sentiment: "dislike" })}
        onRemove={(id) => remove.mutate(id)}
        busy={addUrl.isPending || addFile.isPending}
        loading={q.isLoading}
      />
    </div>
  );
}

function RefBucket(props: {
  title: string;
  icon: React.ReactNode;
  items: BrandRef[];
  max: number;
  onAddUrl: (url: string) => void;
  onAddFile: (f: File) => void;
  onRemove: (id: string) => void;
  busy: boolean;
  loading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState("");
  const full = props.items.length >= props.max;

  const submitUrl = () => {
    const v = url.trim();
    if (!v) return;
    try { new URL(v); } catch { toast.error("URL inválida."); return; }
    props.onAddUrl(v);
    setUrl("");
  };

  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">{props.icon}{props.title}</div>
        <div className="text-[11px] text-muted-foreground">{props.items.length} / {props.max}</div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 flex-1 rounded-md border border-border bg-background px-2">
          <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitUrl(); }}
            placeholder="Cole um link de referência (post, site, Pinterest…)"
            className="flex-1 py-2 text-sm bg-transparent focus:outline-none"
            disabled={full || props.busy}
          />
          <button type="button" onClick={submitUrl} disabled={full || props.busy || !url.trim()} className="text-xs font-medium text-primary disabled:opacity-40 px-2">Adicionar</button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onAddFile(f);
            e.currentTarget.value = "";
          }}
        />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={full || props.busy} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background text-xs font-medium hover:bg-muted disabled:opacity-50">
          {props.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Enviar imagem
        </button>
      </div>

      {props.loading ? (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando…</div>
      ) : props.items.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">Nenhuma referência ainda.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {props.items.map((r) => (
            <div key={r.id} className="relative group aspect-square rounded-md overflow-hidden border border-border bg-muted/30">
              {r.signed_url ? (
                <img src={r.signed_url} alt={r.label ?? "ref"} className="w-full h-full object-cover" />
              ) : r.source_url ? (
                <a href={r.source_url} target="_blank" rel="noreferrer" className="w-full h-full grid place-items-center p-2 text-[10px] text-primary break-all text-center hover:underline">
                  <span className="line-clamp-4"><Link2 className="w-3 h-3 inline mr-1" />{r.source_url}</span>
                </a>
              ) : (
                <div className="w-full h-full grid place-items-center text-[10px] text-muted-foreground">sem preview</div>
              )}
              <button type="button" onClick={() => props.onRemove(r.id)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition" title="Remover">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BrandContextPanel({ workspaceId }: { workspaceId: string | null }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getBrandContext);
  const saveFn = useServerFn(saveBrandContext);
  const [form, setForm] = useState<BrandContext>({});
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const q = useQuery({
    queryKey: ["social-brand-context", workspaceId],
    queryFn: () => getFn({ data: { workspaceId: workspaceId as string } }),
    enabled: !!workspaceId,
  });

  useEffect(() => {
    if (q.data?.context) setForm(q.data.context);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => saveFn({
      data: {
        workspaceId: workspaceId as string,
        patch: Object.fromEntries(
          Object.entries(form).map(([k, v]) => [k, v === "" ? null : (v ?? null)]),
        ) as BrandContext,
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-brand-context", workspaceId] });
      toast.success("Contexto da marca salvo. O agente já usa isso na próxima mensagem.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!workspaceId) {
    return <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">Carregando workspace…</div>;
  }
  if (q.isLoading) {
    return <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando contexto…</div>;
  }
  if (q.isError) {
    const message = q.error instanceof Error ? q.error.message : "Falha desconhecida ao carregar a Marca.";
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm">
        <div className="font-semibold text-destructive">Não foi possível carregar a Marca.</div>
        <div className="mt-1 break-words text-xs text-muted-foreground">{message}</div>
      </div>
    );
  }

  const set = (k: keyof BrandContext, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const colors: string[] = (((form.brand_colors as string | null) ?? "").split(",").map((c) => c.trim()).filter(Boolean));
  const setColors = (next: string[]) => setForm((f) => ({ ...f, brand_colors: next.join(", ") }));
  const updateColor = (i: number, hex: string) => setColors(colors.map((c, idx) => (idx === i ? hex : c)));
  const addColor = () => setColors([...colors, "#3B82F6"]);
  const removeColor = (i: number) => setColors(colors.filter((_, idx) => idx !== i));

  const handleLogoUpload = async (file: File) => {
    if (!workspaceId) return;
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) {
      toast.error("Envie um arquivo PNG, JPG, WEBP ou SVG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo até 5 MB.");
      return;
    }
    setLogoUploading(true);
    try {
      const path = await uploadFileToBucket({ workspaceId, file, folder: "brand-logo" });
      const url = await signedUrlFor(path, 60 * 60 * 24 * 365);
      if (!url) throw new Error("Não consegui gerar o link do arquivo.");
      set("logo_url", url);
      toast.success("Logo enviada. Não esqueça de salvar o contexto.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setLogoUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-foreground/80 leading-relaxed">
        Quanto mais completo esse contexto, melhor o agente estratégico entende sua marca. Campos em branco são ignorados.
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title} className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold">{section.title}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {section.fields.map((f) => (
              <div key={f.key as string} className={f.rows && f.rows > 2 ? "md:col-span-2" : ""}>
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{f.label}</label>
                {f.rows ? (
                  <textarea value={(form[f.key] ?? "") as string} onChange={(e) => set(f.key, e.target.value)} rows={f.rows} placeholder={f.placeholder} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/30" />
                ) : (
                  <input value={(form[f.key] ?? "") as string} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                )}
              </div>
            ))}
          </div>

          {section.title === "Voz e visual" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Logo da marca</label>
                <p className="text-[11px] text-muted-foreground mt-1">PNG, JPG, WEBP ou SVG, de preferência com fundo transparente. Até 5 MB.</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="w-20 h-20 rounded-md border border-dashed border-border bg-[repeating-conic-gradient(#00000010_0deg_90deg,transparent_90deg_180deg)] bg-[length:16px_16px] grid place-items-center overflow-hidden">
                    {form.logo_url ? <img src={form.logo_url as string} alt="Logo" className="max-w-full max-h-full object-contain" /> : <span className="text-[10px] text-muted-foreground">sem logo</span>}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.currentTarget.value = ""; }} />
                    <button type="button" onClick={() => logoInputRef.current?.click()} disabled={logoUploading} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-muted disabled:opacity-60">
                      {logoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {form.logo_url ? "Trocar logo" : "Enviar logo"}
                    </button>
                    {form.logo_url && <button type="button" onClick={() => set("logo_url", "")} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /> Remover</button>}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Cores da marca</label>
                <p className="text-[11px] text-muted-foreground mt-1">Clique no quadradinho para escolher a cor. Adicione quantas quiser.</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {colors.map((c, i) => (
                    <div key={i} className="relative group">
                      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#000000"} onChange={(e) => updateColor(i, e.target.value)} className="w-10 h-10 rounded-md border border-border cursor-pointer bg-transparent p-0" title={c} />
                      <button type="button" onClick={() => removeColor(i)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground grid place-items-center opacity-0 group-hover:opacity-100 transition" aria-label="Remover cor"><X className="w-2.5 h-2.5" /></button>
                      <div className="text-[10px] text-muted-foreground text-center mt-0.5 font-mono">{c.toUpperCase()}</div>
                    </div>
                  ))}
                  <button type="button" onClick={addColor} className="w-10 h-10 rounded-md border border-dashed border-border grid place-items-center text-muted-foreground hover:bg-muted hover:text-foreground" title="Adicionar cor"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          )}
        </section>
      ))}

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Referências de posts</h3>
          <p className="text-[11px] text-muted-foreground mt-1">Exemplos de posts que você <b>gosta</b> e que você <b>não gosta</b>. Cole o link ou envie a imagem, até {MAX_PER_SENTIMENT} de cada lado.</p>
        </div>
        <ReferencesGallery workspaceId={workspaceId} />
      </section>

      <div className="sticky bottom-2 flex justify-end">
        <button onClick={() => save.mutate()} disabled={save.isPending} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium shadow-lg hover:bg-primary/90 disabled:opacity-60">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar contexto da marca
        </button>
      </div>
    </div>
  );
}
