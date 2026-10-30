export type WhatsappPhoneNormalization =
  | {
      ok: true;
      digits: string;
      e164: string;
      source: "explicit_plus" | "international_00" | "trusted_bare";
    }
  | {
      ok: false;
      reason: "empty" | "invalid" | "ambiguous";
    };

export type WhatsappJidIdentity =
  | {
      kind: "direct";
      remoteJid: string;
      number: string;
      digits: string;
      e164: string;
    }
  | {
      kind: "group";
      remoteJid: string;
      number: string;
      digits: null;
      e164: null;
    };

const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;
const PHONE_SEPARATORS = /[\s().-]+/g;

function validE164Digits(digits: string): boolean {
  return (
    digits.length >= E164_MIN_DIGITS &&
    digits.length <= E164_MAX_DIGITS &&
    /^[1-9]\d+$/.test(digits)
  );
}

function onlyPhoneSyntax(value: string): boolean {
  return /^[+\d\s().-]+$/.test(value);
}

/**
 * Normaliza telefone internacional sem adivinhar país.
 *
 * - +<DDI...> é explícito e vira E.164;
 * - 00<DDI...> é prefixo internacional explícito e vira +<DDI...>;
 * - dígitos sem prefixo só são aceitos quando a origem já é tecnicamente
 *   confiável (ex.: phone_normalized produzido de um JID real). Entrada livre
 *   sem +/00 permanece ambígua.
 */
export function normalizeInternationalPhone(
  value: unknown,
  options: { allowTrustedBare?: boolean } = {},
): WhatsappPhoneNormalization {
  if (typeof value !== "string" || !value.trim()) return { ok: false, reason: "empty" };
  const raw = value.trim();
  if (!onlyPhoneSyntax(raw)) return { ok: false, reason: "invalid" };

  const compact = raw.replace(PHONE_SEPARATORS, "");
  if (compact.startsWith("+")) {
    const digits = compact.slice(1);
    if (!validE164Digits(digits)) return { ok: false, reason: "invalid" };
    return { ok: true, digits, e164: `+${digits}`, source: "explicit_plus" };
  }

  if (compact.startsWith("00")) {
    const digits = compact.slice(2);
    if (!validE164Digits(digits)) return { ok: false, reason: "invalid" };
    return { ok: true, digits, e164: `+${digits}`, source: "international_00" };
  }

  if (!/^\d+$/.test(compact)) return { ok: false, reason: "invalid" };
  if (!validE164Digits(compact)) return { ok: false, reason: "invalid" };
  if (!options.allowTrustedBare) return { ok: false, reason: "ambiguous" };
  return { ok: true, digits: compact, e164: `+${compact}`, source: "trusted_bare" };
}

/**
 * Interpreta somente JIDs de conversa que podem ser roteados com segurança.
 * Broadcast/status/LID não são convertidos em telefone.
 */
export function whatsappIdentityFromJid(value: unknown): WhatsappJidIdentity | null {
  if (typeof value !== "string") return null;
  const remoteJid = value.trim();
  if (!remoteJid) return null;
  const lower = remoteJid.toLowerCase();

  if (lower.endsWith("@g.us")) {
    const local = remoteJid.slice(0, remoteJid.length - "@g.us".length);
    if (!/^[\d-]+$/.test(local) || local.replace(/\D/g, "").length < 8) return null;
    return {
      kind: "group",
      remoteJid,
      number: remoteJid,
      digits: null,
      e164: null,
    };
  }

  if (!lower.endsWith("@s.whatsapp.net")) return null;
  const local = remoteJid.slice(0, remoteJid.length - "@s.whatsapp.net".length);
  const account = local.split(":")[0] ?? "";
  if (!/^\d+$/.test(account) || !validE164Digits(account)) return null;
  return {
    kind: "direct",
    remoteJid,
    number: account,
    digits: account,
    e164: `+${account}`,
  };
}

/**
 * Resolve a identidade roteável exposta pela Evolution.
 * Versões recentes podem entregar o JID primário como @lid e o número real em
 * remoteJidAlt. Nunca convertemos os dígitos do LID em telefone.
 */
export function whatsappIdentityFromEvolutionJids(
  remoteJid: unknown,
  remoteJidAlt?: unknown,
): WhatsappJidIdentity | null {
  const primary = whatsappIdentityFromJid(remoteJid);
  if (primary) return primary;

  if (
    typeof remoteJid === "string" &&
    remoteJid.trim().toLowerCase().endsWith("@lid")
  ) {
    const alternate = whatsappIdentityFromJid(remoteJidAlt);
    return alternate?.kind === "direct" ? alternate : null;
  }

  return null;
}

export function directWhatsappJidFromCanonicalDigits(digits: string): string | null {
  if (!validE164Digits(digits)) return null;
  return `${digits}@s.whatsapp.net`;
}

export function conversationKey(sessionId: string, remoteJid: string): string {
  return `${sessionId}:${remoteJid.trim().toLowerCase()}`;
}
