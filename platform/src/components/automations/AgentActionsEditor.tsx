import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, ChevronDown, ChevronUp, Zap, AlertTriangle } from "lucide-react";
import { AgentTargetField, targetKindForAction } from "./AgentTargetPickers";
import { listWorkflowPipelinesLite } from "@/lib/workflow.functions";

type AgentTaskConfig = {
  title?: string;
  description?: string;
  workflowPipelineId?: string;
  workflowPipelineName?: string;
  workflowStageId?: string;
  workflowStageName?: string;
  assigneeId?: string;
  assigneeName?: string;
  priority?: "baixa" | "media" | "alta" | "urgente";
  dueInMinutes?: number;
  durationMinutes?: number;
  addToCalendar?: boolean;
};

export type AgentAction = {
  id: string;
  when: {
    trigger: string;
    subjects: string[];
    custom?: string;
  };
  do: {
    action: string;
    message?: string;
    target?: string;
    targetLabel?: string;
    withPermission?: boolean;
    withSummary?: boolean;
    task?: AgentTaskConfig;
  };
  more?: string;
};

type TriggerDef = {
  id: string;
  label: string;
  presets?: string[];
  freeform?: boolean;
  placeholder?: string;
  /** Texto de ajuda logo abaixo do campo livre. */
  hint?: string;
  /** Campo livre em várias linhas (frases longas). */
  multiline?: boolean;
  /** Cronômetro (número + unidade) no lugar do campo livre. */
  duration?: boolean;
};

export const TRIGGERS: TriggerDef[] = [
  { id: "cliente-quer", label: "O cliente quer", presets: ["comprar", "obter suporte", "obter reembolso", "falar com agente humano", "agendar"], freeform: true, placeholder: "ou digite outro assunto..." },
  { id: "toda-vez-pergunta", label: "Toda vez que o cliente pergunta sobre", presets: ["disponibilidade", "prazo de entrega", "preço", "formas de pagamento", "garantia"], freeform: true, placeholder: "ou digite outro assunto..." },
  { id: "primeira-vez-pergunta", label: "O cliente pergunta pela primeira vez sobre", presets: ["disponibilidade", "prazo de entrega", "preço"], freeform: true, placeholder: "ou digite outro assunto..." },
  { id: "sentimento", label: "O sentimento do cliente é", presets: ["positivo", "neutro", "negativo", "frustrado", "feliz", "irritado"] },
  { id: "cliente-fornece", label: "O cliente fornece o", presets: ["nome", "email", "telefone", "endereço", "CPF/CNPJ"] },
  {
    id: "mensagem-contem",
    label: "A mensagem recebida contém",
    freeform: true,
    multiline: true,
    placeholder: "quero cancelar / cupom 10OFF / qual o prazo de entrega?",
    hint: "Separe cada termo com barra (/). Assim você pode usar frases inteiras, códigos e textos com vírgula.",
  },
  {
    id: "nao-responde-ha",
    label: "O cliente não responde há",
    duration: true,
    hint: "Cronômetro: se o cliente ficar esse tempo sem responder, a ação é liberada.",
  },
  { id: "formato-mensagem", label: "O formato da mensagem é", presets: ["texto", "áudio", "imagem", "vídeo", "documento", "localização"] },
  { id: "horario-especifico", label: "A mensagem é recebida durante horários específicos", freeform: true, placeholder: "ex.: seg-sex 09:00-18:00" },
];

const DURATION_UNITS = ["minutos", "horas", "dias"] as const;

/** "30 minutos" → { amount: 30, unit: "minutos" } */
export function parseDurationValue(raw: string): { amount: string; unit: string } {
  const m = String(raw ?? "").match(/(\d+)\s*(min|hora|dia)/i);
  if (!m) return { amount: "", unit: "minutos" };
  const unit = m[2].toLowerCase().startsWith("h") ? "horas" : m[2].toLowerCase().startsWith("d") ? "dias" : "minutos";
  return { amount: m[1], unit };
}

/** Prévia dos termos separados por barra. */
function splitTermsPreview(raw: string): string[] {
  return String(raw ?? "").split("/").map((t) => t.trim()).filter(Boolean);
}




