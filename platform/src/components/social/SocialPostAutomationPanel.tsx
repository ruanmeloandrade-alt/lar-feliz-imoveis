import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Send, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  deleteSocialPostAutomation,
  listSocialPostAutomations,
  saveSocialPostAutomation,
} from "@/lib/social-post-automations.functions";

const EMPTY = {
  enabled: true,
  matchMode: "any" as "any" | "contains" | "equals",
  keywords: "",
  commentReplyEnabled: true,
  commentReplyText: "",
  dmReplyEnabled: false,
  dmReplyText: "",
};

type EditorState = typeof EMPTY;

type PostRow = {
  id: string;
  title?: string | null;
  copy?: string | null;
  status?: string | null;
  scheduled_at?: string | null;
  published_at?: string | null;
};

type AutomationRow = {
  id: string;
  post_id: string;
  enabled: boolean;
  match_mode: "any" | "contains" | "equals";
  keywords?: string[] | null;
  comment_reply_enabled: boolean;
  comment_reply_text?: string | null;
  dm_reply_enabled: boolean;
  dm_reply_text?: string | null;
};

export function SocialPostAutomationPanel({ workspaceId }: { workspaceId: string | null }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSocialPostAutomations);
  const saveFn = useServerFn(saveSocialPostAutomation);
  const deleteFn = useServerFn(deleteSocialPostAutomation);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [form, setForm] = useState<EditorState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["social-post-automations", workspaceId],
    queryFn: () => listFn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    staleTime: 15_000,
  });

  const posts = ((query.data?.posts ?? []) as unknown as PostRow[]).filter((post) =>
    ["draft", "pending_approval", "approved", "scheduled", "publishing", "published"].includes(post.status ?? ""),
  );
  const automations = (query.data?.automations ?? []) as unknown as AutomationRow[];
  const byPost = useMemo(() => new Map(automations.map((item) => [item.post_id, item])), [automations]);

  useEffect(() => {
    if (!editingPostId) return;
    const current = byPost.get(editingPostId);
    if (!current) {
      setForm(EMPTY);
      return;
    }
    setForm({
      enabled: current.enabled,
      matchMode: current.match_mode,
      keywords: (current.keywords ?? []).join(", "),
      commentReplyEnabled: current.comment_reply_enabled,
      commentReplyText: current.comment_reply_text ?? "",
      dmReplyEnabled: current.dm_reply_enabled,
      dmReplyText: current.dm_reply_text ?? "",
    });
  }, [editingPostId, byPost]);

  if (!workspaceId) return null;

  const save = async () => {
    if (!editingPostId) return;
    setSaving(true);
    try {
      await saveFn({
        data: {
          workspaceId,
          postId: editingPostId,
          enabled: form.enabled,
          matchMode: form.matchMode,
          keywords: form.keywords.split(/[,\n]/).map((item) => item.trim()).filter(Boolean),
          commentReplyEnabled: form.commentReplyEnabled,
          commentReplyText: form.commentReplyText || null,
          dmReplyEnabled: form.dmReplyEnabled,
          dmReplyText: form.dmReplyText || null,
        },
      });
      toast.success("Automação do post salva.");
      setEditingPostId(null);
      await qc.invalidateQueries({ queryKey: ["social-post-automations", workspaceId] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (postId: string) => {
    if (!confirm("Remover a automação deste post?")) return;
    try {
      await deleteFn({ data: { workspaceId, postId } });
      toast.success("Automação removida.");
      await qc.invalidateQueries({ queryKey: ["social-post-automations", workspaceId] });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <section className="mt-4 rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-primary" /> Automações dos posts</div>
          <p className="mt-1 text-[11px] text-muted-foreground">Quando alguém comentar no post publicado, responda no comentário, envie mensagem privada ou faça as duas ações. A regra usa o ID real do post na Meta.</p>
        </div>
        {query.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {query.data?.migrationRequired ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">A migration de automações ainda precisa ser aplicada no banco desta instalação.</div>
      ) : posts.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Os posts gerados/agendados da campanha aparecerão aqui para receber automação.</div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => {
            const automation = byPost.get(post.id);
            const isEditing = editingPostId === post.id;
            return (
              <div key={post.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{post.title || post.copy?.slice(0, 80) || "Post sem título"}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{post.status ?? "draft"}{post.scheduled_at ? ` · ${new Date(post.scheduled_at).toLocaleString("pt-BR")}` : ""}</div>
                  </div>
                  {automation && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600">Automação ativa</span>}
                  <button type="button" onClick={() => setEditingPostId(isEditing ? null : post.id)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted">
                    <Zap className="h-3 w-3" /> {automation ? "Editar automação" : "Adicionar automação"}
                  </button>
                  {automation && <button type="button" onClick={() => void remove(post.id)} className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>}
                </div>

                {isEditing && (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                      <label className="text-[11px] font-medium">Gatilho
                        <select value={form.matchMode} onChange={(e) => setForm((old) => ({ ...old, matchMode: e.target.value as EditorState["matchMode"] }))} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-xs">
                          <option value="any">Qualquer comentário</option>
                          <option value="contains">Comentário contém</option>
                          <option value="equals">Comentário é exatamente</option>
                        </select>
                      </label>
                      {form.matchMode !== "any" && <label className="text-[11px] font-medium">Palavras-chave
                        <input value={form.keywords} onChange={(e) => setForm((old) => ({ ...old, keywords: e.target.value }))} placeholder="quero, preço, link" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-xs" />
                      </label>}
                    </div>

                    <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={form.commentReplyEnabled} onChange={(e) => setForm((old) => ({ ...old, commentReplyEnabled: e.target.checked }))} /><MessageCircle className="h-3.5 w-3.5" /> Responder no comentário</label>
                    {form.commentReplyEnabled && <textarea rows={2} value={form.commentReplyText} onChange={(e) => setForm((old) => ({ ...old, commentReplyText: e.target.value }))} placeholder="Ex: Te enviei os detalhes no privado." className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs" />}

                    <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={form.dmReplyEnabled} onChange={(e) => setForm((old) => ({ ...old, dmReplyEnabled: e.target.checked }))} /><Send className="h-3.5 w-3.5" /> Enviar mensagem privada</label>
                    {form.dmReplyEnabled && <textarea rows={3} value={form.dmReplyText} onChange={(e) => setForm((old) => ({ ...old, dmReplyText: e.target.value }))} placeholder="Mensagem que será enviada no privado." className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs" />}

                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingPostId(null)} className="rounded-md border border-border px-3 py-1.5 text-[11px] hover:bg-muted">Cancelar</button>
                      <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50">{saving && <Loader2 className="h-3 w-3 animate-spin" />} Salvar automação</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
