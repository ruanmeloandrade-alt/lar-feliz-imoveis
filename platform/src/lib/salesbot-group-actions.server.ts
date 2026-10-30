import { normalizeInternationalPhone, whatsappIdentityFromJid } from "./whatsapp-identity";

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnySb = {
  from: (table: string) => any;
  rpc: (name: string, args?: Record<string, unknown>) => any;
};

type EvoParticipant = { id?: string | null; admin?: string | null };
type EvoGroupPayload = {
  participants?: EvoParticipant[];
  group?: { participants?: EvoParticipant[] };
};

/**
 * Compatibilidade isolada para instalações Evolution em transição entre schemas
 * de sendText. O runtime envia o formato moderno primeiro. Somente se a
 * Evolution devolver HTTP 400 para um JID `@g.us`, repetimos com os campos
 * moderno (`text`) e legado (`textMessage.text`) juntos.
 *
 * Isso cobre versões em que o schema exige `text` no topo mas o caminho Baileys
 * ainda consulta `textMessage`. O shim é restrito a GRUPOS e não toca 1-a-1.
 */
const GROUP_TEXT_FETCH_SHIM = Symbol.for("mkton.evolution.groupTextFetchCompatibility");

function installEvolutionGroupTextCompatibility(): void {
  const globalRecord = globalThis as typeof globalThis & { [GROUP_TEXT_FETCH_SHIM]?: boolean };
  if (globalRecord[GROUP_TEXT_FETCH_SHIM] || typeof globalThis.fetch !== "function") return;

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = String(init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = init?.body;

    if (method !== "POST" || !url.includes("/message/sendText/") || typeof body !== "string") {
      return originalFetch(input, init);
    }

    let payload: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(body) as unknown;
      payload = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
    } catch {
      payload = null;
    }

    const number = String(payload?.number ?? "").trim();
    const text = typeof payload?.text === "string" ? payload.text : "";
    if (!payload || !number.endsWith("@g.us") || !text) {
      return originalFetch(input, init);
    }

    const first = await originalFetch(input, init);
    if (first.status !== 400) return first;

    const mentioned = Array.isArray(payload.mentioned)
      ? payload.mentioned.map(String).filter(Boolean)
      : [];
    const mentionsEveryOne = payload.mentionsEveryOne === true;
    const compatibilityPayload: Record<string, unknown> = {
      number,
      text,
      textMessage: { text },
    };

    const delay = Number(payload.delay ?? 0);
    const presence = typeof payload.presence === "string" ? payload.presence : undefined;
    if (delay > 0 || presence || mentionsEveryOne || mentioned.length > 0) {
      compatibilityPayload.options = {
        ...(delay > 0 ? { delay } : {}),
        ...(presence ? { presence } : {}),
        ...(mentionsEveryOne || mentioned.length > 0
          ? { mentions: { everyOne: mentionsEveryOne, mentioned } }
          : {}),
      };
    }

    return originalFetch(input, { ...init, body: JSON.stringify(compatibilityPayload) });
  }) as typeof globalThis.fetch;

  globalRecord[GROUP_TEXT_FETCH_SHIM] = true;
}

installEvolutionGroupTextCompatibility();

function trustedDirectPhoneDigits(value: unknown): string | null {
  const jidIdentity = whatsappIdentityFromJid(value);
  if (jidIdentity) return jidIdentity.kind === "direct" ? jidIdentity.digits : null;

  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.includes("@")) return null;

  const normalized = normalizeInternationalPhone(raw, { allowTrustedBare: true });
  return normalized.ok ? normalized.digits : null;
}

/**
 * Normaliza participante real da Evolution.
 *
 * Aceita JID direto @s.whatsapp.net (inclusive com sufixo de device) ou um
 * número bruto já vindo de campo técnico confiável. @lid, @g.us,
 * broadcast/status e identificadores arbitrários nunca viram telefone.
 */
export function normalizeEvolutionParticipantPhone(value: unknown): string | null {
  return trustedDirectPhoneDigits(value);
}

/** Telefone privado de quem disparou/interagiu no fluxo de grupo. */
export function getSalesbotGroupParticipantPhone(variables: Record<string, unknown> | null | undefined): string | null {
  const vars = variables ?? {};
  const candidates = [
    vars.participante_telefone,
    vars.membro_telefone,
    vars.sender_phone,
    vars.participant_phone,
    vars.member_phone,
  ];
  for (const candidate of candidates) {
    const phone = normalizeEvolutionParticipantPhone(candidate);
    if (phone) return phone;
  }
  return null;
}

