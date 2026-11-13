export const MAX_BROADCAST_VARIANTS = 50;
export const MAX_BROADCAST_PHRASE_LENGTH = 4096;
export const MIN_BROADCAST_INTERVAL_SECONDS = 0.5;
export const MAX_BROADCAST_INTERVAL_SECONDS = 15;

export function broadcastLines(value: string) {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

export function parseBroadcastRotation(phraseText: string, intervalText: string) {
  const messages = broadcastLines(phraseText);
  const intervals = broadcastLines(intervalText);

  if (!messages.length || messages.length > MAX_BROADCAST_VARIANTS) {
    throw new Error("Informe de 1 a 50 frases, uma por linha.");
  }
  if (messages.some(message => message.length > MAX_BROADCAST_PHRASE_LENGTH)) {
    throw new Error("Cada frase deve ter até 4.096 caracteres.");
  }
  if (!intervals.length || intervals.length > MAX_BROADCAST_VARIANTS) {
    throw new Error("Informe de 1 a 50 intervalos em segundos, um por linha.");
  }

  const intervalsMs = intervals.map(value => {
    const seconds = Number(value.replace(",", "."));
    if (!/^\d+(?:[.,]\d{1,3})?$/.test(value) || !Number.isFinite(seconds)
      || seconds < MIN_BROADCAST_INTERVAL_SECONDS || seconds > MAX_BROADCAST_INTERVAL_SECONDS) {
      throw new Error("Use intervalos de 0,5 a 15 segundos. Exemplo: 1,5.");
    }
    return Math.round(seconds * 1000);
  });
  return { messages, intervalsMs };
}
