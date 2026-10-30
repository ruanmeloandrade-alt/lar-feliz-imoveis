/**
 * Traduz as ações "Quando → Fazer" do Agente de Prompt em regras obrigatórias
 * de sistema. Compartilhado entre o runtime real e o chat de teste, para que o
 * que o operador testa seja exatamente o que roda em produção.
 */
export type PromptAgentActionRule = {
  id?: string;
  when?: { trigger?: string; subjects?: string[]; custom?: string };
  do?: {
    action?: string;
    message?: string;
    target?: string;
    targetLabel?: string;
    withPermission?: boolean;
    withSummary?: boolean;
  };
  more?: string;
};

export const PROMPT_TRIGGER_TEXT: Record<string, string> = {
  "cliente-quer": "o cliente quiser",
  "toda-vez-pergunta": "o cliente perguntar sobre",
  "primeira-vez-pergunta": "o cliente perguntar pela primeira vez sobre",
  sentimento: "o sentimento do cliente for",
  "cliente-fornece": "o cliente fornecer o",
  "mensagem-contem": "a mensagem contiver",
  "nao-responde-ha": "o cliente não responder há",
  "formato-mensagem": "o formato da mensagem for",
  "horario-especifico": "a mensagem chegar no horário",
};

/** Transforma as ações do Agente de Prompt em regras obrigatórias de sistema. */
/** Converte "a | b | c" (ou com vírgulas) numa lista legível para o prompt. */
export function listaAlvo(alvo: string, plural: string, singular: string): string {
  const itens = String(alvo ?? "").split(/\s*[|,]\s*/).map((t) => t.trim()).filter(Boolean);
  if (!itens.length) return `${singular} configurado`;
  if (itens.length === 1) return `${singular}: "${itens[0]}"`;
  return `${plural}: ${itens.map((t) => `"${t}"`).join(", ")}`;
}

export function describePromptAgentActions(
  actions?: PromptAgentActionRule[] | null,
  /** Veredito por ação (id → ativo/inativo/ia), calculado pelo servidor. */
  verdicts?: Record<string, { status: "ativo" | "inativo" | "ia"; detail: string }>,
): string {
  const list = (actions ?? []).filter((a) => a?.do?.action);
  if (!list.length) return "";
  const lines = list.map((a) => {
    const trigger = PROMPT_TRIGGER_TEXT[String(a.when?.trigger ?? "")] ?? "acontecer o gatilho configurado";
    const assunto = [...(a.when?.subjects ?? []), a.when?.custom].filter(Boolean).join(", ");
    const v = verdicts?.[String(a.id ?? "")];
    const marca = !v
      ? ""
      : v.status === "ativo"
        ? `[ATIVO AGORA — ${v.detail}] `
        : v.status === "inativo"
          ? `[NÃO SE APLICA AGORA — ${v.detail}] `
          : `[VERIFIQUE VOCÊ — ${v.detail}] `;
    const cond = `${marca}SE ${trigger}${assunto ? ` "${assunto}"` : ""}`;

    const act = String(a.do?.action ?? "");
    const alvo = a.do?.targetLabel || a.do?.target || "";
    const msg = (a.do?.message ?? "").trim();
    let then = "";
    switch (act) {
      case "nao-responda":
        then = "NÃO responda nada. Fique em silêncio e aguarde um atendente humano.";
        break;
      case "sempre-usar-mensagem":
        then = `responda EXATAMENTE com este texto, sem alterar nada: "${msg}"`;
        break;
      case "sempre-responder-info":
        then = `responda usando obrigatoriamente esta informação: "${msg}"`;
        break;
      case "transferir-usuario":
        then = `${msg ? `diga "${msg}" e ` : ""}encerre finalizando com [[HANDOFF]] para transferir${alvo ? ` para ${alvo}` : ""}${a.do?.withPermission ? " (peça permissão ao cliente antes)" : ""}${a.do?.withSummary ? " (inclua um resumo curto da conversa)" : ""}`;
        break;
      case "sempre-falar-assunto":
        then = `traga sempre ${listaAlvo(alvo, "estes assuntos", "este assunto")} para a conversa`;
        break;
      case "adicionar-tarefa":
      case "definir-campo":
      case "gerenciar-tags":
        then = `${act === "definir-campo" ? "grave o campo personalizado configurado" : act === "gerenciar-tags" ? `aplique a tag "${alvo}" no lead` : "crie a tarefa configurada"} incluindo no fim da resposta o marcador [[AGENT_ACTION:${a.id}]]; nunca mostre nem explique esse marcador ao cliente`;
        break;
      case "tentar-falar-assunto":
        then = `conduza a conversa, de forma natural, para ${listaAlvo(alvo, "estes assuntos", "este assunto")}; não force, mas não encerre sem tentar`;
        break;
      case "nao-mencionar":
        then = `NUNCA mencione, cite ou responda sobre ${listaAlvo(alvo, "estes tópicos", "este tópico")}. Se o cliente perguntar, desvie educadamente sem dar a informação`;
        break;
      case "solicitar-cliente":
        then = `peça OBRIGATORIAMENTE ao cliente ${listaAlvo(alvo, "estas informações", "esta informação")}. Peça uma de cada vez, em linguagem natural; se o cliente não responder, pergunte de novo mais adiante e não encerre a conversa sem ter pedido`;
        break;
      case "responder-base-conhecimento":
        then = "responda apenas com base na fonte de conhecimento fornecida; se não souber, diga que vai verificar";
        break;
      case "criar-compromisso":
      case "iniciar-salesbot":
      case "mudar-etapa-lead":
      case "alterar-responsavel":
      case "enviar-arquivo": {
        const oque =
          act === "criar-compromisso" ? `crie o compromisso no calendário${alvo ? ` (${alvo})` : ""}, confirmando antes o melhor horário com o cliente`
          : act === "iniciar-salesbot" ? `o sistema inicia o salesbot selecionado${alvo ? ` (${alvo})` : ""}`
          : act === "mudar-etapa-lead" ? `o sistema move o lead para a etapa selecionada${alvo ? ` (${alvo})` : ""}`
          : act === "alterar-responsavel" ? `o sistema define o responsável selecionado${alvo ? ` (${alvo})` : ""}`
          : `o sistema envia o arquivo selecionado${alvo ? ` (${alvo})` : ""}`;
        then = `${oque}. Inclua no fim da resposta o marcador [[AGENT_ACTION:${a.id}]]; nunca mostre nem explique esse marcador ao cliente${msg ? `. Mensagem para o cliente: "${msg}"` : ""}`;
        break;
      }
      default:
        then = `o sistema executa a ação "${act}"${alvo ? ` → ${alvo}` : ""}${msg ? ` e envia: "${msg}"` : ""}`;
        break;
    }
    return `- ${cond}: ${then}.${a.more?.trim() ? ` Contexto extra: ${a.more.trim()}` : ""}`;
  });
  return [
    "REGRAS OBRIGATÓRIAS DE COMPORTAMENTO (têm prioridade sobre qualquer outra instrução):",
    ...lines,
    verdicts
      ? "Execute APENAS as regras marcadas como [ATIVO AGORA]. Ignore completamente as marcadas como [NÃO SE APLICA AGORA]. As marcadas como [VERIFIQUE VOCÊ] dependem do seu julgamento sobre a intenção do cliente."
      : "",
  ].filter(Boolean).join("\n");

}

