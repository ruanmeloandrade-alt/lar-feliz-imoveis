import { useEffect, useMemo, useState } from "react";
import { useSocialPosts, type SocialPostRow, type SocialAssetRow } from "./useSocialPosts";
import { supabase } from "@/integrations/supabase/client";
import { Image as ImageIcon, Filter, Loader2, Sparkles, Palette, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { openOrCreateCanvaDesign, importCanvaDesignToPost } from "@/lib/canva.functions";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  scheduled: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  published: "bg-primary/15 text-primary",
  failed: "bg-destructive/15 text-destructive",
  rejected: "bg-destructive/10 text-destructive",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovado",
  scheduled: "Agendado",
  published: "Publicado",
  failed: "Erro",
  rejected: "Rejeitado",
};

export function ArtLibrary({ workspaceId }: { workspaceId: string | null }) {
  const q = useSocialPosts(workspaceId);
  const qc = useQueryClient();
  const openCanvaFn = useServerFn(openOrCreateCanvaDesign);
  const importCanvaFn = useServerFn(importCanvaDesignToPost);
  const [status, setStatus] = useState<string>("all");
  const [urls, setUrls] = useState<Record<string, string>>({});

  const openCanva = useMutation({
    mutationFn: async (postId: string) => openCanvaFn({ data: { workspaceId: workspaceId!, postId, templateId: null } }),
    onSuccess: (res) => {
      if (res.editUrl) window.open(res.editUrl, "_blank", "noopener,noreferrer");
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success("Design aberto no Canva.");
    },
    onError: (e: Error) => toast.error(`Canva: ${e.message}`),
  });

  const importCanva = useMutation({
    mutationFn: async (postId: string) => importCanvaFn({ data: { workspaceId: workspaceId!, postId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success("Arte final importada do Canva.");
    },
    onError: (e: Error) => toast.error(`Importação Canva: ${e.message}`),
  });

  const posts = q.data?.posts ?? [];
  const assets = q.data?.assets ?? [];

  const grouped = useMemo(() => {
    const map: Record<string, { post: SocialPostRow; assets: SocialAssetRow[] }> = {};
    for (const p of posts) map[p.id] = { post: p, assets: [] };
    for (const a of assets) map[a.post_id]?.assets.push(a);
    let list = Object.values(map);
    if (status !== "all") list = list.filter(g => g.post.status === status);
    return list.sort((a, b) => (b.post.created_at > a.post.created_at ? 1 : -1));
  }, [posts, assets, status]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const need = grouped.flatMap(g => g.assets.slice(0, 1)).filter(a => !urls[a.storage_path]);
      if (!need.length) return;
      const entries: Array<[string, string]> = [];
      for (const a of need) {
        const { data } = await supabase.storage.from("social-media").createSignedUrl(a.storage_path, 3600);
        if (data?.signedUrl) entries.push([a.storage_path, data.signedUrl]);
      }
      if (!cancelled && entries.length) setUrls(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => { cancelled = true; };
  }, [grouped, urls]);

  if (!workspaceId) return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Carregando workspace…</div>;
  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando biblioteca…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        {["all", "draft", "pending_approval", "approved", "scheduled", "published", "failed"].map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              "px-2.5 py-1 rounded-full border text-[11px] font-medium",
              status === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {s === "all" ? "Todos" : STATUS_LABEL[s] ?? s}
          </button>
        ))}
        <span className="ml-auto text-muted-foreground">{grouped.length} peças</span>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhuma peça encontrada. Crie um post no chat estratégico ou pelo botão "Novo post".
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {grouped.map(({ post, assets }) => {
            const first = assets[0];
            const url = first ? urls[first.storage_path] : null;
            return (
              <div key={post.id} className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
                <div className="aspect-square bg-muted relative">
                  {url ? (
                    <img src={url} alt={post.title ?? "peça"} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-muted-foreground">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                  )}
                  <span className={cn("absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold", STATUS_STYLES[post.status] ?? "bg-muted")}>
                    {STATUS_LABEL[post.status] ?? post.status}
                  </span>
                  {post.ai_provider && (
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-black/50 text-white text-[10px] inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> {post.ai_provider}
                    </span>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col gap-1.5">
                  <h4 className="text-sm font-semibold line-clamp-2">{post.title ?? "(sem título)"}</h4>
                  {post.copy && <p className="text-xs text-muted-foreground line-clamp-3">{post.copy}</p>}
                  <div className="mt-auto pt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{new Date(post.created_at).toLocaleDateString("pt-BR")}</span>
                    <span>{assets.length} arquivo{assets.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="pt-2 grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => openCanva.mutate(post.id)}
                      disabled={openCanva.isPending}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-border text-[10px] font-medium hover:bg-muted disabled:opacity-50"
                    >
                      {openCanva.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Palette className="w-3 h-3" />}
                      Canva
                    </button>
                    <button
                      onClick={() => importCanva.mutate(post.id)}
                      disabled={importCanva.isPending || !post.canva_design_id}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-border text-[10px] font-medium hover:bg-muted disabled:opacity-50"
                    >
                      {importCanva.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                      Importar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
