import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Bot,
  Calendar,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  Palette,
  Plus,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { ModuleShell, ModuleSection } from "@/components/modules/ModuleShell";
import { ModuleGate } from "@/components/billing/ModuleGate";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { AiAgentChat } from "@/components/ai-agent/AiAgentChat";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { PostCreatorDialog } from "@/components/social/PostCreatorDialog";
import { BrandContextPanel } from "@/components/social/BrandContextPanel";
import { PostEditorDialog } from "@/components/social/PostEditorDialog";
import { CampaignsDialog } from "@/components/social/CampaignsDialog";
import { SocialKpiDashboard } from "@/components/social/SocialKpiDashboard";
import { EditorialCalendarDialog } from "@/components/social/EditorialCalendarDialog";
import { MediaArtStudio } from "@/components/social/MediaArtStudio";
import { IdeasGridFinalization } from "@/components/social/IdeasGridFinalization";
import { useQueryClient } from "@tanstack/react-query";
import { useSocialPosts } from "@/components/social/useSocialPosts";
import { WeekGrid, MonthGrid, DayTimeline } from "@/components/social/CalendarViews";
import { useHasModule } from "@/hooks/use-subscription";

export const Route = createFileRoute("/modulos/social-media")({
  head: () => ({ meta: [{ title: "Social Media · Vanessa Simoni" }] }),
  component: SocialMediaAccessPage,
});

const DAYS_LONG = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type ViewMode = "dia" | "semana" | "mes";
type MainTab = "chat" | "calendario" | "ideias" | "marca";
type AiProvider = "freepik" | "recraft" | "ideogram" | "gemini";
const AI_PROVIDER_LABEL: Record<AiProvider, string> = {
  freepik: "Freepik",
  recraft: "Recraft",
  ideogram: "Ideogram",
  gemini: "Nano Banana",
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const dow = (x.getUTCDay() + 6) % 7;
  return addDays(x, -dow);
}

function SocialMediaAccessPage() {
  const kpis = useHasModule("social_kpis_read");
  const calendar = useHasModule("social_calendar");
  const full = useHasModule("social_media_ia");
  if (kpis.loading || calendar.loading || full.loading) return null;
  if (!kpis.hasAccess && !calendar.hasAccess && !full.hasAccess) {
    return <ModuleGate module="social_kpis_read"><span /></ModuleGate>;
  }
  if (kpis.hasAccess && !calendar.hasAccess && !full.hasAccess) return <SocialMediaKpiOnlyPage />;
  return <SocialMediaPage fullAccess={full.hasAccess} />;
}

function SocialMediaKpiOnlyPage() {
  const [wsId, setWsId] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase.from("profiles").select("current_workspace_id").eq("id", u.user.id).maybeSingle();
      setWsId(prof?.current_workspace_id ?? null);
    })();
  }, []);
  return (
    <ModuleShell icon={Share2} tag="SOCIAL MEDIA" status="leitura">
      <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
        Seu plano Growth inclui os KPIs do Social Media em modo leitura. Criação, calendário, agendamento e IA ficam disponíveis nos planos superiores.
      </div>
      <SocialKpiDashboard workspaceId={wsId} />
    </ModuleShell>
  );
}