/** JID do grupo que originou a run. */
export function getSalesbotGroupJid(
  leadPhone: string | null | undefined,
  variables: Record<string, unknown> | null | undefined,
): string | null {
  const vars = variables ?? {};
  const candidates = [vars.group_jid, vars.grupo_jid, vars.remote_jid, vars.chat_jid, leadPhone];
  for (const candidate of candidates) {
    const jid = String(candidate ?? "").trim();
    if (jid.endsWith("@g.us")) return jid;
  }
  return null;
}

/** Extrai somente admins reais, sem duplicar e sem incluir o próprio número conectado. */
export function getAdminPhonesFromEvolutionPayload(payload: unknown, ownPhone?: string | null): string[] {
  const parsed = (payload ?? {}) as EvoGroupPayload;
  const participants = Array.isArray(payload)
    ? (payload as EvoParticipant[])
    : Array.isArray(parsed.participants)
      ? parsed.participants
      : Array.isArray(parsed.group?.participants)
        ? parsed.group!.participants!
        : [];
  const ownDigits = trustedDirectPhoneDigits(ownPhone);
  const phones = new Set<string>();
  for (const participant of participants) {
    if (participant?.admin !== "admin" && participant?.admin !== "superadmin") continue;
    const digits = trustedDirectPhoneDigits(participant.id);
    if (!digits) continue;
    // A exclusão do próprio número é por identidade completa. Sufixo não é
    // suficiente: DDIs diferentes podem compartilhar os mesmos últimos dígitos.
    if (ownDigits && digits === ownDigits) continue;
    phones.add(digits);
  }
  return [...phones];
}

type ResolveGroupAdminsResult =
  | { ok: true; phones: string[]; sessionId: string }
  | { ok: false; phones: []; error: string };

/**
 * Busca os admins atuais do grupo na mesma sessão Evolution do workspace.
 * A consulta ao banco sempre exige workspace_id + group_jid para impedir
 * reutilização acidental de sessão de outro tenant.
 */
export async function resolveSalesbotGroupAdminPhones(
  supabaseAdmin: AnySb,
  workspaceId: string,
  groupJid: string,
): Promise<ResolveGroupAdminsResult> {
  if (!groupJid.endsWith("@g.us")) return { ok: false, phones: [], error: "grupo inválido" };

  const { data: group, error: groupError } = await supabaseAdmin
    .from("whatsapp_groups")
    .select("session_id, group_jid")
    .eq("workspace_id", workspaceId)
    .eq("group_jid", groupJid)
    .maybeSingle();
  if (groupError) return { ok: false, phones: [], error: groupError.message ?? "erro ao localizar grupo" };
  const sessionId = String((group as { session_id?: string } | null)?.session_id ?? "").trim();
  if (!sessionId) return { ok: false, phones: [], error: "grupo não sincronizado neste workspace" };

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("whatsapp_web_sessions")
    .select("id, phone_number, status")
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId)
    .eq("provider", "evolution")
    .eq("status", "conectado")
    .maybeSingle();
  if (sessionError) return { ok: false, phones: [], error: sessionError.message ?? "erro ao localizar sessão" };
  if (!session) return { ok: false, phones: [], error: "sessão Evolution do grupo não está conectada neste workspace" };

  const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encryptionKey) return { ok: false, phones: [], error: "INTEGRATION_ENCRYPTION_KEY ausente" };
  const { data: creds, error: credsError } = await supabaseAdmin.rpc("get_evolution_credentials_service", {
    _session_id: sessionId,
    _key: encryptionKey,
  });
  if (credsError) return { ok: false, phones: [], error: credsError.message ?? "credenciais Evolution indisponíveis" };
  const c = creds as { instance_name?: string; api_key?: string } | null;
  if (!c?.instance_name || !c.api_key) return { ok: false, phones: [], error: "credenciais Evolution indisponíveis" };

  const base = String(process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base) return { ok: false, phones: [], error: "EVOLUTION_BASE_URL não configurado" };

  try {
    const response = await fetch(
      `${base}/group/findGroupInfos/${encodeURIComponent(c.instance_name)}?groupJid=${encodeURIComponent(groupJid)}`,
      { headers: { apikey: c.api_key } },
    );
    const json = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, phones: [], error: `Evolution ${response.status}` };
    const phones = getAdminPhonesFromEvolutionPayload(
      json,
      (session as { phone_number?: string | null }).phone_number ?? null,
    );
    if (!phones.length) return { ok: false, phones: [], error: "nenhum administrador disponível para notificação" };
    return { ok: true, phones, sessionId };
  } catch (error) {
    return { ok: false, phones: [], error: (error as Error).message };
  }
}