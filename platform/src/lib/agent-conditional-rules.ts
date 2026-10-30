/**
 * Avaliação determinística das "Regras condicionais" do Agente IA
 * (Se X [E/OU Y] → então faça Z).
 *
 * A avaliação acontece no servidor, com dados reais do lead e da conversa,
 * antes/depois do turno da IA. O modelo não decide se a regra bateu.
 */

export type AgentRuleCondition = { field: string; op: string; value: string; fieldId?: string };

export type AgentRuleLike = {
  id?: string;
  logic?: "e" | "ou";
  conditions?: AgentRuleCondition[];
  action?: { type?: string; target?: string; targetLabel?: string };
};

export type AgentRuleContext = {
  /** Última mensagem recebida do cliente (áudio já transcrito). */
  message: string;
  /** Nº de mensagens do cliente nesta conversa. */
  interactions: number;
  /** Minutos desde a última mensagem do cliente (null = desconhecido). */
  minutesSinceCustomerMessage: number | null;
  /** Tags atuais do lead. */
  tags: string[];
  /** ID da etapa atual do lead. */
  stageId: string | null;
  /** Se o agente considera o objetivo cumprido neste turno. */
  objectiveReached: boolean;
  /**
   * Métricas reais de outros módulos (tráfego, social, workflow, tracking),
   * medidas no servidor no momento do turno. Chaves iguais aos ids dos
   * campos de condição: `trafego-investimento`, `trafego-leads`,
   * `trafego-cpl`, `trafego-roas`, `social-agendados`, `social-publicados`,
   * `workflow-tarefas-abertas`, `tracking-eventos`.
   */
  systemMetrics?: Record<string, number>;
  /** Valores dos campos personalizados do lead, indexados pelo id do campo. */
  customFieldValues?: Record<string, string>;
};

const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const toNumber = (v: unknown): number | null => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function compareText(actual: string, op: string, expected: string): boolean {
  const a = norm(actual);
  // "contém" aceita variações separadas por barra: "orçamento/preço/valor".
  const alternativas = expected.split("/").map(norm).filter(Boolean);
  switch (op) {
    case "contem":
      return alternativas.some((t) => a.includes(t));
    case "igual":
      return alternativas.some((t) => a === t);
    case "diferente":
      return alternativas.length ? alternativas.every((t) => a !== t) : true;
    case "maior":
      return a.length > (toNumber(expected) ?? 0);
    case "menor":
      return a.length < (toNumber(expected) ?? 0);
    default:
      return false;
  }
}

function compareNumber(actual: number | null, op: string, expected: string): boolean {
  const e = toNumber(expected);
  if (actual === null || e === null) return false;
  switch (op) {
    case "igual":
      return actual === e;
    case "diferente":
      return actual !== e;
    case "maior":
      return actual > e;
    case "menor":
      return actual < e;
    case "contem":
      // "contém" num campo numérico só faz sentido como ">=".
      return actual >= e;
    default:
      return false;
  }
}

function compareList(list: string[], op: string, expected: string): boolean {
  const alvos = expected.split(/[,/]/).map(norm).filter(Boolean);
  const atuais = list.map(norm);
  if (!alvos.length) return false;
  switch (op) {
    case "contem":
    case "igual":
      return alvos.some((t) => atuais.includes(t));
    case "diferente":
      return alvos.every((t) => !atuais.includes(t));
    default:
      return false;
  }
}

function evaluateCondition(c: AgentRuleCondition, ctx: AgentRuleContext): boolean {
  const op = String(c.op ?? "contem");
  const value = String(c.value ?? "");
  switch (String(c.field ?? "")) {
    case "mensagem-cliente":
      return value.trim() ? compareText(ctx.message, op, value) : false;
    case "interacoes":
      return compareNumber(ctx.interactions, op, value);
    case "sem-resposta-min":
      return compareNumber(ctx.minutesSinceCustomerMessage, op === "contem" ? "maior" : op, value);
    case "tag-lead":
      return compareList(ctx.tags, op, value);
    case "etapa-atual": {
      const igual = norm(ctx.stageId) === norm(value) && !!value.trim();
      return op === "diferente" ? !igual : igual;
    }
    case "objetivo-atingido": {
      const esperado = norm(value) !== "nao";
      const bate = ctx.objectiveReached === esperado;
      return op === "diferente" ? !bate : bate;
    }
    case "campo-personalizado":
    case "campo": {
      const fieldId = String(c.fieldId ?? "").trim();
      if (!fieldId) return false;
      const atual = String(ctx.customFieldValues?.[fieldId] ?? "");
      if (op === "existe") return atual.trim().length > 0;
      if (op === "vazio") return atual.trim().length === 0;
      const num = toNumber(atual);
      if ((op === "maior" || op === "menor") && num !== null) return compareNumber(num, op, value);
      return compareText(atual, op, value);
    }
    default: {
      const key = String(c.field ?? "");
      if (/^(trafego|social|workflow|tracking)-/.test(key)) {
        const atual = ctx.systemMetrics?.[key];
        return compareNumber(typeof atual === "number" ? atual : null, op, value);
      }
      return false;
    }
  }
}

/** Retorna as regras cujas condições bateram de verdade. */
export function matchAgentRules(
  rules: AgentRuleLike[] | undefined | null,
  ctx: AgentRuleContext,
): AgentRuleLike[] {
  const out: AgentRuleLike[] = [];
  for (const rule of rules ?? []) {
    const conds = (rule?.conditions ?? []).filter((c) => c && String(c.field ?? "").trim());
    if (!conds.length) continue;
    const results = conds.map((c) => evaluateCondition(c, ctx));
    const ok = (rule.logic ?? "e") === "ou" ? results.some(Boolean) : results.every(Boolean);
    if (ok) out.push(rule);
  }
  return out;
}

/** Traduz a ação da regra para o formato aceito por `executeAgentActions`. */
export function ruleActionToRuntime(
  rule: AgentRuleLike,
): { action: string; target: string; targetLabel?: string } | null {
  const type = String(rule.action?.type ?? "").trim();
  const target = String(rule.action?.target ?? "").trim();
  const targetLabel = rule.action?.targetLabel;
  const map: Record<string, string> = {
    "trocar-etapa": "mudar-etapa",
    "transferir-humano": "transferir-humano",
    "iniciar-bot": "iniciar-salesbot",
    "enviar-formulario": "enviar-formulario",
    "enviar-arquivo": "enviar-arquivo",
    "adicionar-tag": "adicionar-tag",
    "criar-tarefa": "criar-tarefa",
    "remover-tag": "remover-tag",
    "definir-campo": "definir-campo",
    "atualizar-campo": "definir-campo",
    "criar-tarefa-workflow": "criar-tarefa-workflow",
  };
  const action = map[type];
  if (!action) return null;
  return { action, target, targetLabel };
}

/** Regras que encerram a conversa (não passam pelo executor de ações). */
export function ruleEndsConversation(rule: AgentRuleLike): boolean {
  return String(rule.action?.type ?? "") === "encerrar-conversa";
}
