const PAUSA_ALIASES: Readonly<Record<string, string>> = {
  "exceto-expediente": "ate-expediente",
  "exceto-fora-expediente": "ate-fora-expediente",
};

/**
 * Normaliza nomes legados de pausa que executam exatamente a mesma regra no runtime.
 * Mantemos a leitura compatível para bots antigos, mas a UI pode trabalhar apenas
 * com os nomes canônicos sem oferecer opções duplicadas.
 */
export function canonicalSalesbotPauseType(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return PAUSA_ALIASES[value] ?? value;
}

/** Normaliza os campos de pausa presentes no config persistido de um bloco. */
export function normalizeSalesbotPauseConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...config };
  if ("pausaTipo" in next) {
    next.pausaTipo = canonicalSalesbotPauseType(next.pausaTipo);
  }
  if (Array.isArray(next.pausas)) {
    next.pausas = next.pausas.map((item) => {
      if (!item || typeof item !== "object") return item;
      const pause = item as Record<string, unknown>;
      return { ...pause, tipo: canonicalSalesbotPauseType(pause.tipo) };
    });
  }
  return next;
}

export function isLegacySalesbotPauseType(value: unknown): boolean {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PAUSA_ALIASES, value);
}