type ActionDef = {
  id: string;
  label: string;
  hasMessage?: boolean;
  /** Mensagem obrigatória: a ação não faz sentido sem o texto que será enviado. */
  messageRequired?: boolean;
  messageLabel?: string;
  hasTarget?: boolean;
  targetLabel?: string;
  targetPlaceholder?: string;
  targetRequired?: boolean;
};

export const ACTIONS: ActionDef[] = [
  {
    id: "transferir-usuario",
    label: "Transferir para usuário",
    hasMessage: true,
    hasTarget: true,
    targetLabel: "Usuário responsável",
  },
  { id: "nao-responda", label: "Não responda" },
  {
    id: "sempre-usar-mensagem",
    label: "Sempre usar esta mesma mensagem",
    hasMessage: true,
    messageRequired: true,
    messageLabel: "Mensagem que será enviada",
  },
  {
    id: "sempre-responder-info",
    label: "Sempre responder com essa informação específica",
    hasMessage: true,
    messageRequired: true,
    messageLabel: "Informação exata que o agente deve responder",
  },
  { id: "sempre-falar-assunto", label: "Sempre falar sobre esse assunto", hasTarget: true, targetRequired: true, targetLabel: "Assuntos que o agente deve sempre trazer", targetPlaceholder: "assunto..." },
  { id: "adicionar-tarefa", label: "Adicionar tarefa" },
  { id: "responder-base-conhecimento", label: "Responder usando a fonte da base de conhecimento" },
  { id: "solicitar-cliente", label: "Solicitar ao cliente", hasTarget: true, targetRequired: true, targetLabel: "O que o agente deve solicitar" },
  { id: "nao-mencionar", label: "Não mencionar", hasTarget: true, targetRequired: true, targetLabel: "Tópicos proibidos", targetPlaceholder: "tópico proibido..." },
  { id: "tentar-falar-assunto", label: "Tentar falar sobre esse assunto", hasTarget: true, targetRequired: true, targetLabel: "Assuntos que o agente deve conduzir", targetPlaceholder: "assunto..." },
  { id: "definir-campo", label: "Definir campo personalizado", hasTarget: true, targetRequired: true, targetLabel: "Campo personalizado e valor" },
  { id: "gerenciar-tags", label: "Gerenciar tags", hasTarget: true, targetRequired: true, targetLabel: "Tag (busca as existentes ou cria uma nova)" },
  { id: "criar-compromisso", label: "Criar compromisso no Calendário", hasTarget: true, targetRequired: true, targetLabel: "Compromisso" },
  { id: "iniciar-salesbot", targetRequired: true, label: "Iniciar Salesbot", hasTarget: true, targetLabel: "Salesbot" },
  { id: "mudar-etapa-lead", targetRequired: true, label: "Mudar etapa do lead para", hasTarget: true, targetLabel: "Etapa do funil" },
  { id: "alterar-responsavel", targetRequired: true, label: "Alterar usuário responsável no lead", hasTarget: true, targetLabel: "Usuário responsável" },
  { id: "enviar-arquivo", targetRequired: true, label: "Enviar arquivo", hasTarget: true, targetLabel: "Arquivo (biblioteca, upload ou link)" },
];

const emptyAction = (): AgentAction => ({
  id: crypto.randomUUID(),
  when: { trigger: "cliente-quer", subjects: [], custom: "" },
  do: { action: "transferir-usuario", message: "", target: "", targetLabel: "" },
  more: "",
});

