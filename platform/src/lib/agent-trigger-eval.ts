/**
 * Avaliação determinística dos gatilhos ("Quando") do Agente de Prompt.
 *
 * Antes, TODO gatilho era só texto no prompt e a IA "decidia" sozinha — por isso
 * horário, formato da mensagem, tempo sem resposta e "primeira vez" nunca
 * funcionavam de verdade (a IA não tem esses dados). Aqui o servidor calcula os
 * fatos e diz para o modelo, regra por regra, se ela está ATIVA agora.
 */

export type MessageFormat = "texto" | "áudio" | "imagem" | "vídeo" | "documento" | "localização";

export type TriggerContext = {
  /** Última mensagem recebida do cliente. */
  message: string;
  messageFormat: MessageFormat;
  /** Histórico anterior (sem a mensagem atual). */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** Minutos desde a última mensagem do cliente (null = desconhecido). */
  minutesSinceCustomerMessage: number | null;
  /** Momento atual já no fuso do workspace. */
  now: Date;
  /** Dados já conhecidos do lead, para "o cliente fornece o ...". */
  lead?: { name?: string | null; email?: string | null; phone?: string | null };
};

export type TriggerVerdict = {
  status: "ativo" | "inativo" | "ia";
  detail: string;
};

const norm = (s: string) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const WEEKDAYS: Record<string, number> = {
  dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6,
};

/** "seg-sex 09:00-18:00" / "sáb 08:00 às 12:00" / "09:00-18:00" */
export function matchSchedule(spec: string, now: Date): boolean | null {
  const s = norm(spec);
  const hours = [...s.matchAll(/(\d{1,2})[:h](\d{2})?/g)].map((m) => Number(m[1]) * 60 + Number(m[2] ?? 0));
  if (hours.length < 2) return null;
  const [start, end] = [hours[0], hours[1]];

  const dayMatch = s.match(/(dom|seg|ter|qua|qui|sex|sab)\s*(?:-|a|ate|até)\s*(dom|seg|ter|qua|qui|sex|sab)/);
  const singleDays = [...s.matchAll(/\b(dom|seg|ter|qua|qui|sex|sab)\b/g)].map((m) => WEEKDAYS[m[1]]);
  const dow = now.getDay();
  let dayOk = true;
  if (dayMatch) {
    const a = WEEKDAYS[dayMatch[1]];
    const b = WEEKDAYS[dayMatch[2]];
    dayOk = a <= b ? dow >= a && dow <= b : dow >= a || dow <= b;
  } else if (singleDays.length) {
    dayOk = singleDays.includes(dow);
  }

  const minutes = now.getHours() * 60 + now.getMinutes();
  const timeOk = start <= end ? minutes >= start && minutes <= end : minutes >= start || minutes <= end;
  return dayOk && timeOk;
}

/** "30 minutos", "2 horas", "1 dia" → minutos */
export function parseDurationMinutes(spec: string): number | null {
  const s = norm(spec);
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(min|minuto|minutos|h|hora|horas|d|dia|dias)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  const unit = m[2];
  if (unit.startsWith("h")) return n * 60;
  if (unit.startsWith("d")) return n * 60 * 24;
  return n;
}

const POSITIVAS = ["obrigado", "obrigada", "otimo", "ótimo", "perfeito", "adorei", "gostei", "top", "maravilha", "show", "excelente", "legal", "bacana", "amei"];
const NEGATIVAS = ["pessimo", "péssimo", "horrivel", "ruim", "nao gostei", "cancelar", "reclamacao", "absurdo", "demora", "demorando", "problema", "erro", "insatisfeito", "decepcionado", "irritado", "revoltado", "palhacada", "merda", "porcaria", "raiva"];

export function detectSentiment(text: string): "positivo" | "negativo" | "neutro" {
  const t = norm(text);
  const pos = POSITIVAS.filter((w) => t.includes(norm(w))).length;
  const neg = NEGATIVAS.filter((w) => t.includes(norm(w))).length;
  if (neg > pos) return "negativo";
  if (pos > neg) return "positivo";
  return "neutro";
}

const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const RE_FONE = /(?:\+?55\s*)?\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/;
const RE_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;