function SocialMediaPage({ fullAccess }: { fullAccess: boolean }) {
  const today = useMemo(() => new Date(), []);
  const navigate = useNavigate();
  const [wsId, setWsId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "mes";
    const saved = localStorage.getItem("social_view") as ViewMode | null;
    return saved === "dia" || saved === "semana" || saved === "mes" ? saved : "mes";
  });
  const [cursor, setCursor] = useState<Date>(today);
  const [tab, setTab] = useState<MainTab>("calendario");
  const [ai, setAi] = useState<AiProvider>(() => {
    if (typeof window === "undefined") return "ideogram";
    const saved = localStorage.getItem("social_ai_provider") as AiProvider | null;
    return saved && ["ideogram", "recraft", "freepik", "gemini"].includes(saved) ? saved : "ideogram";
  });
  const changeAi = (p: AiProvider) => {
    if (!fullAccess) return;
    setAi(p);
    if (typeof window !== "undefined") localStorage.setItem("social_ai_provider", p);
  };

  const [chatOpen, setChatOpen] = useState(false);
  const [chatSheetOpen, setChatSheetOpen] = useState(false);
  const [newPostOpen, setNewPostOpen] = useState(false);
  const [newPostAt, setNewPostAt] = useState<Date | null>(null);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [ideaPrefill, setIdeaPrefill] = useState<string | null>(null);
  const [editorialOpen, setEditorialOpen] = useState(false);
  const queryClient = useQueryClient();
  const socialPostsData = useSocialPosts(wsId);
  const editingPost = useMemo(
    () => socialPostsData.data?.posts.find((post) => post.id === editingPostId) ?? null,
    [socialPostsData.data, editingPostId],
  );
  const editingAssets = useMemo(
    () => (socialPostsData.data?.assets ?? []).filter((asset) => asset.post_id === editingPostId),
    [socialPostsData.data, editingPostId],
  );

  useEffect(() => {
    if (!fullAccess && tab !== "calendario") setTab("calendario");
  }, [fullAccess, tab]);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("current_workspace_id")
        .eq("id", u.user.id)
        .maybeSingle();
      setWsId(prof?.current_workspace_id ?? null);
    })();
  }, []);

  const changeView = (v: ViewMode) => {
    setView(v);
    if (typeof window !== "undefined") localStorage.setItem("social_view", v);
  };
  const goPrev = () => setCursor(
    view === "dia"
      ? addDays(cursor, -1)
      : view === "semana"
        ? addDays(cursor, -7)
        : (() => {
            const x = new Date(cursor);
            x.setUTCMonth(x.getUTCMonth() - 1);
            return x;
          })(),
  );
  const goNext = () => setCursor(
    view === "dia"
      ? addDays(cursor, 1)
      : view === "semana"
        ? addDays(cursor, 7)
        : (() => {
            const x = new Date(cursor);
            x.setUTCMonth(x.getUTCMonth() + 1);
            return x;
          })(),
  );

  const openCreateAt = (d: Date) => {
    const isToday = d.getUTCFullYear() === today.getUTCFullYear()
      && d.getUTCMonth() === today.getUTCMonth()
      && d.getUTCDate() === today.getUTCDate();
    const target = new Date(d);
    if (!isToday) target.setHours(10, 0, 0, 0);
    setNewPostAt(target);
    setIdeaPrefill(null);
    setNewPostOpen(true);
  };
  const drillDay = (d: Date) => {
    changeView("dia");
    setCursor(d);
  };

  const label = useMemo(() => {
    if (view === "dia") {
      const d = cursor;
      return `${DAYS_LONG[(d.getUTCDay() + 6) % 7]}, ${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
    }
    if (view === "semana") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return `${s.getUTCDate()}, ${e.getUTCDate()} ${MESES[e.getUTCMonth()].slice(0, 3)} ${e.getUTCFullYear()}`;
    }
    return `${MESES[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`;
  }, [view, cursor]);

  const headerActions = fullAccess ? (
    <button
      onClick={() => setChatSheetOpen(true)}
      className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-background text-xs font-medium hover:bg-muted"
      title="Abrir chat da IA"
    >
      <MessageSquare className="w-3.5 h-3.5" />
    </button>
  ) : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex gap-4">
        <div className={cn("min-w-0 flex-1", fullAccess && chatOpen && "lg:pr-0")}>
          <ModuleShell icon={Share2} tag="CONTEÚDO" status="ativo" actions={headerActions}>
            {!fullAccess && (
              <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                Seu plano inclui o calendário do Social Media em modo manual. Agendamento e legendas continuam disponíveis sem depender de configuração de IA.
              </div>
            )}

            <Tabs value={tab} onValueChange={(value) => fullAccess ? setTab(value as MainTab) : setTab("calendario")}>
              <TabsList className="flex flex-wrap h-auto justify-start bg-muted/40 items-center gap-1">
                <TabsTrigger value="calendario" className="text-xs">
                  <Calendar className="w-3.5 h-3.5 mr-1.5" /> Calendário
                </TabsTrigger>
                {fullAccess && (
                  <>
                    <TabsTrigger value="ideias" className="text-xs">
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Banco de ideias
                    </TabsTrigger>
                    <TabsTrigger value="marca" className="text-xs">
                      <Palette className="w-3.5 h-3.5 mr-1.5" /> Marca
                    </TabsTrigger>
                    <button
                      onClick={() => navigate({ to: "/modulos/social-campanhas" })}
                      className="inline-flex items-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all hover:bg-background/60 hover:text-foreground text-muted-foreground"
                    >
                      <Megaphone className="w-3.5 h-3.5 mr-1.5" /> Campanha orgânica
                    </button>
                    <button
                      onClick={() => navigate({ to: "/modulos/social-novo-post" })}
                      className="inline-flex items-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all hover:bg-background/60 hover:text-foreground text-muted-foreground"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" /> Novo post
                    </button>
                    <TabsTrigger value="chat" className="text-xs">
                      <MessagesSquare className="w-3.5 h-3.5 mr-1.5" /> Chat mídia
                    </TabsTrigger>
                  </>
                )}
              </TabsList>

              {fullAccess && (
                <TabsContent value="chat" className="mt-3">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="h-[calc(100vh-300px)] min-h-[520px]">
            {wsId ? (
              <AiAgentChat workspaceId={wsId} module="social_media" fullscreen />
            ) : (
              <div className="p-6 text-xs text-muted-foreground">Carregando workspace…</div>
            )}
          </div>
          <MediaArtStudio workspaceId={wsId} compact />
        </div>
      </TabsContent>
              )}

              <TabsContent value="calendario" className="mt-3">
                {fullAccess && <SocialKpiDashboard workspaceId={wsId} />}
                <ModuleSection
                  title="Calendário editorial"
                  description={view === "dia" ? "Publicações do dia por horário." : view === "semana" ? "Semana atual · arraste para reagendar." : "Visão mensal · clique num dia para detalhes."}
                  right={
                    <div className="flex items-center gap-2 flex-wrap">
                      {fullAccess && (
                        <button
                          onClick={() => setEditorialOpen(true)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-[11px] font-semibold hover:opacity-90"
                          title="Gerar calendário editorial do mês com IA"
                        >
                          <CalendarCheck className="w-3.5 h-3.5" /> Planejar mês
                        </button>
                      )}
                      <div className="inline-flex rounded-md border border-border overflow-hidden text-[11px]">
                        {(["dia", "semana", "mes"] as ViewMode[]).map((v) => (
                          <button
                            key={v}
                            onClick={() => changeView(v)}
                            className={cn(
                              "px-2.5 py-1 font-medium uppercase tracking-wider",
                              view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {v === "mes" ? "Mês" : v === "dia" ? "Dia" : "Semana"}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button onClick={goPrev} className="w-7 h-7 grid place-items-center rounded-md hover:bg-muted"><ChevronLeft className="w-3.5 h-3.5" /></button>
                        <button onClick={goNext} className="w-7 h-7 grid place-items-center rounded-md hover:bg-muted"><ChevronRight className="w-3.5 h-3.5" /></button>
                      </div>
                      <span className="text-xs font-semibold capitalize">{label}</span>
                    </div>
                  }
                >
                  {view === "dia" ? (
                    <DayTimeline cursor={cursor} workspaceId={wsId} onOpen={setEditingPostId} onCreateAt={openCreateAt} />
                  ) : view === "semana" ? (
                    <WeekGrid cursor={cursor} today={today} workspaceId={wsId} onOpen={setEditingPostId} onCreateAt={openCreateAt} />
                  ) : (
                    <MonthGrid cursor={cursor} today={today} workspaceId={wsId} onOpen={setEditingPostId} onCreateAt={openCreateAt} onDrillDay={drillDay} />
                  )}
                </ModuleSection>
              </TabsContent>

              {fullAccess && (
                <>
                  <TabsContent value="ideias" className="mt-3">
                    <ModuleSection title="Banco de ideias" description="Sugestões geradas para o seu nicho. Clique em Usar para abrir o criador já preenchido.">
                      <IdeasGridFinalization
                        workspaceId={wsId}
                        onUse={(idea) => {
                          const tags = idea.hashtags?.length ? `\n\n${idea.hashtags.join(" ")}` : "";
                          const pinned = idea.pinned_comment ? `\n\n---\n💬 Comentário fixado:\n${idea.pinned_comment}` : "";
                          const seed = `${idea.caption || idea.title}${tags}${pinned}`.trim();
                          setIdeaPrefill(seed || null);
                          setNewPostOpen(true);
                        }}
                      />
                    </ModuleSection>
                  </TabsContent>
                  <TabsContent value="marca" className="mt-3">
                    <ModuleSection title="Contexto da Marca" description="Alimente o agente estratégico com tudo que ele precisa saber sobre a sua marca. Persistente por workspace.">
                      <BrandContextPanel workspaceId={wsId} />
                    </ModuleSection>
                  </TabsContent>
                </>
              )}
            </Tabs>
          </ModuleShell>
        </div>

        {fullAccess && chatOpen && tab !== "chat" && (
          <aside className="hidden lg:flex sticky top-4 self-start h-[calc(100vh-2rem)] w-[380px] shrink-0 rounded-xl border border-border bg-card overflow-hidden flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2 text-xs font-semibold"><Bot className="w-3.5 h-3.5 text-primary" /> Chat mídia</div>
              <button onClick={() => setChatOpen(false)} className="w-6 h-6 grid place-items-center rounded-md hover:bg-muted text-muted-foreground" title="Fechar chat">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {wsId ? <div className="h-full overflow-hidden"><AiAgentChat workspaceId={wsId} module="social_media" fullscreen /></div> : <div className="p-6 text-xs text-muted-foreground">Carregando workspace…</div>}
            </div>
          </aside>
        )}

        {fullAccess && !chatOpen && tab !== "chat" && (
          <button onClick={() => setChatOpen(true)} className="hidden lg:flex fixed right-4 bottom-4 z-40 items-center gap-2 px-3 py-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 text-xs font-medium">
            <MessageSquare className="w-3.5 h-3.5" /> Abrir chat
          </button>
        )}

        {fullAccess && (
          <Sheet open={chatSheetOpen} onOpenChange={setChatSheetOpen}>
            <SheetContent side="right" className="p-0 w-full sm:max-w-md">
              <SheetHeader className="px-4 py-3 border-b border-border">
                <SheetTitle className="flex items-center gap-2 text-sm"><Bot className="w-4 h-4 text-primary" /> Chat mídia</SheetTitle>
              </SheetHeader>
              <div className="h-[calc(100vh-56px)]">{wsId && <AiAgentChat workspaceId={wsId} module="social_media" fullscreen />}</div>
            </SheetContent>
          </Sheet>
        )}

        <PostCreatorDialog
          open={newPostOpen}
          onClose={() => {
            setNewPostOpen(false);
            setIdeaPrefill(null);
            setNewPostAt(null);
          }}
          workspaceId={wsId}
          provider={ai}
          initialRequest={fullAccess ? ideaPrefill : null}
          initialScheduledAt={newPostAt}
        />
        <PostEditorDialog
          open={!!editingPostId && !!editingPost}
          onClose={() => setEditingPostId(null)}
          workspaceId={wsId}
          post={editingPost}
          initialAssets={editingAssets}
          provider={ai}
        />

        {fullAccess && (
          <>
            <CampaignsDialog open={campaignOpen} onClose={() => setCampaignOpen(false)} workspaceId={wsId} />
            <EditorialCalendarDialog
              open={editorialOpen}
              onClose={() => setEditorialOpen(false)}
              workspaceId={wsId}
              year={cursor.getUTCFullYear()}
              month={cursor.getUTCMonth()}
              onCreated={() => queryClient.invalidateQueries({ queryKey: ["social-posts", wsId] })}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

function AiProviderToggle({ value, onChange }: { value: AiProvider; onChange: (p: AiProvider) => void }) {
  const options: AiProvider[] = ["freepik", "recraft", "ideogram", "gemini"];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex items-center rounded-md border border-border overflow-hidden text-[10px]">
          {options.map((p) => (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={cn(
                "px-2 py-1.5 font-semibold uppercase tracking-wider transition-colors",
                value === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {AI_PROVIDER_LABEL[p]}
            </button>
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-xs max-w-[260px]">
        Motor de IA para gerar as artes: Freepik, Recraft, Ideogram ou Nano Banana. Conecte a chave do escolhido em Integrações.
      </TooltipContent>
    </Tooltip>
  );
}
