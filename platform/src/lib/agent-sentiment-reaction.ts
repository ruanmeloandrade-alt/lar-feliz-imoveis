// Reação por sentimento: o agente IA responde a mensagem do lead com um emoji
// coerente com o tom que ele percebeu. Serve tanto para o Agente de Prompt
// quanto para o Fluxo de Objetivos — a configuração é a mesma
// (`settings.allowed_actions` contém "reagir-sentimento").

export type SentimentoDetectado = "positivo" | "negativo" | "neutro";

/** Emoji padrão por sentimento. Discreto, nada de exagero em atendimento. */
const EMOJI_PADRAO: Record<SentimentoDetectado, string> = {
  positivo: "❤️",
  negativo: "😔",
  neutro: "👍",
};

/**
 * Sinais mais fortes que o sentimento genérico: quando o lead agradece,
 * comemora ou reclama de algo específico, um emoji mais preciso comunica
 * melhor do que o padrão do sentimento.
 */
const SINAIS: Array<{ re: RegExp; emoji: string }> = [
  { re: /\b(obrigad|valeu|agradeç|gratid)/i, emoji: "🙏" },
  { re: /\b(kkk+|haha+|rsrs+|😂|🤣)/i, emoji: "😂" },
  { re: /\b(fechado|fechou|bora|vamos que vamos|top demais|perfeito)\b/i, emoji: "🔥" },
  { re: /\b(parab[ée]ns|comemor|consegui)\b/i, emoji: "🎉" },
  { re: /\b(caro|car[íi]ssimo|sem dinheiro|apertad)/i, emoji: "😕" },
  { re: /\b(urgente|agora mesmo|correndo)\b/i, emoji: "⚡" },
];

/** Escolhe o emoji de reação para a mensagem recebida. */
export function pickReactionEmoji(message: string, sentimento: SentimentoDetectado): string {
  const texto = String(message ?? "");
  for (const s of SINAIS) if (s.re.test(texto)) return s.emoji;
  return EMOJI_PADRAO[sentimento] ?? "👍";
}

/** O agente está autorizado a reagir por sentimento? */
export function shouldReactToSentiment(allowedActions: unknown): boolean {
  return Array.isArray(allowedActions) && allowedActions.includes("reagir-sentimento");
}

/** O agente está autorizado a ouvir/transcrever áudios do lead? */
export function shouldListenToAudio(allowedActions: unknown): boolean {
  // Ligado por padrão: se o cliente não desmarcou explicitamente, o agente ouve.
  if (!Array.isArray(allowedActions)) return true;
  if (allowedActions.includes("ouvir-audio")) return true;
  // Só considera desligado se a lista já foi configurada com outras ações.
  return allowedActions.length === 0;
}
