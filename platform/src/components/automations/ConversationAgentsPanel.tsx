import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  listConversationAgents,
  upsertConversationAgent,
  deleteConversationAgent,
  duplicateConversationAgent,
  setPrimaryConversationAgent,
  
  getConversationAgentStats,
  listConversationAgentRuns,
  type ConversationAgent,
  type ConversationAgentStat,
  type ConversationAgentRun,
} from "@/lib/conversation-agents.functions";
import {
  ObjectiveTreeReplay,
  emptyTree,
  type ObjectiveTree,
  type PathEvent,
} from "./ObjectiveTree";
import { AgentSourcesEditor, type AgentSource } from "./AgentSourcesEditor";
import { AgentLinksEditor, type AgentLink } from "./AgentLinksEditor";
import { AgentActionsEditor, type AgentAction } from "./AgentActionsEditor";
import { AgentWebhookTrigger, emptyWebhookTrigger, type WebhookTriggerValue } from "./AgentWebhookTrigger";
import { AgentTargetField, DurationPicker, targetKindForAction } from "./AgentTargetPickers";
import { CustomFieldSelect, CustomFieldValueInput } from "./CustomFieldPicker";
import { AgentOutcomeEditor, emptyOutcome, normalizeOutcome, type AgentOutcomeStep } from "./AgentOutcomeEditor";
import { AgentTestChat } from "./AgentTestChat";
import { Sparkles, Plus, Pencil, Copy, Trash2, Loader2, X, MessageCircle, BarChart3, Trophy, GitBranch, Network, Star, Save, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { useIsSuperAdmin } from "@/hooks/use-roles";
import { DuplicateNameDialog } from "@/components/automations/DuplicateNameDialog";
import { AgentTemplatePicker, type AgentTemplateData } from "./AgentTemplatePicker";
import { AgentModeBadge, type AgentMode } from "./AgentTypeDialog";
import {isLegacyObjectiveAgent,promptReadinessError} from "@/lib/slim-prompt-only.core";


const GPT_MODELS = [
  { id: "openai/gpt-5.5", label: "GPT-5.5 (recomendado)" },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 mini (rápido)" },
  { id: "openai/gpt-5.4-nano", label: "GPT-5.4 nano (barato)" },
];

type Tab = "agentes";

export function ConversationAgentsPanel() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ConversationAgent | null>(null);
  const [creating, setCreating] = useState(false);
  const [templateSeed, setTemplateSeed] = useState<AgentTemplateData | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Tipo escolhido no primeiro passo da criação (definitivo).
  const [typeOpen, setTypeOpen] = useState(false);
  const [newMode, setNewMode] = useState<AgentMode>("prompt");
  const [viewingRuns, setViewingRuns] = useState<ConversationAgent | null>(null);
  // Agente alvo do diálogo "Duplicar" (escolha do nome da cópia).
  const [dupTarget, setDupTarget] = useState<ConversationAgent | null>(null);
  const [tab, setTab] = useState<Tab>("agentes");
  const qc = useQueryClient();

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

  const listFn = useServerFn(listConversationAgents);
  const delFn = useServerFn(deleteConversationAgent);
  const dupFn = useServerFn(duplicateConversationAgent);
  const primaryFn = useServerFn(setPrimaryConversationAgent);
  

  const q = useQuery({
    queryKey: ["conversation-agents", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => (await listFn({ data: { workspaceId: workspaceId! } })) as ConversationAgent[],
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["conversation-agents"] });
  const agents = q.data ?? [];

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-card-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Agentes IA de conversa
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            IAs que <strong className="text-foreground">fazem o atendimento 1-a-1</strong> com o lead no WhatsApp.
            Você liga ou pausa o modo autônomo direto na lista, mesmo pausado, o agente pode ser invocado por um
            bloco do Salesbot ou por uma etapa da pipeline.
          </p>
        </div>
        {tab === "agentes" && (
          <button
            onClick={() => {setNewMode("prompt");setTemplateSeed(null);setPickerOpen(true);}}
            disabled={!workspaceId}
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground px-3 py-1.5 bg-primary hover:opacity-90 rounded disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" /> Novo agente
          </button>
        )}
      </div>

      <div className="px-5 pt-3 flex items-center gap-1 border-b border-border">
        <TabBtn active={tab === "agentes"} onClick={() => setTab("agentes")} icon={<MessageCircle className="w-3.5 h-3.5" />}>
          Agentes
        </TabBtn>
      </div>

      {tab === "agentes" ? (
        <div className="p-5">
          {q.isLoading ? (
            <div className="text-xs text-muted-foreground py-8 text-center">Carregando...</div>
          ) : agents.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground border border-dashed border-border rounded">
              <MessageCircle className="w-6 h-6 mx-auto mb-2 opacity-50" />
              Nenhum agente IA de conversa criado.
            </div>
          ) : (
            <ul className="divide-y divide-border border border-border rounded">
              {agents.map((a) => {
                const s = readSettings(a);
                const isPrimary = Boolean(s.is_primary);
                return (
                <li key={a.id} className={`px-3 py-2.5 flex items-center gap-3 ${isPrimary ? "bg-primary/5" : ""}`}>
                  <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate flex items-center gap-1.5">
                      {a.name}
                      <AgentModeBadge mode="prompt" />
                      {isLegacyObjectiveAgent(a.metadata)&&!a.system_prompt?.trim()&&<span className="text-[10px] text-amber-600">Preencher prompt</span>}
                      {isPrimary && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                          Principal
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {a.persona || "Sem persona"} · {modelLabel(a.model)} · cooldown {a.cooldown_seconds}s
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!workspaceId || isPrimary) return;
                      try {
                        await primaryFn({ data: { workspaceId, agentId: a.id } });
                        invalidate();
                        toast.success(`"${a.name}" agora é o agente principal.`);
                      } catch {
                        toast.error("Não foi possível definir o agente principal.");
                      }
                    }}
                    className={isPrimary ? "text-primary" : "text-muted-foreground hover:text-foreground"}
                    title={isPrimary ? "Este é o agente principal" : "Definir como agente principal"}
                  >
                    <Star className={`w-3.5 h-3.5 ${isPrimary ? "fill-current" : ""}`} />
                  </button>
                  <button
                    onClick={() => setViewingRuns(a)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Ver histórico das conversas"
                  >
                    <Network className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setEditing(a)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDupTarget(a)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Duplicar"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!workspaceId) return;
                      if (!confirm(`Excluir agente "${a.name}"?`)) return;
                      await delFn({ data: { workspaceId, agentId: a.id } });
                      invalidate();
                    }}
                    className="text-destructive hover:opacity-80"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
                );
              })}

            </ul>
          )}
        </div>
      ) : (
        <div className="p-5 text-xs text-muted-foreground text-center">Nenhum agente selecionado.</div>
      )}

      {pickerOpen && (
        <AgentTemplatePicker
          scope="individual"
          onClose={() => setPickerOpen(false)}
          onPickBlank={() => {
            setPickerOpen(false);
            setTemplateSeed(null);
            setCreating(true);
          }}
          onPickTemplate={(data) => {
            setPickerOpen(false);
            setTemplateSeed(data);
            setCreating(true);
          }}
        />
      )}

      {(creating || editing) && (
        <AgentEditor
          workspaceId={workspaceId}
          initial={editing ?? (templateSeed ? seedToAgent(templateSeed) : undefined)}
          forcedMode={creating ? newMode : undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
            setTemplateSeed(null);
          }}
          onSaved={() => {
            // Salvar não fecha a janela — apenas atualiza a lista.
            invalidate();
          }}
        />
      )}


      {viewingRuns && workspaceId && (
        <RunsDrawer
          workspaceId={workspaceId}
          agent={viewingRuns}
          onClose={() => setViewingRuns(null)}
        />
      )}

      <DuplicateNameDialog
        open={!!dupTarget}
        originalName={dupTarget?.name ?? ""}
        title="Duplicar agente IA"
        maxLength={120}
        onCancel={() => setDupTarget(null)}
        onConfirm={async (name) => {
          if (!workspaceId || !dupTarget) return;
          try {
            await dupFn({ data: { workspaceId, agentId: dupTarget.id, name } });
            invalidate();
            toast.success("Agente duplicado.");
          } catch {
            toast.error("Não foi possível duplicar o agente. Tente de novo.");
          }
          setDupTarget(null);
        }}
      />
    </div>
  );
}

