import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Palette, Link2, CheckCircle2, ExternalLink, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import {
  startCanvaOAuth, getCanvaConnectionStatus, disconnectCanva,
  openOrCreateCanvaDesign, importCanvaDesignToPost, listCanvaBrandTemplates,
} from "@/lib/canva.functions";
import { useSocialPosts } from "./useSocialPosts";

export function CanvaConnectPanel({ workspaceId }: { workspaceId: string | null }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getCanvaConnectionStatus);
  const startFn = useServerFn(startCanvaOAuth);
  const disconnectFn = useServerFn(disconnectCanva);
  const openCanvaFn = useServerFn(openOrCreateCanvaDesign);
  const importCanvaFn = useServerFn(importCanvaDesignToPost);
  const listTemplatesFn = useServerFn(listCanvaBrandTemplates);
  const postsQuery = useSocialPosts(workspaceId);
  const posts = postsQuery.data?.posts ?? [];
  const [selectedPostId, setSelectedPostId] = useState("");
  const [panelTemplateId, setPanelTemplateId] = useState("");
  const selectedPost = useMemo(
    () => posts.find((p) => p.id === (selectedPostId || posts[0]?.id)),
    [posts, selectedPostId],
  );

  const q = useQuery({
    queryKey: ["canva-connection-global"],
    queryFn: () => statusFn(),
  });

  const templateQuery = useQuery({
    queryKey: ["canva-brand-templates"],
    enabled: !!q.data && !!workspaceId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => listTemplatesFn({ data: { query: "" } }),
  });

  const connect = useMutation({
    mutationFn: async () => startFn(),
    onSuccess: (res) => {
      window.open(res.authorizeUrl, "_blank", "noopener,noreferrer");
      toast.success("Autorize no Canva na aba aberta e volte aqui.");
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao iniciar OAuth"),
  });

  const disconnect = useMutation({
    mutationFn: async () => disconnectFn(),
    onSuccess: () => {
      toast.success("Canva desconectado");
      qc.invalidateQueries({ queryKey: ["canva-connection-global"] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao desconectar"),
  });

  const openPost = useMutation({
    mutationFn: async () => openCanvaFn({
      data: { workspaceId: workspaceId!, postId: selectedPost!.id, templateId: panelTemplateId.trim() || null },
    }),
    onSuccess: (res) => {
      if (res.editUrl) window.open(res.editUrl, "_blank", "noopener,noreferrer");
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success(panelTemplateId.trim() ? "Autofill criado no Canva." : "Design aberto no Canva.");
    },
    onError: (e: Error) => toast.error(`Canva: ${e.message}`),
  });

  const importPost = useMutation({
    mutationFn: async () => importCanvaFn({ data: { workspaceId: workspaceId!, postId: selectedPost!.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success("Arte final importada do Canva.");
    },
    onError: (e: Error) => toast.error(`Importação Canva: ${e.message}`),
  });

  if (q.isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground inline-flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Verificando conexão…
      </div>
    );
  }

  const connected = !!q.data;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 grid place-items-center text-primary">
            <Palette className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold">Editor profissional (Canva)</h3>
              {connected ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium">
                  <CheckCircle2 className="w-3 h-3" /> Conectado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-medium">
                  Desconectado
                </span>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground">Conta global Vanessa Simoni</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              A conta Canva é única para toda a Vanessa Simoni (não é por cliente). Uma vez conectada, todos os workspaces
              podem gerar designs no Canva a partir dos briefings da IA, editar e devolver a arte final para
              aprovação, agendamento ou publicação.
            </p>

            <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
              <li>• Autofill de templates com dados do briefing</li>
              <li>• Adaptação de formato por canal (Feed 1080×1080, Story 1080×1920, Reels, LinkedIn, TikTok)</li>
              <li>• Arte final volta pro Vanessa Simoni e entra no fluxo de aprovação</li>
              <li>• Somente super admin pode conectar/desconectar</li>
            </ul>

            {connected && q.data?.canva_user_id && (
              <div className="mt-3 text-[11px] text-muted-foreground">
                Canva user: <code className="px-1 py-0.5 rounded bg-muted">{q.data.canva_user_id}</code>
                {q.data.expires_at && <> · expira em {new Date(q.data.expires_at).toLocaleString("pt-BR")}</>}
              </div>
            )}

            {connected && workspaceId && (
              <div className="mt-4 rounded-lg border border-border bg-background/60 p-3 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Editar post no Canva</div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto_auto] gap-2">
                  <select
                    value={selectedPost?.id ?? ""}
                    onChange={(e) => setSelectedPostId(e.target.value)}
                    disabled={!posts.length || postsQuery.isLoading}
                    className="min-w-0 rounded-md border border-border bg-background px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  >
                    {posts.length ? posts.map((p) => (
                      <option key={p.id} value={p.id}>{p.title || p.copy?.slice(0, 70) || "Post sem título"}</option>
                    )) : <option>Nenhum post neste workspace</option>}
                  </select>
                  <input
                    value={panelTemplateId}
                    onChange={(e) => setPanelTemplateId(e.target.value)}
                    list="canva-template-options-panel"
                    placeholder="Template ID"
                    className="min-w-0 rounded-md border border-border bg-background px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <datalist id="canva-template-options-panel">
                    {(templateQuery.data?.templates ?? []).map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </datalist>
                  <button
                    onClick={() => openPost.mutate()}
                    disabled={!selectedPost || openPost.isPending}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {openPost.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                    Abrir editor
                  </button>
                  <button
                    onClick={() => importPost.mutate()}
                    disabled={!selectedPost?.canva_design_id || importPost.isPending}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {importPost.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Trazer arte final
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {connected ? (
                <>
                  <button
                    onClick={() => {
                      if (confirm("Desconectar a conta Canva global? Todos os workspaces perdem a integração.")) {
                        disconnect.mutate();
                      }
                    }}
                    disabled={disconnect.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-medium hover:bg-muted disabled:opacity-60"
                  >
                    {disconnect.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Desconectar
                  </button>
                  <button
                    onClick={() => qc.invalidateQueries({ queryKey: ["canva-connection-global"] })}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-medium hover:bg-muted"
                  >
                    Atualizar status
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => connect.mutate()}
                    disabled={connect.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-60"
                  >
                    {connect.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                    Conectar Canva
                  </button>
                  <button
                    onClick={() => qc.invalidateQueries({ queryKey: ["canva-connection-global"] })}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-medium hover:bg-muted"
                  >
                    Já autorizei, verificar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-foreground/80 leading-relaxed">
        <b>Como funciona:</b> ao clicar em "Conectar Canva", abrimos a página de autorização em uma nova aba.
        Faça login na conta Canva oficial da Vanessa Simoni e autorize os escopos solicitados. Você será redirecionado para
        <code className="mx-1 px-1 py-0.5 rounded bg-muted">https://saudeslim.com.br/api/public/oauth/canva/callback</code>
        que salva a conexão e mostra a confirmação. Depois volte aqui e clique em "Já autorizei, verificar".
        <br /><br />
        <b>Importante:</b> o redirect URI acima precisa estar cadastrado exatamente igual no painel do app Canva
        (Developer Portal → seu app → Authentication → Redirect URLs).
      </div>

      {workspaceId ? null : (
        <div className="text-[11px] text-muted-foreground">Workspace atual: -</div>
      )}
    </div>
  );
}