/** Detecta se a mensagem atual entrega um dado pedido ("nome", "email"...). */
export function detectProvidedData(subject: string, ctx: TriggerContext): boolean | null {
  const s = norm(subject);
  const text = ctx.message;
  if (s.includes("mail")) return RE_EMAIL.test(text);
  if (s.includes("telefone") || s.includes("whats") || s.includes("celular")) return RE_FONE.test(text);
  if (s.includes("cpf") || s.includes("cnpj")) return RE_CPF.test(text);
  if (s.includes("endereco")) return /\b(rua|av\.?|avenida|travessa|bairro|cep|numero|nº|n°)\b/.test(norm(text));
  if (s.includes("nome")) {
    const t = text.trim();
    if (!t || t.length > 80) return false;
    // "meu nome é X" ou uma resposta curta em texto puro, quando ainda não temos nome real
    if (/\b(meu nome|me chamo|sou o|sou a)\b/.test(norm(t))) return true;
    const semNome = !ctx.lead?.name || /^lead\b|^contato\b|^\+?\d+$/i.test(String(ctx.lead?.name ?? ""));
    return semNome && /^[\p{L}\s'.-]{2,60}$/u.test(t) && t.split(/\s+/).length <= 4;
  }
  return null;
}

/**
 * Termos de busca: cada entrada pode conter vários termos separados por "/".
 * A barra permite frases inteiras com vírgulas, códigos e textos longos.
 */
export function splitTerms(subject: string): string[] {
  return String(subject ?? "")
    .split("/")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Assunto citado na mensagem? Casa por trecho, sem acento, e aceita "a / b / c". */
function mentionsSubject(text: string, subject: string): boolean {
  const termos = splitTerms(subject);
  if (!termos.length) return false;
  const alvo = norm(text);
  return termos.some((t) => alvo.includes(norm(t)));
}


export function evaluateTrigger(
  when: { trigger?: string; subjects?: string[]; custom?: string } | undefined,
  ctx: TriggerContext,
): TriggerVerdict {
  const trigger = String(when?.trigger ?? "");
  const subjects = [...(when?.subjects ?? []), when?.custom ?? ""].map((s) => String(s ?? "").trim()).filter(Boolean);
  const anySubject = (text: string) => subjects.some((s) => mentionsSubject(text, s));

  switch (trigger) {
    case "horario-especifico": {
      const res = subjects.map((s) => matchSchedule(s, ctx.now)).find((r) => r !== null);
      if (res === undefined || res === null) {
        return { status: "ia", detail: "janela de horário não reconhecida — confira o formato (ex.: seg-sex 09:00-18:00)" };
      }
      const hhmm = `${String(ctx.now.getHours()).padStart(2, "0")}:${String(ctx.now.getMinutes()).padStart(2, "0")}`;
      return { status: res ? "ativo" : "inativo", detail: `agora são ${hhmm}` };
    }
    case "formato-mensagem": {
      if (!subjects.length) return { status: "ia", detail: "nenhum formato selecionado" };
      const ok = subjects.some((s) => norm(s) === norm(ctx.messageFormat));
      return { status: ok ? "ativo" : "inativo", detail: `a mensagem atual é ${ctx.messageFormat}` };
    }
    case "nao-responde-ha": {
      const alvo = subjects.map(parseDurationMinutes).find((m) => m !== null);
      if (alvo == null) return { status: "ia", detail: "tempo não reconhecido (ex.: 30 minutos, 2 horas)" };
      if (ctx.minutesSinceCustomerMessage == null) return { status: "ia", detail: "tempo sem resposta desconhecido" };
      const ok = ctx.minutesSinceCustomerMessage >= alvo;
      return { status: ok ? "ativo" : "inativo", detail: `${Math.round(ctx.minutesSinceCustomerMessage)} min desde a última mensagem do cliente` };
    }
    case "mensagem-contem": {
      if (!subjects.length) return { status: "ia", detail: "nenhum termo informado" };
      const ok = anySubject(ctx.message);
      return { status: ok ? "ativo" : "inativo", detail: ok ? "termo encontrado na mensagem" : "termo não encontrado na mensagem atual" };
    }
    case "sentimento": {
      if (!subjects.length) return { status: "ia", detail: "nenhum sentimento selecionado" };
      const s = detectSentiment(ctx.message);
      const mapa: Record<string, string[]> = {
        positivo: ["positivo", "feliz"],
        negativo: ["negativo", "frustrado", "irritado"],
        neutro: ["neutro"],
      };
      const aceitos = subjects.map(norm);
      const ok = aceitos.some((a) => mapa[s]?.includes(a));
      // sinal fraco: se não bateu, ainda deixamos a IA confirmar
      return ok
        ? { status: "ativo", detail: `sentimento detectado: ${s}` }
        : { status: "ia", detail: `sentimento provável: ${s} — confirme pelo tom da conversa` };
    }
    case "cliente-fornece": {
      if (!subjects.length) return { status: "ia", detail: "nenhum dado selecionado" };
      const res = subjects.map((s) => detectProvidedData(s, ctx));
      if (res.every((r) => r === null)) return { status: "ia", detail: "dado sem detector automático" };
      const ok = res.some((r) => r === true);
      return { status: ok ? "ativo" : "inativo", detail: ok ? "dado identificado na mensagem atual" : "o cliente ainda não forneceu esse dado nesta mensagem" };
    }
    case "primeira-vez-pergunta": {
      if (!subjects.length) return { status: "ia", detail: "nenhum assunto selecionado" };
      const agora = anySubject(ctx.message);
      if (!agora) return { status: "inativo", detail: "o assunto não apareceu na mensagem atual" };
      const jaFalou = ctx.history.some((m) => m.role === "user" && anySubject(m.content));
      return jaFalou
        ? { status: "inativo", detail: "o cliente já tinha perguntado sobre isso antes" }
        : { status: "ativo", detail: "é a primeira vez que o cliente toca nesse assunto" };
    }
    case "toda-vez-pergunta": {
      if (!subjects.length) return { status: "ia", detail: "nenhum assunto selecionado" };
      const ok = anySubject(ctx.message);
      return ok
        ? { status: "ativo", detail: "o assunto apareceu na mensagem atual" }
        : { status: "ia", detail: "o assunto não apareceu literalmente — avalie a intenção" };
    }
    case "cliente-quer": {
      if (!subjects.length) return { status: "ia", detail: "nenhuma intenção selecionada" };
      const ok = anySubject(ctx.message);
      return ok
        ? { status: "ativo", detail: "intenção citada na mensagem atual" }
        : { status: "ia", detail: "avalie pela intenção do cliente, não só pela palavra" };
    }
    default:
      return { status: "ia", detail: "avalie pelo contexto da conversa" };
  }
}

/** Bloco de fatos objetivos para o modelo (o que ele não consegue saber sozinho). */
export function describeConversationFacts(ctx: TriggerContext): string {
  const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const hhmm = `${String(ctx.now.getHours()).padStart(2, "0")}:${String(ctx.now.getMinutes()).padStart(2, "0")}`;
  const linhas = [
    `- Agora: ${dias[ctx.now.getDay()]}, ${String(ctx.now.getDate()).padStart(2, "0")}/${String(ctx.now.getMonth() + 1).padStart(2, "0")} às ${hhmm}`,
    `- Formato da última mensagem do cliente: ${ctx.messageFormat}`,
    ctx.minutesSinceCustomerMessage == null
      ? "- Tempo desde a última mensagem do cliente: desconhecido"
      : `- Tempo desde a última mensagem do cliente: ${Math.round(ctx.minutesSinceCustomerMessage)} minuto(s)`,
    `- Mensagens anteriores nesta conversa: ${ctx.history.length}`,
    ctx.messageFormat === "áudio" && /^\[áudio transcrito\]/i.test(ctx.message)
      ? `- Transcrição do áudio recebido: "${ctx.message.replace(/^\[áudio transcrito\]\s*/i, "").slice(0, 1200)}"`
      : "",
  ].filter(Boolean);

  return ["FATOS DA CONVERSA AGORA (calculados pelo sistema, confie neles):", ...linhas].join("\n");
}
