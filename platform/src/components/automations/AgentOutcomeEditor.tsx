import { Target, Plus, Trash2, ArrowDown, ChevronUp, ChevronDown } from "lucide-react";
import { AgentTargetField, targetKindForAction } from "./AgentTargetPickers";

export type OutcomeScope = "individual" | "grupo";

export type AgentOutcomeStep = {
  id: string;
  action: string;
  /** Alvo: id da etapa, id do bot, tag, texto, etc, depende da action. */
  target: string;
  /** Rótulo human-readable do target (persistido pra UI mesmo se o id sumir). */
  targetLabel?: string;
  /** Mensagem enviada antes de executar essa ação (opcional). */
  message?: string;
};

/**
 * Compat: alguns pontos ainda salvam um único objeto legado.
 * Aceitamos ambos os formatos e sempre trabalhamos como lista.
 */
export type AgentOutcome = AgentOutcomeStep[] | {
  action: string;
  target: string;
  farewell?: string;
};

/**
 * Alias legado: "iniciar-automacao" e "iniciar-bot" foram unificados em
 * "iniciar-bot", no nosso mundo, automação de agente = disparar salesbot.
 */
function migrateAction(a: string): string {
  if (a === "iniciar-automacao") return "iniciar-bot";
  return a;
}

export const OUTCOME_ACTIONS: Array<{
  id: string;
  label: string;
  needsTarget: boolean;
  targetLabel?: string;
  targetPlaceholder?: string;
  description: string;
}> = [
  {
    id: "proximo-objetivo",
    label: "Apenas seguir para o próximo objetivo",
    needsTarget: false,
    description: "Não executa ações no CRM. O fluxo apenas avança para o próximo nó conectado no canvas.",
  },

  {
    id: "enviar-mensagem",
    label: "Enviar mensagem final",
    needsTarget: false,
    description: "Envia uma última mensagem antes das próximas ações (ou sozinha).",
  },
  {
    id: "mudar-etapa",
    label: "Mover lead para etapa",
    needsTarget: true,
    targetLabel: "Etapa do funil",
    description: "Avança o lead no CRM para a etapa selecionada.",
  },
  {
    id: "iniciar-bot",
    label: "Disparar automação (salesbot)",
    needsTarget: true,
    targetLabel: "Salesbot",
    description: "Executa um salesbot já cadastrado. Automação de agente = salesbot; por isso a ação é única.",
  },
  {
    id: "transferir-humano",
    label: "Transferir para humano",
    needsTarget: true,
    targetLabel: "Usuário/atendente",
    description: "Escolha o atendente do workspace: a conversa fica aguardando ele e ele é notificado.",
  },
  {
    id: "adicionar-tag",
    label: "Adicionar tag ao lead",
    needsTarget: true,
    targetLabel: "Tag",
    description: "Marca o lead com uma etiqueta já usada no workspace (ou crie uma nova).",
  },
  {
    id: "criar-tarefa",
    label: "Criar tarefa no CRM",
    needsTarget: true,
    targetLabel: "Destino e Descrição",
    description: "Gera uma tarefa para o responsável dar continuidade, escolhendo se vai para o calendário ou para o fluxo.",
  },
  {
    id: "enviar-formulario",
    label: "Enviar formulário",
    needsTarget: true,
    targetLabel: "Formulário do CRM",
    description: "Envia o link de um formulário público cadastrado no sistema para o lead preencher.",
  },
  {
    id: "enviar-arquivo",
    label: "Enviar arquivo",
    needsTarget: true,
    targetLabel: "Arquivo",
    description: "Envia um arquivo do seu computador (até 20 MB) ou um link para o lead.",
  },
  {
    id: "remover-tag",
    label: "Remover tag do lead",
    needsTarget: true,
    targetLabel: "Tag",
    description: "Tira uma etiqueta do lead (ex: sair de 'aguardando retorno').",
  },
  {
    id: "definir-campo",
    label: "Atualizar campo personalizado",
    needsTarget: true,
    targetLabel: "Campo e Valor",
    description: "Grava um valor real em um campo personalizado do lead (selecione o campo e o valor).",
  },
  {
    id: "vincular-produto",
    label: "Vincular produto ao lead",
    needsTarget: true,
    targetLabel: "Produto e tipo de vínculo",
    description: "Associa um produto do catálogo ao lead no CRM (interesse ou compra).",
  },
  {
    id: "criar-tarefa-workflow",
    label: "Criar tarefa no Fluxo de Trabalho",
    needsTarget: true,
    targetLabel: "Fluxo, etapa e responsável",
    description: "Cria a tarefa direto no fluxo do setor, com etapa, responsável, prioridade e prazo reais.",
  },
  {
    id: "consultar-trafego",
    label: "Consultar Gestor de Tráfego (Meta Ads)",
    needsTarget: true,
    targetLabel: "Conta de anúncio e período",
    description: "O agente recebe investimento, cliques, CTR, leads, CPL e ROAS reais da conta antes de responder.",
  },
  {
    id: "consultar-social",
    label: "Consultar Social Media",
    needsTarget: true,
    targetLabel: "Escopo do conteúdo",
    description: "Puxa a agenda real de posts (agendados, aprovados ou publicados) para o agente falar do que está no ar.",
  },
  {
    id: "consultar-tracking",
    label: "Consultar Tracking (pixel)",
    needsTarget: true,
    targetLabel: "Site e evento",
    description: "Lê os eventos reais do pixel Vanessa Simoni (visita, cadastro, compra) desse lead antes de decidir a próxima fala.",
  },
  {
    id: "consultar-workflow",
    label: "Consultar tarefas do Fluxo de Trabalho",
    needsTarget: false,
    description: "O agente enxerga as tarefas abertas da equipe para não prometer prazo que o time não tem.",
  },
  {
    id: "ler-historico",
    label: "Ler histórico da conversa",
    needsTarget: false,
    description:
      "O agente puxa a conversa inteira com esse lead (não só as últimas mensagens), entende o contexto geral do atendimento e usa isso para destravar o objetivo.",
  },
  {
    id: "iniciar-agente-ia",
    label: "Iniciar outro Agente IA",
    needsTarget: true,
    targetLabel: "Novo Agente",
    description: "Transfere o lead para ser atendido por um agente de IA diferente.",
  },
  {
    id: "encerrar-conversa",
    label: "Encerrar conversa (IA para de responder)",
    needsTarget: false,
    description: "Para automaticamente a IA. Use como última etapa; pode combinar com uma mensagem final.",
  },
  {
    id: "pausar",
    label: "Pausar fluxo (Aguardar tempo ou resposta)",
    needsTarget: true,
    targetLabel: "Configuração da Pausa",
    description: "Faz o robô parar por um tempo ou até o lead responder.",
  },
  {
    id: "adicionar-campo",
    label: "Adicionar valor ao campo (lista)",
    needsTarget: true,
    targetLabel: "Campo e Valor",
    description: "Adiciona um valor a um campo do tipo múltipla escolha ou lista, sem apagar os anteriores.",
  },
  {
    id: "remover-campo",
    label: "Limpar/Remover campo personalizado",
    needsTarget: true,
    targetLabel: "Campo personalizado",
    description: "Remove o valor atual de um campo personalizado do lead.",
  },
];