function seedToAgent(seed: AgentTemplateData): ConversationAgent {
  return {
    id: "",
    workspace_id: "",
    name: seed.name,
    persona: seed.persona,
    system_prompt: seed.systemPrompt,
    model: GPT_MODELS[0].id,
    temperature: 0.7,
    max_tokens: 1024,
    cooldown_seconds: 15,
    enabled: true,
    updated_at: new Date().toISOString(),
  } as ConversationAgent;
}

function modelLabel(id: string): string {
  return GPT_MODELS.find((m) => m.id === id)?.label ?? id;
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 rounded-t border-b-2 -mb-px transition-colors ${
        active
          ? "text-foreground border-primary"
          : "text-muted-foreground border-transparent hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function ReportView({ workspaceId }: { workspaceId: string | null }) {
  const statsFn = useServerFn(getConversationAgentStats);
  const q = useQuery({
    queryKey: ["conversation-agents-stats", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => (await statsFn({ data: { workspaceId: workspaceId! } })) as ConversationAgentStat[],
  });

  if (q.isLoading) {
    return <div className="p-5 text-xs text-muted-foreground text-center">Carregando relatório...</div>;
  }
  const stats = q.data ?? [];
  if (stats.length === 0) {
    return (
      <div className="p-5">
        <div className="text-center py-12 text-xs text-muted-foreground border border-dashed border-border rounded">
          <BarChart3 className="w-6 h-6 mx-auto mb-2 opacity-50" />
          Nenhum agente com dados ainda.
        </div>
      </div>
    );
  }

  // Ranking: quem chega ao objetivo em menos interações fica em primeiro.
  // Agentes sem objetivo alcançado ficam no fim.
  const ranked = [...stats].sort((a, b) => {
    if (a.avg_interactions_to_objective == null && b.avg_interactions_to_objective == null) return 0;
    if (a.avg_interactions_to_objective == null) return 1;
    if (b.avg_interactions_to_objective == null) return -1;
    return a.avg_interactions_to_objective - b.avg_interactions_to_objective;
  });

  return (
    <div className="p-5 space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Ranking pelas <strong className="text-foreground">interações médias até o objetivo</strong>. Quanto menor, mais
        eficiente é o agente em conduzir a conversa. Dados coletados conforme as conversas passam pelo agente.
      </p>
      <div className="overflow-hidden rounded border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Agente</th>
              <th className="px-3 py-2 text-right">Conversas</th>
              <th className="px-3 py-2 text-right">Objetivo atingido</th>
              <th className="px-3 py-2 text-right">Taxa</th>
              <th className="px-3 py-2 text-right">Média até objetivo</th>
              <th className="px-3 py-2 text-right">Média geral</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ranked.map((s, i) => (
              <tr key={s.agent_id}>
                <td className="px-3 py-2 text-muted-foreground">
                  {i === 0 && s.avg_interactions_to_objective != null ? (
                    <Trophy className="w-3.5 h-3.5 text-amber-500 inline" />
                  ) : (
                    i + 1
                  )}
                </td>
                <td className="px-3 py-2 font-medium">{s.agent_name}</td>
                <td className="px-3 py-2 text-right">{s.total_runs}</td>
                <td className="px-3 py-2 text-right">{s.reached}</td>
                <td className="px-3 py-2 text-right">{(s.conversion_rate * 100).toFixed(1)}%</td>
                <td className="px-3 py-2 text-right">
                  {s.avg_interactions_to_objective == null ? "-" : s.avg_interactions_to_objective.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">{s.avg_interactions_overall.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type AgentSettings = {
  mode?: "prompt" | "objetivos";
  /** Agente principal do workspace (só um). */
  is_primary?: boolean;

  language?: string;
  max_interactions?: number;
  allowed_actions?: string[];
  rules?: AgentRule[];
  sources?: AgentSource[];
  actions?: AgentAction[];
  links?: AgentLink[];
  webhook_trigger?: WebhookTriggerValue;
  outcome?: AgentOutcomeStep[] | { action: string; target: string; farewell?: string };
};


type AgentRule = {
  id?: string;
  logic: "e" | "ou";
  conditions: Array<{ field: string; op: string; value: string; fieldId?: string }>;
  action: { type: string; target: string; targetLabel?: string };
};

const LANGUAGES: Array<{ id: string; label: string }> = [
  { id: "pt-BR", label: "Português (Brasil)" },
  { id: "en-US", label: "Inglês (EUA)" },
  { id: "es-ES", label: "Espanhol" },
  { id: "fr-FR", label: "Francês" },
  { id: "it-IT", label: "Italiano" },
  { id: "de-DE", label: "Alemão" },
];

const ALLOWED_ACTIONS: Array<{ id: string; label: string; desc: string; adminOnly?: boolean; emBreve?: boolean }> = [
  { id: "trocar-etapa", label: "Trocar etapa do lead", desc: "Move o lead para outra etapa da pipeline." },
  { id: "atribuir-responsavel", label: "Atribuir responsável", desc: "Passa o lead para um funcionário." },
  { id: "encerrar-conversa", label: "Encerrar conversa", desc: "Finaliza o atendimento e marca a conversa como fechada." },
  { id: "transferir-humano", label: "Transferir para humano", desc: "Aciona notificação e desliga o modo autônomo." },
  { id: "criar-tarefa", label: "Criar tarefa", desc: "Gera uma tarefa no CRM com prazo." },
  { id: "adicionar-tag", label: "Adicionar tag", desc: "Marca o lead com uma tag." },
  { id: "ouvir-audio", label: "Ouvir áudios do lead", desc: "Transcreve o áudio recebido e responde o que foi falado." },
  { id: "reagir-sentimento", label: "Reagir por sentimento", desc: "Reage na mensagem com um emoji conforme o tom do lead." },
  {
    id: "responder-audio",
    label: "Responder por áudio",
    desc: "Voz sintetizada do agente. Ainda em desenvolvimento.",
    adminOnly: true,
    emBreve: true,
  },
  { id: "enviar-midia", label: "Enviar mídia", desc: "Envio de imagem, catálogo ou documento." },
];


const RULE_FIELDS: Array<{ id: string; label: string }> = [
  { id: "mensagem-cliente", label: "Mensagem do cliente" },
  { id: "interacoes", label: "Número de interações" },
  { id: "sem-resposta-min", label: "Tempo sem resposta" },
  { id: "tag-lead", label: "Tag do lead" },
  { id: "etapa-atual", label: "Etapa atual" },
  { id: "campo-personalizado", label: "Campo personalizado" },
  { id: "objetivo-atingido", label: "Objetivo atingido?" },
];

const RULE_OPS: Array<{ id: string; label: string }> = [
  { id: "contem", label: "contém" },
  { id: "igual", label: "é igual a" },
  { id: "diferente", label: "é diferente de" },
  { id: "maior", label: "é maior que" },
  { id: "menor", label: "é menor que" },
  { id: "existe", label: "está preenchido" },
  { id: "vazio", label: "está vazio" },
];

const RULE_ACTIONS: Array<{ id: string; label: string; needsTarget: boolean; targetLabel?: string }> = [
  { id: "trocar-etapa", label: "Trocar etapa do funil", needsTarget: true, targetLabel: "Etapa do funil" },
  { id: "transferir-humano", label: "Transferir para usuário", needsTarget: true, targetLabel: "Usuário/atendente" },
  { id: "iniciar-bot", label: "Iniciar salesbot", needsTarget: true, targetLabel: "Salesbot" },
  { id: "enviar-arquivo", label: "Enviar arquivo", needsTarget: true, targetLabel: "Arquivo" },
  { id: "adicionar-tag", label: "Adicionar tag", needsTarget: true, targetLabel: "Tag" },
  { id: "criar-tarefa", label: "Criar tarefa", needsTarget: true, targetLabel: "Descrição" },
  { id: "encerrar-conversa", label: "Encerrar conversa", needsTarget: false },
];

function readSettings(a: ConversationAgent | undefined): AgentSettings {
  const meta = (a?.metadata ?? null) as { settings?: AgentSettings } | null;
  return meta?.settings ?? {};
}

function AgentEditor({
  workspaceId,
  initial,
  forcedMode,
  onClose,
  onSaved,
}: {
  workspaceId: string | null;
  initial?: ConversationAgent;
  /** Tipo escolhido na criação. Depois de definido não muda mais. */
  forcedMode?: AgentMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { isSuperAdmin } = useIsSuperAdmin();

  const initialTree = useMemo<ObjectiveTree>(() => {
    const meta = (initial?.metadata ?? null) as { objective_tree?: ObjectiveTree } | null;
    if (meta && meta.objective_tree && meta.objective_tree.root) return meta.objective_tree;
    return emptyTree();
  }, [initial]);
  const initialSettings = useMemo(() => readSettings(initial), [initial]);

  // Tipo é definitivo: vem da escolha na criação ou do que já está salvo.
  const mode: AgentMode = "prompt";
  const legacyNeedsReview=isLegacyObjectiveAgent(initial?.metadata);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    persona: initial?.persona ?? "",
    systemPrompt: initial?.system_prompt ?? "",
    model: initial?.model && initial.model.startsWith("openai/") ? initial.model : GPT_MODELS[0].id,
    cooldownSeconds: initial?.cooldown_seconds ?? 15,
    language: initialSettings.language ?? "pt-BR",
    maxInteractions: initialSettings.max_interactions ?? 0,
  });
  const [allowedActions, setAllowedActions] = useState<string[]>(
    initialSettings.allowed_actions ?? ["trocar-etapa", "transferir-humano", "encerrar-conversa"],
  );
  const [rules, setRules] = useState<AgentRule[]>(initialSettings.rules ?? []);
  const [sources, setSources] = useState<AgentSource[]>(initialSettings.sources ?? []);
  const [actions, setActions] = useState<AgentAction[]>(initialSettings.actions ?? []);
  const [links, setLinks] = useState<AgentLink[]>(initialSettings.links ?? []);
  const [webhookTrigger, setWebhookTrigger] = useState<WebhookTriggerValue>(
    initialSettings.webhook_trigger ?? emptyWebhookTrigger(),
  );
  const [outcome, setOutcome] = useState<AgentOutcomeStep[]>(
    normalizeOutcome(initialSettings.outcome),
  );

  const [tree, setTree] = useState<ObjectiveTree>(initialTree);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [agentId, setAgentId] = useState<string | undefined>(initial?.id);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);

  const saveFn = useServerFn(upsertConversationAgent);

  // Payload sempre atualizado, sem recriar o autosave a cada tecla.
  const payloadRef = useRef<Record<string, unknown>>({});
  payloadRef.current = {
    workspaceId,
    id: agentId,
    name: form.name,
    persona: form.persona,
    systemPrompt: form.systemPrompt,
    model: form.model,
    cooldownSeconds: form.cooldownSeconds,
    temperature: initial?.temperature ?? 0.7,
    maxTokens: initial?.max_tokens ?? 1024,
    enabled: initial?.enabled ?? true,
    // Objective tree is retained in storage for audit, never submitted by the prompt editor.
    mode,
    language: form.language,
    maxInteractions: form.maxInteractions,
    allowedActions,
    rules,
    sources,
    actions,
    links,
    webhookTrigger,
    outcome,
  };

  const savingRef = useRef(false);
  const lastSyncedRef = useRef<string>("");

  /** Salva sem fechar a janela. `silent` = autosave (não mostra erro em vermelho). */
  const doSave = useCallback(
    async (silent = false) => {
      if (savingRef.current) return;
      const payload = { ...payloadRef.current };
      // Opening an old agent must not silently convert its saved configuration by autosave.
      if(silent&&legacyNeedsReview&&!lastSavedAt)return;
      const promptError=promptReadinessError(payload.systemPrompt);
      if(promptError){if(!silent)setErr(promptError);return;}
      if (!workspaceId) {
        if (!silent) setErr("Workspace não identificado");
        return;
      }
      if (!String(payload.name ?? "").trim()) {
        if (!silent) setErr("Nome obrigatório");
        return;
      }
      // Ações que sempre enviam o mesmo texto não podem ficar sem mensagem.
      const semMensagem = (actions ?? []).find(
        (a) =>
          (a.do.action === "sempre-usar-mensagem" || a.do.action === "sempre-responder-info") &&
          !(a.do.message ?? "").trim(),
      );

      if (semMensagem) {
        if (!silent) setErr("Preencha os campos obrigatórios das ações do agente.");
        return;
      }
      const alvoObrigatorio = new Set([
        "sempre-falar-assunto",
        "tentar-falar-assunto",
        "nao-mencionar",
        "solicitar-cliente",
        "definir-campo",
        "gerenciar-tags",
        "criar-compromisso",
        "iniciar-salesbot",
        "mudar-etapa-lead",
        "alterar-responsavel",
        "enviar-arquivo",
      ]);
      const acaoIncompleta = (actions ?? []).find(
        (a) =>
          (alvoObrigatorio.has(a.do.action) && !(a.do.target ?? "").trim()) ||
          (a.do.action === "definir-campo" && !(a.do.target ?? "").includes("=")) ||
          (a.do.action === "adicionar-tarefa" && !(a.do.task?.title ?? "").trim()),
      );
      if (acaoIncompleta) {
        if (!silent) setErr("Preencha os campos obrigatórios das ações do agente.");
        return;
      }

      const snapshot = JSON.stringify(payload);
      if (silent && snapshot === lastSyncedRef.current) return;
      savingRef.current = true;
      setSaving(true);
      if (!silent) setErr(null);
      try {
        const res = (await saveFn({ data: payload as never })) as { id?: string } | undefined;
        if (res?.id) setAgentId(res.id);
        const finalSnapshot = JSON.stringify({ ...payloadRef.current, id: res?.id ?? payload.id });
        lastSyncedRef.current = finalSnapshot;
        setIsDirty(false);
        setLastSavedAt(new Date());
        onSaved();
      } catch (e) {
        if (!silent) setErr((e as Error).message);
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [onSaved, saveFn, workspaceId, actions, legacyNeedsReview, lastSavedAt],
  );

  // Autosave a cada 1 minuto (mesmo comportamento do Salesbot).
  useEffect(() => {
    const t = setInterval(() => {
      if (isDirty) {
        void doSave(true);
      }
    }, 60_000);
    return () => clearInterval(t);
  }, [doSave, isDirty]);

  // Marca como sujo quando qualquer coisa no payload muda
  useEffect(() => {
    const snapshot = JSON.stringify(payloadRef.current);
    if (snapshot !== lastSyncedRef.current) {
      setIsDirty(true);
    }
  }, [
    form,
    allowedActions,
    rules,
    sources,
    actions,
    links,
    webhookTrigger,
    outcome,
    tree,
  ]);

  const toggleAction = (id: string) =>
    setAllowedActions((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addRule = () =>
    setRules((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        logic: "e",
        conditions: [{ field: "mensagem-cliente", op: "contem", value: "" }],
        action: { type: "trocar-etapa", target: "" },
      },
    ]);
  const updateRule = (idx: number, patch: Partial<AgentRule>) =>
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const deleteRule = (idx: number) => setRules((prev) => prev.filter((_, i) => i !== idx));

  // No Fluxo de Objetivos o editor abre em tela cheia, igual ao builder do Salesbot.
  // Os dois tipos de agente abrem em tela cheia; no modo prompt o conteúdo
  // fica centralizado numa coluna legível.
  const fullscreen = true;

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/60 grid place-items-center ${fullscreen ? "p-0" : "p-4"} select-none`}
      onClick={onClose}
    >
      <div
        className={`bg-card border border-border shadow-xl transition-transform duration-200 flex flex-col overflow-hidden ${
          fullscreen ? "w-screen h-screen rounded-none border-0" : "w-full max-w-3xl rounded-lg"
        } ${testOpen && !fullscreen ? "-translate-x-[200px]" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "prompt" && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-3">
            <div className="flex items-center gap-2">
              <AgentModeBadge mode={mode} />
              <span className="text-[10px] text-muted-foreground">Atendimento por prompt. O fluxo de objetivos não é executado.</span>
            </div>
            <button
              onClick={() => {
                if (isDirty && !window.confirm("Você tem alterações não salvas. Deseja realmente fechar?")) return;
                onClose();
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Fechar editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div
          className={`flex-1 min-h-0 ${
            mode === "prompt" ? "p-4 overflow-y-auto" : "flex flex-col h-full"
          }`}
        >
          {mode === "prompt" ? (
            <div className="mx-auto w-full max-w-5xl space-y-4">
              {legacyNeedsReview&&<p role="status" className="rounded border border-amber-500/30 p-3 text-xs">O fluxo anterior foi preservado para consulta, mas está desativado. Revise o prompt de atendimento e clique em Salvar. Abertura e autosave não convertem esse agente sem a primeira confirmação manual.</p>}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nome</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: SDR do WhatsApp"
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Idioma</label>
                  <select
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Máx. interações <span className="normal-case text-muted-foreground/70">(0 = ilimitado)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={form.maxInteractions}
                    onChange={(e) => setForm({ ...form, maxInteractions: parseInt(e.target.value || "0", 10) })}
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Persona</label>
                <input
                  value={form.persona}
                  onChange={(e) => setForm({ ...form, persona: e.target.value })}
                  placeholder="Ex: Consultora comercial simpática e direta"
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Prompt do sistema
                  </label>
                  <button
                    type="button"
                    onClick={() => setPromptExpanded(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Abrir editor ampliado do prompt"
                  >
                    <Maximize2 className="h-3 w-3" /> Expandir
                  </button>
                </div>
                <textarea
                  value={form.systemPrompt}
                  onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                  rows={10}
                  placeholder="Manual de atendimento: descreva objetivo, tom de voz, regras, quando encaminhar pra humano..."
                  className="mt-1 min-h-[13rem] w-full resize-y rounded border border-border bg-background px-2.5 py-2 text-xs leading-5 font-mono"
                />
              </div>

              <AgentOutcomeEditor
                value={outcome}
                onChange={setOutcome}
                scope="individual"
                title="Encerramento do atendimento"
                subtitle="Defina o encaminhamento ao concluir o atendimento ou atingir o limite de interações."
              />

              <AgentSourcesEditor value={sources} onChange={setSources} workspaceId={workspaceId} />

              <AgentActionsEditor value={actions} onChange={setActions} />

              <AgentWebhookTrigger
                agentId={initial?.id ?? null}
                scope="1a1"
                targetLabel="Telefone destino"
                targetPlaceholder="5511999999999"
                value={webhookTrigger}
                onChange={setWebhookTrigger}
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Modelo</label>
                  <select
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
                  >
                    {GPT_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Cooldown (s)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.cooldownSeconds}
                    onChange={(e) => setForm({ ...form, cooldownSeconds: parseInt(e.target.value || "0", 10) })}
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mt-1"
                  />
                </div>
              </div>

              {/* Ações permitidas (modo prompt) */}
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Ações que o agente pode tomar
                  </label>
                  <span className="text-[10px] text-muted-foreground">{allowedActions.length} selecionadas</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALLOWED_ACTIONS.filter((a) => !a.adminOnly || isSuperAdmin).map((a) => {
                    const on = allowedActions.includes(a.id);
                    return (
                      <label
                        key={a.id}
                        className={`flex items-start gap-2 border rounded px-2 py-1.5 cursor-pointer transition-colors ${
                          on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleAction(a.id)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium flex items-center gap-1.5">
                            {a.label}
                            {a.emBreve && (
                              <span className="shrink-0 text-[8px] leading-none uppercase tracking-wider bg-pink-500/20 text-pink-400 border border-pink-500/40 rounded px-1 py-0.5">
                                em breve
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{a.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Links do agente (modo prompt) */}
              <AgentLinksEditor
                value={links}
                onChange={setLinks}
                workspaceId={workspaceId}
                agentId={agentId ?? null}
                agentName={form.name}
              />

              {/* Regras condicionais (modo prompt) */}
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Regras condicionais
                    </label>
                    <p className="text-[10px] text-muted-foreground">
                      Se acontecer X <em>(E/OU outras condições)</em>, o agente executa Y automaticamente.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addRule}
                    className="text-[11px] px-2 py-1 rounded border border-border hover:bg-muted inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Nova regra
                  </button>
                </div>

                {rules.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground text-center border border-dashed border-border rounded py-4">
                    Sem regras, o agente segue apenas o prompt do sistema.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {rules.map((r, idx) => (
                      <RuleRow
                        key={r.id ?? idx}
                        rule={r}
                        onChange={(patch) => updateRule(idx, patch)}
                        onDelete={() => deleteRule(idx)}
                      />
                    ))}
                  </div>
                )}
              </div>
              {err && <div className="text-xs text-destructive mt-4">{err}</div>}
            </div>
          ) : (
            <div className="flex flex-col h-full w-full relative">
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex max-w-[calc(100%-7rem)] items-center gap-1.5 rounded-lg border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur">
                {editingName ? (
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    onBlur={() => setEditingName(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setEditingName(false);
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    placeholder="Nome do agente"
                    className="h-8 w-64 max-w-[38vw] rounded-md border border-border bg-background px-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    className="flex h-8 min-w-0 max-w-72 items-center gap-2 rounded-md px-2 text-xs font-semibold hover:bg-muted"
                    title="Alterar nome do agente"
                  >
                    <span className="truncate">{form.name.trim() || "Agente sem nome"}</span>
                    <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </button>
                )}
                {lastSavedAt && !isDirty && !saving && (
                  <span className="hidden whitespace-nowrap px-1 text-[10px] text-muted-foreground sm:inline">
                    Salvo {lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void doSave(false)}
                  disabled={saving || !isDirty}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  title={isDirty ? "Salvar agente" : "Todas as alterações estão salvas"}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {saving ? "Salvando…" : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isDirty && !window.confirm("Você tem alterações não salvas. Deseja realmente fechar?")) return;
                    onClose();
                  }}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Fechar editor"
                  title="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0 relative">
                <p className="p-4 text-sm">Use o prompt de atendimento. A edição por fluxo foi retirada.</p>
              </div>
              {err && (
                <div className="absolute left-1/2 top-14 z-50 -translate-x-1/2 rounded-md border border-destructive/30 bg-card px-3 py-2 text-xs text-destructive shadow-lg">
                  {err}
                </div>
              )}
            </div>
          )}
        </div>

        {mode === "prompt" && (
          <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-border">
          {lastSavedAt && !saving && (
            <span
              className="text-[11px] text-muted-foreground"
              title={`Último salvamento: ${lastSavedAt.toLocaleString("pt-BR")}`}
            >
              Salvo {lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => {
              if (isDirty && !window.confirm("Você tem alterações não salvas. Deseja realmente fechar?")) return;
              onClose();
            }}
            className="text-xs px-3 py-1.5 rounded border border-border"
          >
            Fechar
          </button>
          <button
            onClick={() => void doSave(false)}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
          </button>
        </div>
        )}
      </div>

      {promptExpanded && (
        <div
          className="fixed inset-0 z-[90] bg-black/70 p-3 md:p-8"
          onClick={(event) => {
            event.stopPropagation();
            setPromptExpanded(false);
          }}
        >
          <div
            className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Prompt do sistema</div>
                <div className="text-[10px] text-muted-foreground">Editor ampliado · o conteúdo é o mesmo campo do formulário.</div>
              </div>
              <button
                type="button"
                onClick={() => setPromptExpanded(false)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Fechar editor ampliado"
                title="Fechar editor ampliado"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 p-3 md:p-4">
              <textarea
                autoFocus
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                rows={30}
                placeholder="Manual de atendimento: descreva objetivo, tom de voz, regras, quando encaminhar pra humano..."
                className="h-full min-h-[60vh] w-full resize-none rounded-lg border border-border bg-background px-3 py-3 text-xs leading-5 font-mono outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <span className="text-[10px] text-muted-foreground">As alterações continuam no mesmo prompt e serão salvas pelo fluxo normal do agente.</span>
              <button
                type="button"
                onClick={() => setPromptExpanded(false)}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Voltar ao formulário
              </button>
            </div>
          </div>
        </div>
      )}

      <AgentTestChat
        workspaceId={workspaceId}
        open={testOpen}
        onOpenChange={setTestOpen}
        config={{
          scope: "1a1",
          mode,
          model: form.model,
          name: form.name,
          persona: form.persona,
          systemPrompt: form.systemPrompt,
          language: form.language,
          tree: mode === "objetivos" ? tree : null,
          sources,
          actions,
        }}
      />
    </div>
  );
}


function RuleRow({
  rule,
  onChange,
  onDelete,
}: {
  rule: AgentRule;
  onChange: (patch: Partial<AgentRule>) => void;
  onDelete: () => void;
}) {
  const action = RULE_ACTIONS.find((a) => a.id === rule.action.type);
  return (
    <div className="border border-border rounded p-2 space-y-1.5 bg-background/60">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1.5">
          {rule.conditions.map((c, ci) => (
            <div key={ci} className="flex items-center gap-1.5">
              {ci > 0 && (
                <select
                  value={rule.logic}
                  onChange={(e) => onChange({ logic: e.target.value as "e" | "ou" })}
                  className="bg-background border border-border rounded px-1 py-0.5 text-[10px] uppercase font-semibold"
                >
                  <option value="e">E</option>
                  <option value="ou">OU</option>
                </select>
              )}
              {ci === 0 && <span className="text-[10px] uppercase font-semibold text-muted-foreground w-6">Se</span>}
              <select
                value={c.field}
                onChange={(e) => {
                  const next = [...rule.conditions];
                  next[ci] = { ...c, field: e.target.value };
                  onChange({ conditions: next });
                }}
                className="bg-background border border-border rounded px-1.5 py-1 text-[11px]"
              >
                {RULE_FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              {c.field === "campo-personalizado" && (
                <CustomFieldSelect
                  value={c.fieldId}
                  onChange={(id) => {
                    const next = [...rule.conditions];
                    next[ci] = { ...c, fieldId: id };
                    onChange({ conditions: next });
                  }}
                  className="w-36 shrink-0 bg-background border border-border rounded px-1.5 py-1 text-[11px]"
                />
              )}
              <select
                value={c.op}
                onChange={(e) => {
                  const next = [...rule.conditions];
                  next[ci] = { ...c, op: e.target.value };
                  onChange({ conditions: next });
                }}
                className="bg-background border border-border rounded px-1.5 py-1 text-[11px]"
              >
                {RULE_OPS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <div className="flex-1 min-w-0">
                {c.field === "tag-lead" || c.field === "etapa-atual" ? (
                  <AgentTargetField
                    kind={c.field === "tag-lead" ? "tag" : "etapa"}
                    value={{ id: c.value, label: c.value }}
                    onChange={(v) => {
                      const next = [...rule.conditions];
                      next[ci] = { ...c, value: v.id };
                      onChange({ conditions: next });
                    }}
                  />
                ) : c.field === "campo-personalizado" ? (
                  <CustomFieldValueInput
                    fieldId={c.fieldId}
                    value={c.value}
                    onChange={(v) => {
                      const next = [...rule.conditions];
                      next[ci] = { ...c, value: v };
                      onChange({ conditions: next });
                    }}
                  />
                ) : c.field === "sem-resposta-min" ? (
                  <DurationPicker
                    value={{ id: c.value }}
                    onChange={(v) => {
                      const next = [...rule.conditions];
                      next[ci] = { ...c, value: v.id };
                      onChange({ conditions: next });
                    }}
                  />
                ) : c.field === "objetivo-atingido" ? (
                  <select
                    value={c.value || "sim"}
                    onChange={(e) => {
                      const next = [...rule.conditions];
                      next[ci] = { ...c, value: e.target.value };
                      onChange({ conditions: next });
                    }}
                    className="w-full bg-background border border-border rounded px-1.5 py-1 text-[11px]"
                  >
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                ) : (
                  <input
                    type={c.field === "interacoes" ? "number" : "text"}
                    min={c.field === "interacoes" ? 0 : undefined}
                    value={c.value}
                    onChange={(e) => {
                      const next = [...rule.conditions];
                      next[ci] = { ...c, value: e.target.value };
                      onChange({ conditions: next });
                    }}
                    placeholder="valor"
                    className="w-full bg-background border border-border rounded px-1.5 py-1 text-[11px]"
                  />
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = rule.conditions.filter((_, i) => i !== ci);
                  onChange({ conditions: next.length ? next : rule.conditions });
                }}
                className="text-muted-foreground hover:text-destructive"
                title="Remover condição"
                disabled={rule.conditions.length <= 1}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                conditions: [...rule.conditions, { field: "mensagem-cliente", op: "contem", value: "" }],
              })
            }
            className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
          >
            <Plus className="w-2.5 h-2.5" /> Adicionar condição ({rule.logic.toUpperCase()})
          </button>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive shrink-0"
          title="Remover regra"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/60">
        <span className="text-[10px] uppercase font-semibold text-muted-foreground w-14">Então</span>
        <select
          value={rule.action.type}
          onChange={(e) => onChange({ action: { ...rule.action, type: e.target.value } })}
          className="bg-background border border-border rounded px-1.5 py-1 text-[11px]"
        >
          {RULE_ACTIONS.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
        {action?.needsTarget && (
          <div className="flex-1 min-w-0">
            <AgentTargetField
              kind={targetKindForAction(rule.action.type) ?? "texto"}
              scope={"individual"}
              placeholder={action.targetLabel ?? "alvo"}
              value={{ id: rule.action.target, label: rule.action.targetLabel }}
              onChange={(v) => onChange({ action: { ...rule.action, target: v.id, targetLabel: v.label } })}
            />
          </div>
        )}
      </div>
    </div>
  );
}


function SubTabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 rounded-t border-b-2 -mb-px transition-colors ${
        active ? "text-foreground border-primary" : "text-muted-foreground border-transparent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function RunsDrawer({
  workspaceId,
  agent,
  onClose,
}: {
  workspaceId: string;
  agent: ConversationAgent;
  onClose: () => void;
}) {
  const runsFn = useServerFn(listConversationAgentRuns);
  const q = useQuery({
    queryKey: ["conversation-agent-runs", workspaceId, agent.id],
    queryFn: async () =>
      (await runsFn({ data: { workspaceId, agentId: agent.id, limit: 50 } })) as ConversationAgentRun[],
  });
  const runs = q.data ?? [];
  const [selected, setSelected] = useState<ConversationAgentRun | null>(null);

  const tree = useMemo<ObjectiveTree | null>(() => {
    const meta = (agent.metadata ?? null) as { objective_tree?: ObjectiveTree } | null;
    return meta?.objective_tree?.root ? meta.objective_tree : null;
  }, [agent]);

  const events = useMemo<PathEvent[]>(() => {
    if (!selected) return [];
    const meta = (selected.metadata ?? null) as { path_events?: PathEvent[] } | null;
    return meta?.path_events ?? [];
  }, [selected]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg w-full max-w-5xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold inline-flex items-center gap-2">
            <Network className="w-4 h-4 text-primary" /> Conversas, {agent.name}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid md:grid-cols-[280px_minmax(0,1fr)] max-h-[75vh]">
          <div className="border-r border-border overflow-y-auto">
            {q.isLoading ? (
              <div className="p-4 text-xs text-muted-foreground">Carregando...</div>
            ) : runs.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">
                Nenhuma conversa registrada ainda. Assim que o agente atender um lead, aparece aqui.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {runs.map((r) => (
                  <li
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className={`px-3 py-2 cursor-pointer text-xs ${
                      selected?.id === r.id ? "bg-primary/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="font-medium truncate">
                      {r.lead_id ? `Lead ${r.lead_id.slice(0, 8)}` : "Sem lead"}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <span>{new Date(r.started_at).toLocaleString("pt-BR")}</span>
                      <span>·</span>
                      <span>{r.interactions_count} msgs</span>
                      {r.objective_reached && <span className="text-emerald-500">· ✓</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-4 overflow-y-auto">
            {!tree ? (
              <div className="text-xs text-muted-foreground border border-dashed border-border rounded p-4 text-center">
                Este agente ainda não tem um <strong>Fluxo de objetivos</strong> configurado.
                Edite o agente na aba "Fluxo de objetivos" pra montar a árvore.
              </div>
            ) : !selected ? (
              <div className="text-xs text-muted-foreground border border-dashed border-border rounded p-4 text-center">
                Selecione uma conversa à esquerda pra visualizar o percurso na árvore.
              </div>
            ) : (
              <ObjectiveTreeReplay value={tree} events={events} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// SLIM_PROMPT_ONLY_V1
