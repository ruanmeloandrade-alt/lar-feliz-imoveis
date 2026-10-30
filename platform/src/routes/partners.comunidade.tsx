import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, ShieldCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/partners/comunidade")({
  head: () => ({ meta: [{ title: "Comunidade · Vanessa Simoni Partners" }] }),
  component: PartnersCommunityPage,
});

type ProgramRole = "affiliate" | "partner";
type AccessState = "loading" | "ready" | "denied";
type CommunityPost = { id: string; author_role: ProgramRole; audience: "all" | ProgramRole; body: string; created_at: string };
type CommunityComment = { id: string; post_id: string; author_role: ProgramRole; body: string; created_at: string };

function PartnersCommunityPage() {
  const [access, setAccess] = useState<AccessState>("loading");
  const [roles, setRoles] = useState<ProgramRole[]>([]);
  const [activeRole, setActiveRole] = useState<ProgramRole>("affiliate");
  const [isAdmin, setIsAdmin] = useState(false);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | ProgramRole>("all");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loadingFeed, setLoadingFeed] = useState(false);

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    try {
      const { data: postRows, error: postError } = await (supabase as any)
        .from("partner_program_community_posts")
        .select("id,author_role,audience,body,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (postError) throw postError;
      const visiblePosts = (postRows ?? []) as CommunityPost[];
      setPosts(visiblePosts);
      if (!visiblePosts.length) { setComments([]); return; }
      const { data: commentRows, error: commentError } = await (supabase as any)
        .from("partner_program_community_comments")
        .select("id,post_id,author_role,body,created_at")
        .in("post_id", visiblePosts.map((post) => post.id))
        .order("created_at", { ascending: true });
      if (commentError) throw commentError;
      setComments((commentRows ?? []) as CommunityComment[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar a comunidade.");
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId || !alive) return setAccess("denied");
      const [{ data: roleRows, error: roleError }, { data: adminFlag }] = await Promise.all([
        (supabase as any).from("partner_program_roles").select("role,status").eq("user_id", userId).in("role", ["affiliate", "partner"]),
        (supabase as any).rpc("partner_program_is_admin", { _user_id: userId }),
      ]);
      if (!alive || roleError) return setAccess("denied");
      const availableRoles = ((roleRows ?? []) as Array<{ role: ProgramRole; status: string }>)
        .filter((item) => item.status === "pending" || item.status === "approved")
        .map((item) => item.role);
      const admin = adminFlag === true;
      setIsAdmin(admin);
      setRoles(availableRoles);
      if (availableRoles[0]) setActiveRole(availableRoles[0]);
      if (!admin && availableRoles.length === 0) return setAccess("denied");
      for (const role of availableRoles) {
        const { error } = await (supabase as any).rpc("partner_program_join_community", { p_role: role });
        if (error) {
          toast.error(`Não foi possível ativar sua participação como ${role === "partner" ? "Partner" : "Afiliado"}.`);
          return setAccess("denied");
        }
      }
      if (!alive) return;
      setAccess("ready");
      await loadFeed();
    })();
    return () => { alive = false; };
  }, [loadFeed]);

  useEffect(() => {
    if (audience !== "all" && audience !== activeRole) setAudience("all");
  }, [activeRole, audience]);

  const commentsByPost = useMemo(() => {
    const grouped: Record<string, CommunityComment[]> = {};
    for (const comment of comments) (grouped[comment.post_id] ??= []).push(comment);
    return grouped;
  }, [comments]);

  async function createPost(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim() || !roles.includes(activeRole)) return;
    setSaving(true);
    const { error } = await (supabase as any).rpc("partner_program_create_community_post", { p_role: activeRole, p_audience: audience, p_body: body.trim() });
    setSaving(false);
    if (error) return toast.error(error.message || "Não foi possível publicar.");
    setBody("");
    await loadFeed();
  }

  async function createComment(postId: string) {
    const text = commentDrafts[postId]?.trim();
    if (!text || !roles.includes(activeRole)) return;
    const { error } = await (supabase as any).rpc("partner_program_create_community_comment", { p_post_id: postId, p_role: activeRole, p_body: text });
    if (error) return toast.error(error.message || "Não foi possível comentar.");
    setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    await loadFeed();
  }

  async function hidePost(postId: string) {
    const reason = window.prompt("Motivo da moderação:")?.trim();
    if (!reason) return;
    const { error } = await (supabase as any).rpc("partner_program_moderate_community_content", { p_entity: "post", p_id: postId, p_status: "hidden", p_reason: reason });
    if (error) return toast.error(error.message || "Não foi possível moderar o post.");
    await loadFeed();
  }

  if (access === "loading") return <CommunityState text="Carregando sua comunidade..." />;
  if (access === "denied") return <CommunityState text="Esta conta ainda não possui acesso ao programa Partners." />;

  return <main className="min-h-screen bg-slate-50 p-4 text-slate-950 md:p-6"><div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div><div className="flex items-center gap-2 text-violet-600"><UsersRound className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-widest">Vanessa Simoni Partners</span></div><h1 className="mt-2 text-3xl font-black">Comunidade Partners</h1><p className="mt-2 text-sm leading-6 text-slate-500">Afiliados e Partners podem participar desde o cadastro. Aprovação comercial é necessária apenas para links e benefícios comerciais.</p></div>
      <div className="flex gap-2"><Link to="/contas" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Áreas e contas</Link>{isAdmin ? <span className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800"><ShieldCheck className="h-4 w-4" /> Moderação</span> : null}</div>
    </header>

    {roles.length > 0 ? <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-center gap-2">{roles.map((role) => <button key={role} type="button" onClick={() => setActiveRole(role)} className={`rounded-xl px-4 py-2 text-sm font-black ${activeRole === role ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>Publicar como {role === "partner" ? "Partner" : "Afiliado"}</button>)}</div>
      <form onSubmit={createPost} className="mt-4"><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} maxLength={5000} placeholder="Compartilhe uma dúvida, aprendizado, resultado ou aviso para a comunidade..." className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-violet-400" /><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><label className="text-sm font-semibold text-slate-600">Canal <select value={audience} onChange={(event) => setAudience(event.target.value as "all" | ProgramRole)} className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><option value="all">Todos</option><option value={activeRole}>{activeRole === "partner" ? "Partners" : "Afiliados"}</option></select></label><button disabled={saving || !body.trim()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Send className="h-4 w-4" /> {saving ? "Publicando..." : "Publicar"}</button></div></form>
    </section> : null}

    <section className="space-y-4">{loadingFeed ? <div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-500">Atualizando feed...</div> : null}{!loadingFeed && posts.length === 0 ? <div className="rounded-3xl border border-dashed bg-white p-10 text-center"><p className="font-black">A comunidade está vazia por enquanto.</p><p className="mt-2 text-sm text-slate-500">Nenhum conteúdo fictício foi inserido.</p></div> : null}{posts.map((post) => <article key={post.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black">{post.author_role === "partner" ? "Partner" : "Afiliado"}</span><span className="text-xs text-slate-400">{post.audience === "all" ? "Todos" : post.audience === "partner" ? "Canal Partners" : "Canal Afiliados"}</span></div><p className="mt-2 text-xs text-slate-400">{formatDate(post.created_at)}</p></div>{isAdmin ? <button type="button" onClick={() => void hidePost(post.id)} className="text-xs font-bold text-rose-600">Ocultar</button> : null}</div><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{post.body}</p><div className="mt-5 border-t border-slate-100 pt-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400"><MessageCircle className="h-4 w-4" /> Comentários · {commentsByPost[post.id]?.length ?? 0}</div><div className="mt-3 space-y-2">{(commentsByPost[post.id] ?? []).map((comment) => <div key={comment.id} className="rounded-2xl bg-slate-50 px-4 py-3"><div className="flex items-center gap-2"><span className="text-xs font-black">{comment.author_role === "partner" ? "Partner" : "Afiliado"}</span><span className="text-[11px] text-slate-400">{formatDate(comment.created_at)}</span></div><p className="mt-1 text-sm leading-6 text-slate-600">{comment.body}</p></div>)}</div>{roles.includes(activeRole) ? <div className="mt-3 flex gap-2"><input value={commentDrafts[post.id] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} maxLength={2000} placeholder="Escreva um comentário" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" /><button type="button" onClick={() => void createComment(post.id)} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Enviar</button></div> : null}</div></article>)}</section>
  </div></main>;
}

function CommunityState({ text }: { text: string }) { return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-xl rounded-3xl border bg-white p-8"><h1 className="text-2xl font-black">Comunidade Partners</h1><p className="mt-3 text-sm text-slate-600">{text}</p><Link to="/contas" className="mt-5 inline-block font-bold text-violet-600">Voltar ao seletor</Link></div></main>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