const rid = () => Math.random().toString(36).slice(2, 10);

export function emptyOutcome(): AgentOutcomeStep[] {
  return [{ id: rid(), action: "proximo-objetivo", target: "", message: "" }];
}


/** Converte formato antigo (objeto único) para o novo (lista) + migra ids de action. */
export function normalizeOutcome(v: AgentOutcome | null | undefined): AgentOutcomeStep[] {
  if (!v) return emptyOutcome();
  if (Array.isArray(v)) {
    const list = v.map((s) => ({ ...s, action: migrateAction(s.action) }));
    return list.length ? list : emptyOutcome();
  }
  const steps: AgentOutcomeStep[] = [];
  if (v.farewell) {
    steps.push({ id: rid(), action: "enviar-mensagem", target: "", message: v.farewell });
  }
  steps.push({
    id: rid(),
    action: migrateAction(v.action || "proximo-objetivo"),
    target: v.target || "",
    message: "",
  });
  return steps;
}

// Pickers vivem em AgentTargetPickers.tsx e são compartilhados com as regras.


export function AgentOutcomeEditor({
  value,
  onChange,
  scope = "individual",
  title = "Ao atingir o objetivo",
  subtitle = "Encadeie o que a IA faz quando o objetivo é cumprido, sem isso, ela conversa pra sempre.",
}: {
  value: AgentOutcome;
  onChange: (v: AgentOutcomeStep[]) => void;
  scope?: OutcomeScope;
  title?: string;
  subtitle?: string;
}) {
  const steps = normalizeOutcome(value);

  const update = (id: string, patch: Partial<AgentOutcomeStep>) =>
    onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const remove = (id: string) => {
    const next = steps.filter((s) => s.id !== id);
    onChange(next);
  };

  const add = () =>
    onChange([...steps, { id: rid(), action: "mudar-etapa", target: "", message: "" }]);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...steps];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  return (
    <div className="border border-primary/20 bg-primary/5 rounded-lg p-2.5">
      <div className="flex items-start gap-2">
        <Target className="w-4 h-4 text-primary mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">{title}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {steps.map((step, idx) => {
          const meta = OUTCOME_ACTIONS.find((a) => a.id === step.action) ?? OUTCOME_ACTIONS[0];
          return (
            <div key={step.id} className="relative border border-border rounded-xl bg-background p-3 shadow-sm transition-all hover:shadow-md min-w-0 overflow-hidden group">
              <div className="flex items-center gap-3 mb-2 min-w-0">
                <div className="flex flex-col gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="h-5 w-5 flex items-center justify-center rounded bg-muted border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Subir"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === steps.length - 1}
                    className="h-5 w-5 flex items-center justify-center rounded bg-muted border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Descer"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <span className="text-[10px] font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                    {idx + 1}º
                  </span>
                </div>
                <select
                  value={step.action}
                  onChange={(e) => update(step.id, { action: e.target.value, target: "", targetLabel: "" })}
                  className="flex-1 min-w-0 bg-background border border-border rounded-md px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary/40 outline-none h-9 appearance-none"
                >
                  {OUTCOME_ACTIONS.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => remove(step.id)}
                  className="shrink-0 h-8 w-8 flex items-center justify-center text-destructive hover:bg-destructive/10 rounded-full transition-colors"
                  aria-label="Remover"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[10px] text-muted-foreground pl-6 mb-2 break-words">{meta.description}</p>

              <div className="pl-6 space-y-2 min-w-0">

                {meta.needsTarget && (
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {meta.targetLabel}
                      {step.action === "iniciar-bot" ? (scope === "grupo" ? " (grupo)" : " (1-a-1)") : ""}
                    </label>
                    <div className="mt-1">
                      <AgentTargetField
                        kind={targetKindForAction(step.action) ?? "texto"}
                        scope={scope}
                        placeholder={meta.targetPlaceholder}
                        value={{ id: step.target, label: step.targetLabel }}
                        onChange={(v) => update(step.id, { target: v.id, targetLabel: v.label })}
                      />
                    </div>
                  </div>
                )}


                {(step.action === "enviar-mensagem" || step.action === "encerrar-conversa" || step.action === "transferir-humano") && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {step.action === "enviar-mensagem" ? "Mensagem" : "Mensagem final (opcional)"}
                    </label>
                    <textarea
                      value={step.message ?? ""}
                      onChange={(e) => update(step.id, { message: e.target.value })}
                      rows={2}
                      placeholder={
                        step.action === "transferir-humano"
                          ? "Ex: Vou te transferir."
                          : step.action === "encerrar-conversa"
                            ? "Ex: Atendimento encerrado."
                            : "Ex: Registramos suas informações."
                      }
                      className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-primary/30 outline-none"
                    />
                  </div>
                )}
              </div>

              {idx < steps.length - 1 && (
                <div className="flex justify-center mt-2">
                  <ArrowDown className="w-3 h-3 text-primary/50" />
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={add}
          className="w-full text-[11px] inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded border border-dashed border-primary/40 text-primary hover:bg-primary/10"
        >
          <Plus className="w-3 h-3" /> Adicionar próxima ação
        </button>
      </div>
    </div>
  );
}