export function AgentActionsEditor({
  value,
  onChange,
}: {
  value: AgentAction[];
  onChange: (v: AgentAction[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const listPipelines = useServerFn(listWorkflowPipelinesLite);
  const workflowQuery = useQuery({
    queryKey: ["agent-action-workflow-pipelines"],
    queryFn: () => listPipelines(),
    staleTime: 60_000,
  });
  const workflows = (workflowQuery.data ?? []) as Array<{
    id: string;
    name: string;
    members: Array<{ id: string; name: string }>;
    stages?: Array<{ id: string; name: string }>;
  }>;

  const update = (idx: number, patch: Partial<AgentAction>) => {
    onChange(value.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Ações do agente
          </label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Defina o que o agente faz automaticamente <strong>quando</strong> algo acontece na conversa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const a = emptyAction();
            onChange([...value, a]);
            setOpenId(a.id);
          }}
          className="text-xs px-2.5 py-1.5 rounded border border-border hover:bg-muted inline-flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar ação
        </button>
      </div>

      {value.length === 0 ? (
        <div className="text-center py-6 text-[11px] text-muted-foreground border border-dashed border-border rounded">
          Nenhuma ação configurada.
        </div>
      ) : (
        <ul className="space-y-2">
          {value.map((a, idx) => {
            const trig = TRIGGERS.find((t) => t.id === a.when.trigger) ?? TRIGGERS[0];
            const act = ACTIONS.find((x) => x.id === a.do.action) ?? ACTIONS[0];
            const open = openId === a.id;
            const messageMissing = !!act.messageRequired && !(a.do.message ?? "").trim();
            const targetMissing = !!act.targetRequired && !(a.do.target ?? "").trim();
            const taskMissing = act.id === "adicionar-tarefa" && !(a.do.task?.title ?? "").trim();
            return (
              <li key={a.id} className="border border-border rounded bg-background">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : a.id)}
                    className="flex-1 text-left text-xs min-w-0"
                  >
                    <span className="font-semibold text-foreground">Quando</span>{" "}
                    <span className="text-muted-foreground">{trig.label.toLowerCase()}</span>
                    {(a.when.subjects.length > 0 || a.when.custom) && (
                      <>
                        {": "}
                        <span className="text-foreground">
                          {[...a.when.subjects, a.when.custom].filter(Boolean).join(", ")}
                        </span>
                      </>
                    )}
                    <span className="mx-2 text-muted-foreground">→</span>
                    <span className="text-foreground">{act.label}</span>
                    {a.do.target ? (
                      <span className="text-muted-foreground">: {a.do.targetLabel || a.do.target}</span>
                    ) : null}
                    {(messageMissing || targetMissing || taskMissing) && (
                      <span className="ml-2 text-[10px] text-destructive inline-flex items-center gap-1 align-middle">
                        <AlertTriangle className="w-3 h-3" /> campo obrigatório
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : a.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <button type="button" onClick={() => remove(idx)} className="text-destructive hover:opacity-80" title="Remover">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {open && (
                  <div className="border-t border-border px-3 py-2.5 space-y-3 bg-muted/20">
                    {/* WHEN */}
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Quando</div>
                      <select
                        value={a.when.trigger}
                        onChange={(e) =>
                          update(idx, { when: { trigger: e.target.value, subjects: [], custom: "" } })
                        }
                        className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
                      >
                        {TRIGGERS.map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                      {trig.presets && trig.presets.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {trig.presets.map((p) => {
                            const on = a.when.subjects.includes(p);
                            return (
                              <button
                                type="button"
                                key={p}
                                onClick={() => {
                                  const subjects = on
                                    ? a.when.subjects.filter((x) => x !== p)
                                    : [...a.when.subjects, p];
                                  update(idx, { when: { ...a.when, subjects } });
                                }}
                                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                                  on
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-border text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {p}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {trig.duration && (() => {
                        const dur = parseDurationValue(a.when.custom ?? "");
                        const setDur = (amount: string, unit: string) =>
                          update(idx, {
                            when: { ...a.when, custom: amount.trim() ? `${amount.trim()} ${unit}` : "" },
                          });
                        return (
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              type="number"
                              min={1}
                              value={dur.amount}
                              onChange={(e) => setDur(e.target.value.replace(/\D/g, ""), dur.unit)}
                              placeholder="30"
                              className="w-24 bg-background border border-border rounded px-2 py-1.5 text-xs"
                            />
                            <select
                              value={dur.unit}
                              onChange={(e) => setDur(dur.amount, e.target.value)}
                              className="bg-background border border-border rounded px-2 py-1.5 text-xs"
                            >
                              {DURATION_UNITS.map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                            <span className="text-[11px] text-muted-foreground">sem responder</span>
                          </div>
                        );
                      })()}
                      {trig.freeform && (
                        trig.multiline ? (
                          <textarea
                            rows={3}
                            value={a.when.custom ?? ""}
                            onChange={(e) => update(idx, { when: { ...a.when, custom: e.target.value } })}
                            placeholder={trig.placeholder ?? "digite um assunto personalizado..."}
                            className="w-full mt-2 bg-background border border-border rounded px-2 py-1.5 text-xs resize-y"
                          />
                        ) : (
                          <input
                            value={a.when.custom ?? ""}
                            onChange={(e) => update(idx, { when: { ...a.when, custom: e.target.value } })}
                            placeholder={trig.placeholder ?? "digite um assunto personalizado..."}
                            className="w-full mt-2 bg-background border border-border rounded px-2 py-1.5 text-xs"
                          />
                        )
                      )}
                      {trig.hint && (
                        <p className="mt-1.5 text-[10px] text-muted-foreground leading-snug">{trig.hint}</p>
                      )}
                      {trig.id === "mensagem-contem" && splitTermsPreview(a.when.custom ?? "").length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {splitTermsPreview(a.when.custom ?? "").map((t, i) => (
                            <span key={`${t}-${i}`} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                    </div>

                    {/* DO */}
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Fazer</div>
                      <select
                        value={a.do.action}
                        onChange={(e) =>
                          update(idx, { do: { action: e.target.value, message: "", target: "", targetLabel: "" } })
                        }
                        className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
                      >
                        {ACTIONS.map((x) => (
                          <option key={x.id} value={x.id}>{x.label}</option>
                        ))}
                      </select>
                      {act.hasTarget && (
                        <div className="mt-2">
                          {act.targetLabel && (
                            <div className="text-[10px] text-muted-foreground mb-1">
                              {act.targetLabel}{act.targetRequired ? <span className="text-destructive"> *</span> : null}
                            </div>
                          )}
                          <AgentTargetField
                            kind={targetKindForAction(act.id) ?? "texto"}
                            placeholder={act.targetPlaceholder ?? act.targetLabel ?? ""}
                            value={{ id: a.do.target ?? "", label: a.do.targetLabel }}
                            onChange={(v) => update(idx, { do: { ...a.do, target: v.id, targetLabel: v.label } })}
                          />
                        </div>
                      )}
                      {act.id === "adicionar-tarefa" && (() => {
                        const task = a.do.task ?? {};
                        const selectedWorkflow = workflows.find((workflow) => workflow.id === task.workflowPipelineId);
                        const stages = selectedWorkflow?.stages ?? [];
                        const members = selectedWorkflow?.members ?? [];
                        const setTask = (patch: Partial<AgentTaskConfig>) =>
                          update(idx, { do: { ...a.do, task: { ...task, ...patch } } });
                        return (
                          <div className="mt-2 space-y-2 rounded border border-border bg-background p-2.5">
                            <label className="block text-[10px] text-muted-foreground">
                              Título <span className="text-destructive">*</span>
                              <input
                                value={task.title ?? ""}
                                onChange={(event) => setTask({ title: event.target.value })}
                                placeholder="Ex.: Ligar para o lead"
                                className={`mt-1 w-full rounded border bg-background px-2 py-1.5 text-xs ${taskMissing ? "border-destructive" : "border-border"}`}
                              />
                            </label>
                            <label className="block text-[10px] text-muted-foreground">
                              Descrição
                              <textarea
                                value={task.description ?? ""}
                                onChange={(event) => setTask({ description: event.target.value })}
                                rows={2}
                                placeholder="Detalhes que o responsável precisa receber"
                                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                              />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-[10px] text-muted-foreground">
                                Prazo em minutos
                                <input type="number" min={0} value={task.dueInMinutes ?? 60} onChange={(event) => setTask({ dueInMinutes: Number(event.target.value) })} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                              </label>
                              <label className="text-[10px] text-muted-foreground">
                                Duração em minutos
                                <input type="number" min={5} value={task.durationMinutes ?? 30} onChange={(event) => setTask({ durationMinutes: Number(event.target.value) })} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                              </label>
                            </div>
                            <label className="block text-[10px] text-muted-foreground">
                              Fluxo de trabalho
                              <select
                                value={task.workflowPipelineId ?? ""}
                                onChange={(event) => {
                                  const workflow = workflows.find((item) => item.id === event.target.value);
                                  setTask({ workflowPipelineId: workflow?.id, workflowPipelineName: workflow?.name, workflowStageId: undefined, workflowStageName: undefined, assigneeId: undefined, assigneeName: undefined });
                                }}
                                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                              >
                                <option value="">Somente calendário</option>
                                {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                              </select>
                            </label>
                            {selectedWorkflow ? (
                              <div className="grid grid-cols-2 gap-2">
                                <label className="text-[10px] text-muted-foreground">
                                  Etapa do fluxo
                                  <select value={task.workflowStageId ?? ""} onChange={(event) => { const stage = stages.find((item) => item.id === event.target.value); setTask({ workflowStageId: stage?.id, workflowStageName: stage?.name }); }} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs">
                                    <option value="">Primeira etapa</option>
                                    {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                                  </select>
                                </label>
                                <label className="text-[10px] text-muted-foreground">
                                  Responsável
                                  <select value={task.assigneeId ?? ""} onChange={(event) => { const member = members.find((item) => item.id === event.target.value); setTask({ assigneeId: member?.id, assigneeName: member?.name }); }} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs">
                                    <option value="">Responsável atual do lead</option>
                                    {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                                  </select>
                                </label>
                              </div>
                            ) : null}
                            {selectedWorkflow ? (
                              <div className="flex items-center gap-3">
                                <select value={task.priority ?? "media"} onChange={(event) => setTask({ priority: event.target.value as AgentTaskConfig["priority"] })} className="rounded border border-border bg-background px-2 py-1.5 text-xs">
                                  <option value="baixa">Prioridade baixa</option><option value="media">Prioridade média</option><option value="alta">Prioridade alta</option><option value="urgente">Prioridade urgente</option>
                                </select>
                                <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <input type="checkbox" checked={task.addToCalendar === true} onChange={(event) => setTask({ addToCalendar: event.target.checked })} /> Também no calendário
                                </label>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                      {act.hasMessage && (
                        <div className="mt-2">
                          <div className="text-[10px] text-muted-foreground mb-1">
                            {act.messageLabel ?? "Mensagem enviada"}{act.messageRequired ? <span className="text-destructive"> *</span> : <span> (opcional)</span>}
                          </div>
                          <textarea
                            value={a.do.message ?? ""}
                            onChange={(e) => update(idx, { do: { ...a.do, message: e.target.value } })}
                            rows={2}
                            placeholder={
                              act.messageRequired
                                ? "Escreva exatamente a mensagem que o agente deve enviar…"
                                : "Mensagem enviada junto com a ação (opcional)"
                            }
                            className={`w-full bg-background border rounded px-2 py-1.5 text-xs ${
                              messageMissing ? "border-destructive" : "border-border"
                            }`}
                          />
                        </div>
                      )}
                      {a.do.action === "transferir-usuario" && (
                        <div className="flex gap-3 mt-2">
                          <label className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={!!a.do.withPermission}
                              onChange={(e) => update(idx, { do: { ...a.do, withPermission: e.target.checked } })}
                            />
                            com permissão do cliente
                          </label>
                          <label className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={!!a.do.withSummary}
                              onChange={(e) => update(idx, { do: { ...a.do, withSummary: e.target.checked } })}
                            />
                            com resumo da conversa
                          </label>
                        </div>
                      )}
                    </div>

                    {/* MORE */}
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Mais</div>
                      <textarea
                        value={a.more ?? ""}
                        onChange={(e) => update(idx, { more: e.target.value })}
                        rows={2}
                        placeholder="Detalhes extras, contexto ou objetivos de acompanhamento (opcional)."
                        className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
