import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { AiAgentChat } from "@/components/ai-agent/AiAgentChat";
import {
  listCrmAgents,
  saveCrmAgentConfig,
  deleteCrmAgent,
  DEFAULT_CRM_AGENT_CONFIG,
  type CrmAgentConfig,
  type CrmAgentTask,
} from "@/lib/crm-agent.functions";
import {
  Bot,
  Clock,
  Copy,
  Eye,
  FileBarChart,
  Lightbulb,
  Zap,
  MessageSquare,
  Power,
  Save,
  Shield,
  Loader2,
  X,
  Plus,
  Search,
  Trash2,
  GitBranch,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/crm/agente-ia")({
  head: () => ({
    meta: [
      { title: "Agente IA · CRM · Vanessa Simoni" },
      {
        name: "description",
        content:
          "Crie, duplique e configure agentes de IA que administram seu funil de vendas: horários, autonomia, tarefas e regras próprias.",
      },
      { property: "og:title", content: "Agente IA do CRM · Vanessa Simoni" },
      {
        property: "og:description",
        content: "Um agente que lê seu funil, explica o que está acontecendo e opera dentro das suas regras.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgenteIaPage,
});

/** Teto de caracteres das regras livres: acima disso a IA perde contexto. */
const RULES_MAX = 2000;

const AUTONOMY_OPTIONS = [
  {
    id: "leitura" as const,
    icon: Eye,
    label: "Só ler",
    desc: "Observa o CRM e responde quando perguntado. Não gera relatório nem age.",
  },
  {
    id: "sugestao" as const,
    icon: Lightbulb,
    label: "Ler e sugerir ação",
    desc: "Aponta o problema e propõe a ação, mas só executa com sua aprovação.",
  },
  {
    id: "automatico" as const,
    icon: Zap,
    label: "Automático",
    desc: "Opera o CRM sozinho dentro das regras, horários e limites configurados.",
  },
];

const DAYS = [
  { v: 1, l: "Seg" },
  { v: 2, l: "Ter" },
  { v: 3, l: "Qua" },
  { v: 4, l: "Qui" },
  { v: 5, l: "Sex" },
  { v: 6, l: "Sáb" },
  { v: 0, l: "Dom" },
];

const TASKS: Array<{ id: CrmAgentTask; label: string; desc: string; needsAction?: boolean }> = [
  { id: "leads_parados", label: "Leads parados", desc: "Detecta quem está travado na mesma etapa." },
  { id: "follow_up", label: "Follow-up", desc: "Cobra contato de leads sem interação." },
  { id: "sem_resposta", label: "Sem resposta", desc: "Aponta conversas que o time deixou no vácuo." },
  { id: "alerta_sla", label: "Alerta de SLA", desc: "Avisa quando o tempo de resposta estoura." },
  { id: "qualificacao", label: "Qualificação", desc: "Analisa leads novos e classifica o potencial." },
  { id: "higienizacao", label: "Higienização", desc: "Sinaliza dados faltando e leads frios." },
  { id: "detectar_duplicados", label: "Duplicados", desc: "Encontra o mesmo lead cadastrado duas vezes." },
  { id: "mover_etapa", label: "Mover etapa", desc: "Move o lead quando o critério for atendido.", needsAction: true },
  { id: "criar_tarefa", label: "Criar tarefa", desc: "Abre tarefa para o responsável.", needsAction: true },
  { id: "registrar_nota", label: "Registrar nota", desc: "Escreve o contexto no histórico do lead.", needsAction: true },
];

const REPORT_CHANNELS = [
  { id: "painel", label: "Painel" },
  { id: "email", label: "E-mail" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "inbox", label: "Inbox" },
] as const;

const RULE_EXAMPLES = [
  "Lead sem resposta em 48h volta para a etapa Contato.",
  "Nunca marcar como perdido sem 3 tentativas registradas.",
  "Lead acima de R$ 5.000 sempre para o Bruno.",
  "Nada de mover lead na sexta depois das 17h.",
];

function isAlwaysOn(f: CrmAgentConfig) {
  return f.startTime === "00:00" && (f.endTime === "23:59" || f.endTime === "00:00") && f.activeDays.length === 7;
}

function Section({
  icon: Icon,
  title,
  desc,
  children,
  right,
}: {
  icon: any;
  title: string;
  desc?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-border bg-muted/30">
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0 mt-0.5">
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">{title}</div>
            {desc && <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xl leading-relaxed">{desc}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function AgenteIaPage() {
  const qc = useQueryClient();
  const listAgents = useServerFn(listCrmAgents);
  const saveConfig = useServerFn(saveCrmAgentConfig);
  const removeAgent = useServerFn(deleteCrmAgent);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [search, setSearch] = useState("");
  /** Agente aberto no editor. `null` + draft = agente novo ainda não salvo. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CrmAgentConfig>(DEFAULT_CRM_AGENT_CONFIG);
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("current_workspace_id")
        .eq("id", u.user.id)
        .maybeSingle();
      setWorkspaceId(p?.current_workspace_id ?? null);
    })();
  }, []);

  const agentsQ = useQuery({
    queryKey: ["crm-agents", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listAgents({ data: { workspaceId: workspaceId! } }),
  });
  const agents = agentsQ.data ?? [];

  const pipelinesQ = useQuery({
    queryKey: ["crm-agent-pipelines", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("id,name,position")
        .eq("workspace_id", workspaceId!)
        .order("position");
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const pipelines = pipelinesQ.data ?? [];

  // Abre o primeiro agente uma única vez. Depois disso a seleção é sempre
  // manual, para o editor nunca sobrescrever o que o usuário está mexendo.
  useEffect(() => {
    if (bootstrapped || !agentsQ.data) return;
    setBootstrapped(true);
    const first = agentsQ.data[0];
    if (first) {
      setEditingId(first.id);
      setForm(first);
    } else {
      setEditingId(null);
      setForm({ ...DEFAULT_CRM_AGENT_CONFIG, name: "Gestor geral" });
    }
  }, [agentsQ.data, bootstrapped]);

  // Abertura direta vinda do gatilho do CRM: ?agente=<id> edita, ?novo=1 cria.
  const [deepLinkDone, setDeepLinkDone] = useState(false);
  useEffect(() => {
    if (deepLinkDone || typeof window === "undefined" || !agentsQ.data) return;
    const params = new URLSearchParams(window.location.search);
    const agentParam = params.get("agente");
    const novo = params.get("novo") === "1";
    if (!agentParam && !novo) return;
    setDeepLinkDone(true);
    setBootstrapped(true);
    if (agentParam) {
      const found = agentsQ.data.find((a) => a.id === agentParam);
      if (found) {
        setEditingId(found.id);
        setForm(found);
      }
    } else if (novo) {
      setEditingId(null);
      setForm({ ...DEFAULT_CRM_AGENT_CONFIG, name: "Novo agente" });
      setDirty(true);
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("agente");
    url.searchParams.delete("novo");
    window.history.replaceState({}, "", url.toString());
  }, [agentsQ.data, deepLinkDone]);

  const patch = (p: Partial<CrmAgentConfig>) => {
    setForm((f) => ({ ...f, ...p }));
    setDirty(true);
  };

  const saveM = useMutation({
    mutationFn: (override?: Partial<CrmAgentConfig>) => {
      const payload = { ...form, ...(override ?? {}) };
      return saveConfig({
        data: { workspaceId: workspaceId!, ...payload, id: payload.id ?? undefined },
      });
    },
    onSuccess: (res: { id: string }) => {
      toast.success("Agente salvo.");
      setEditingId(res.id);
      setForm((f) => ({ ...f, id: res.id }));
      setDirty(false);
      setLastSaved(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      qc.invalidateQueries({ queryKey: ["crm-agents", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-save a cada 2 minutos se houver alterações
  useEffect(() => {
    if (!dirty || !workspaceId || saveM.isPending) return;
    const timer = setTimeout(() => {
      saveM.mutate(undefined);
    }, 120000); // 2 minutos
    return () => clearTimeout(timer);
  }, [dirty, workspaceId, saveM]);

  const deleteM = useMutation({
    mutationFn: (id: string) => removeAgent({ data: { workspaceId: workspaceId!, id } }),
    onSuccess: (_r, id) => {
      toast.success("Agente removido.");
      qc.invalidateQueries({ queryKey: ["crm-agents", workspaceId] });
      if (id === editingId) {
        const next = agents.find((a) => a.id !== id) ?? null;
        if (next) {
          setEditingId(next.id);
          setForm(next);
        } else {
          setEditingId(null);
          setForm({ ...DEFAULT_CRM_AGENT_CONFIG, name: "Gestor geral" });
        }
        setDirty(false);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateM = useMutation({
    mutationFn: (a: CrmAgentConfig) =>
      saveConfig({
        data: {
          workspaceId: workspaceId!,
          ...a,
          id: undefined,
          name: `${a.name} (cópia)`.slice(0, 120),
          // A cópia nasce desligada para não brigar por funil com o original.
          enabled: false,
        },
      }),
    onSuccess: (res: { id: string }) => {
      toast.success("Agente duplicado. A cópia está desligada.");
      qc.invalidateQueries({ queryKey: ["crm-agents", workspaceId] }).then(() => {
        setEditingId(res.id);
        setDirty(false);
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mantém o form sincronizado quando a lista recarrega e nada está pendente.
  useEffect(() => {
    if (dirty || !editingId || !agentsQ.data) return;
    const current = agentsQ.data.find((a) => a.id === editingId);
    if (current && current.id !== form.id) setForm(current);
  }, [agentsQ.data, editingId, dirty, form.id]);

  const confirmLeave = () =>
    !dirty || confirm("Você tem alterações não salvas neste agente. Sair mesmo assim?");

  const openAgent = (a: CrmAgentConfig) => {
    if (!confirmLeave()) return;
    setEditingId(a.id);
    setForm(a);
    setDirty(false);
  };

  const startNewAgent = () => {
    if (!confirmLeave()) return;
    setEditingId(null);
    setForm({ ...DEFAULT_CRM_AGENT_CONFIG, name: `Gestor ${agents.length + 1}` });
    setDirty(true);
  };

  const togglePipeline = (id: string) =>
    patch({
      pipelineIds: form.pipelineIds.includes(id)
        ? form.pipelineIds.filter((p) => p !== id)
        : [...form.pipelineIds, id],
    });

  /** Funis já ocupados por outro agente ligado. */
  const takenPipelines = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) {
      if (!a.enabled || a.id === form.id) continue;
      if (a.pipelineIds.length === 0) {
        for (const p of pipelines) m.set(p.id, a.name);
      } else {
        for (const p of a.pipelineIds) m.set(p, a.name);
      }
    }
    return m;
  }, [agents, pipelines, form.id]);

  const actionsAllowed = form.autonomy === "sugestao" || form.autonomy === "automatico";
  const alwaysOn = isAlwaysOn(form);

  const toggleDay = (v: number) =>
    patch({
      activeDays: form.activeDays.includes(v)
        ? form.activeDays.filter((d) => d !== v)
        : [...form.activeDays, v].sort(),
    });

  const toggleTask = (id: CrmAgentTask) =>
    patch({ tasks: form.tasks.includes(id) ? form.tasks.filter((t) => t !== id) : [...form.tasks, id] });

  const setAlwaysOn = (on: boolean) => {
    if (on) patch({ activeDays: [0, 1, 2, 3, 4, 5, 6], startTime: "00:00", endTime: "23:59" });
    else patch({ activeDays: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "18:00" });
  };

  const filteredAgents = agents.filter((a) =>
    a.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const rulesLen = (form.rules ?? "").length;

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <AppSidebar />

      {/* Lista de agentes */}
      <aside className="w-[272px] shrink-0 border-r border-border bg-card/40 flex flex-col">
        <div className="px-4 pt-4 pb-3 border-b border-border">
          <div className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">CRM · Agentes Estratégicos</div>
          <div className="text-sm font-semibold mt-0.5">Gestores de Processo</div>
          <button
            type="button"
            onClick={startNewAgent}
            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo agente
          </button>
          <div className="relative mt-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar agente"
              className="w-full pl-8 pr-2 py-1.5 rounded-md border border-border bg-background text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {editingId === null && (
            <div className="rounded-lg border border-dashed border-primary bg-primary/5 px-3 py-2.5">
              <div className="text-xs font-semibold truncate">{form.name || "Novo agente"}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 animate-pulse">Rascunho não salvo</div>
            </div>
          )}
          {filteredAgents.map((a) => {
            const active = a.id === editingId;
            const escopo = a.pipelineIds.length ? `${a.pipelineIds.length} funil(is)` : "Todos os funis";
            const modo = AUTONOMY_OPTIONS.find((o) => o.id === a.autonomy)?.label ?? "";
            return (
              <div
                key={a.id}
                className={`group rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                  active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 bg-background"
                }`}
                onClick={() => openAgent(a)}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${a.enabled ? "bg-success" : "bg-muted-foreground/40"}`} />
                  <span className="text-xs font-semibold truncate flex-1">{a.name}</span>
                  <span className="hidden group-hover:flex items-center gap-1">
                    <button
                      type="button"
                      title="Duplicar agente"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateM.mutate(a);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Excluir agente"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Excluir o agente "${a.name}"? Essa ação não volta atrás.`)) deleteM.mutate(a.id!);
                      }}
                      className="text-destructive hover:opacity-80"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 truncate">
                  {modo} · {escopo}
                </div>
                <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                  {isAlwaysOn(a) ? "24 horas por dia" : `${a.startTime} às ${a.endTime}`}
                </div>
              </div>
            );
          })}
          {agents.length === 0 && (
            <div className="px-2 py-6 text-center">
              <p className="text-[11px] text-muted-foreground">Nenhum agente criado ainda.</p>
              <button
                onClick={startNewAgent}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90"
              >
                <Plus className="w-3.5 h-3.5" /> Criar agente IA
              </button>
            </div>
          )}

        </div>
      </aside>

      {/* Editor */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
          <div className="max-w-[980px] mx-auto px-6 py-3 flex flex-wrap items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
              <Bot className="w-4.5 h-4.5" />
            </div>
            <input
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Nome do agente"
              className="flex-1 min-w-[180px] bg-transparent text-lg font-semibold tracking-tight outline-none border-b border-transparent focus:border-border py-1"
            />
            <span
              className={`text-[11px] px-2 py-1 rounded-full font-semibold ${
                form.enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
              }`}
            >
              {form.enabled ? "Ligado" : "Desligado"}
            </span>
            {dirty ? (
              <span className="text-[11px] px-2 py-1 rounded-full bg-warning/10 text-warning font-semibold animate-pulse">
                Alterações não salvas
              </span>
            ) : lastSaved ? (
              <span className="text-[11px] px-2 py-1 rounded-full bg-success/10 text-success font-semibold">
                Salvo às {lastSaved}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => patch({ enabled: !form.enabled })}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-semibold hover:border-primary/50"
            >
              <Power className="w-3.5 h-3.5" />
              {form.enabled ? "Desligar" : "Ligar"}
            </button>
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              disabled={!workspaceId}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-semibold hover:border-primary/50 disabled:opacity-50"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Conversar
            </button>
            <button
              type="button"
              onClick={() => saveM.mutate(undefined)}
              disabled={!workspaceId || saveM.isPending} // Mantém clicável mesmo após salvar (dirty=false não desabilita)
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {saveM.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </button>
          </div>
        </div>

        <div className="max-w-[980px] mx-auto px-6 py-5 space-y-4 pb-24">
          <Section
            icon={GitBranch}
            title="Funis que este agente administra"
            desc="Dois agentes ligados não podem cuidar do mesmo funil. Sem nenhum funil marcado, ele cuida de todos."
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {pipelines.map((p) => {
                const active = form.pipelineIds.includes(p.id);
                const takenBy = takenPipelines.get(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePipeline(p.id)}
                    className={`text-left rounded-xl border p-3 transition-colors ${
                      active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-3.5 h-3.5 rounded-[4px] border grid place-items-center ${
                          active ? "bg-primary border-primary" : "border-muted-foreground/50"
                        }`}
                      >
                        {active && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                      </span>
                      <span className="text-xs font-semibold truncate">{p.name}</span>
                    </div>
                    {takenBy && <p className="text-[11px] text-warning mt-1">Já é do agente “{takenBy}”</p>}
                  </button>
                );
              })}
              {pipelines.length === 0 && (
                <div className="text-xs text-muted-foreground">Nenhum funil encontrado neste workspace.</div>
              )}
            </div>
          </Section>

          <Section icon={Zap} title="Nível de autonomia" desc="O quanto ele pode decidir sozinho dentro do CRM.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {AUTONOMY_OPTIONS.map((o) => {
                const Icon = o.icon;
                const active = form.autonomy === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => patch({ autonomy: o.id })}
                    className={`text-left rounded-xl border p-4 transition-colors ${
                      active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-sm font-semibold">{o.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{o.desc}</p>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section
            icon={Clock}
            title="Quando ele opera"
            desc="Fora dessa janela o agente não age sozinho."
            right={
              <button
                type="button"
                onClick={() => setAlwaysOn(!alwaysOn)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
                  alwaysOn
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                <Power className="w-3 h-3" />
                Rodar 24 horas
              </button>
            }
          >
            {alwaysOn ? (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 flex items-center gap-3">
                <Clock className="w-4 h-4 text-primary" />
                <div className="text-xs">
                  <div className="font-semibold text-sm">Operando 24 horas, todos os dias</div>
                  <p className="text-muted-foreground mt-0.5">
                    Desligue o botão “Rodar 24 horas” para escolher dias e horários manualmente.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {DAYS.map((d) => {
                    const active = form.activeDays.includes(d.v);
                    return (
                      <button
                        key={d.v}
                        type="button"
                        onClick={() => toggleDay(d.v)}
                        className={`w-14 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {d.l}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => patch({ activeDays: [1, 2, 3, 4, 5] })}
                    className="text-[11px] px-2.5 py-1.5 rounded-full border border-border text-muted-foreground hover:border-primary/50"
                  >
                    Seg a sex
                  </button>
                  <button
                    type="button"
                    onClick={() => patch({ activeDays: [0, 1, 2, 3, 4, 5, 6] })}
                    className="text-[11px] px-2.5 py-1.5 rounded-full border border-border text-muted-foreground hover:border-primary/50"
                  >
                    Todos os dias
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <label className="text-xs">
                    <span className="text-muted-foreground">Início</span>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => patch({ startTime: e.target.value })}
                      className="mt-1 w-full px-2 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-muted-foreground">Fim</span>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(e) => patch({ endTime: e.target.value })}
                      className="mt-1 w-full px-2 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-muted-foreground">Fuso</span>
                    <select
                      value={form.timezone}
                      onChange={(e) => patch({ timezone: e.target.value })}
                      className="mt-1 w-full px-2 py-2 rounded-lg border border-border bg-background text-sm"
                    >
                      <option value="America/Sao_Paulo">Brasília (GMT-3)</option>
                      <option value="America/Manaus">Manaus (GMT-4)</option>
                      <option value="America/Rio_Branco">Rio Branco (GMT-5)</option>
                      <option value="America/Noronha">Noronha (GMT-2)</option>
                    </select>
                  </label>
                </div>
              </>
            )}

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-xs">
                <span className="text-muted-foreground">Verificar a cada</span>
                <select
                  value={form.checkIntervalMinutes}
                  onChange={(e) => patch({ checkIntervalMinutes: Number(e.target.value) })}
                  className="mt-1 w-full px-2 py-2 rounded-lg border border-border bg-background text-sm"
                >
                  {[15, 30, 60, 120, 240, 480, 1440].map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? `${m} min` : m === 1440 ? "1 vez por dia" : `${m / 60} h`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">Máximo de ações por dia</span>
                <input
                  type="number"
                  min={0}
                  value={form.maxActionsPerDay}
                  onChange={(e) => patch({ maxActionsPerDay: Number(e.target.value) })}
                  className="mt-1 w-full px-2 py-2 rounded-lg border border-border bg-background text-sm"
                />
              </label>
            </div>
          </Section>

          <Section
            icon={CheckCircle2}
            title="Responsabilidades no CRM"
            desc="Marque o que entra no escopo dele. Itens de execução só valem em modo de sugestão ou automático."
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {TASKS.map((t) => {
                const disabled = t.needsAction && !actionsAllowed;
                const active = form.tasks.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleTask(t.id)}
                    className={`text-left rounded-xl border p-3 transition-colors ${
                      disabled
                        ? "border-border opacity-45 cursor-not-allowed"
                        : active
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-3.5 h-3.5 rounded-[4px] border ${
                          active ? "bg-primary border-primary" : "border-muted-foreground/50"
                        }`}
                      />
                      <span className="text-xs font-semibold">{t.label}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{t.desc}</p>
                  </button>
                );
              })}
            </div>
          </Section>


          <Section
            icon={Shield}
            title="Regras escritas por você"
            desc="Essas regras entram no prompt do agente com prioridade máxima: valem tanto no chat quanto nas verificações automáticas."
          >
            <div className="flex flex-wrap gap-1.5 mb-2">
              {RULE_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    const base = (form.rules ?? "").trim();
                    const next = base ? `${base}\n${ex}` : ex;
                    if (next.length > RULES_MAX) {
                      toast.error("Limite de caracteres atingido.");
                      return;
                    }
                    patch({ rules: next });
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:border-primary/50"
                >
                  + {ex}
                </button>
              ))}
            </div>
            <textarea
              rows={7}
              maxLength={RULES_MAX}
              value={form.rules ?? ""}
              onChange={(e) => patch({ rules: e.target.value || null })}
              placeholder="Uma regra por linha. Escreva do seu jeito, em português mesmo."
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm leading-relaxed"
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" />
                Regras curtas e diretas funcionam melhor. Textos longos fazem a IA perder o contexto.
              </p>
              <span
                className={`text-[11px] font-semibold ${
                  rulesLen > RULES_MAX * 0.9 ? "text-warning" : "text-muted-foreground"
                }`}
              >
                {rulesLen}/{RULES_MAX} caracteres
              </span>
            </div>
          </Section>

          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              {form.id && (
                <>
                  <button
                    type="button"
                    onClick={() => duplicateM.mutate(form)}
                    disabled={duplicateM.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold hover:border-primary/50 disabled:opacity-50"
                  >
                    <Copy className="w-4 h-4" />
                    Duplicar agente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Excluir o agente “${form.name}”? Essa ação não volta atrás.`)) {
                        deleteM.mutate(form.id!);
                      }
                    }}
                    disabled={deleteM.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-destructive/40 text-destructive text-sm font-semibold hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir agente
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => saveM.mutate(undefined)}
              disabled={!workspaceId || saveM.isPending} // Mantém clicável sempre
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {saveM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar agente
            </button>
          </div>

          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground font-semibold">Escopo:</strong> gestão interna do CRM. O
            atendimento ao cliente fica com o Salesbot e o Agente de conversa, em Automações.
          </div>
        </div>
      </main>

      {chatOpen && workspaceId && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-[560px] h-full bg-card border-l border-border flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                <div>
                  <div className="text-sm font-semibold leading-tight">{form.name || "Gestor de CRM"}</div>
                  <div className="text-[11px] text-muted-foreground">Conversa interna. Ele nunca fala com o lead.</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                aria-label="Fechar chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <AiAgentChat workspaceId={workspaceId} module="kommo_manager" fullscreen />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
