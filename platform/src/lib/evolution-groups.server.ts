// Evolution API, endpoints de moderação de grupos.
// Todas as funções recebem { baseUrl, apiKey, instance } e retornam { ok, status, json/error }.
// Ver Evolution v2: /group/updateParticipant, /message/delete, /group/updateGroupSubject etc.

type EvoCtx = { baseUrl: string; apiKey: string; instance: string };
type EvoResult = { ok: boolean; status: number; error?: string; data?: unknown };

async function call(ctx: EvoCtx, method: string, path: string, body?: unknown): Promise<EvoResult> {
  const base = ctx.baseUrl.replace(/\/+$/, "");
  const url = `${base}${path}`;
  try {
    const resp = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", apikey: ctx.apiKey },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await resp.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 400) }; }
    if (!resp.ok) {
      const j = json as { message?: string | string[]; error?: string; response?: { message?: string } };
      const msg = Array.isArray(j?.message) ? j.message.join(", ") : (j?.message ?? j?.error ?? j?.response?.message ?? `HTTP ${resp.status}`);
      return { ok: false, status: resp.status, error: String(msg) };
    }
    return { ok: true, status: resp.status, data: json };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}

function normalizeParticipants(list: string[], groupJid: string): string[] {
  return list.map((raw) => {
    const t = String(raw ?? "").trim();
    if (!t) return "";
    if (t.includes("@")) return t;
    const digits = t.replace(/\D/g, "");
    return `${digits}@s.whatsapp.net`;
  }).filter(Boolean).filter((v) => v !== groupJid);
}

/** Remove uma mensagem para todos no grupo (apagar mensagem). */
export function deleteGroupMessage(ctx: EvoCtx, args: {
  groupJid: string; messageId: string; participant: string; fromMe: boolean;
}): Promise<EvoResult> {
  return call(ctx, "DELETE", `/chat/deleteMessageForEveryone/${encodeURIComponent(ctx.instance)}`, {
    id: args.messageId,
    remoteJid: args.groupJid,
    participant: args.participant,
    fromMe: args.fromMe,
  });
}

/** Ação sobre participantes: add | remove | promote | demote. */
export function updateGroupParticipants(ctx: EvoCtx, args: {
  groupJid: string; action: "add" | "remove" | "promote" | "demote"; participants: string[];
}): Promise<EvoResult> {
  const parts = normalizeParticipants(args.participants, args.groupJid);
  if (!parts.length) return Promise.resolve({ ok: false, status: 400, error: "Nenhum participante válido" });
  return call(ctx, "POST",
    `/group/updateParticipant/${encodeURIComponent(ctx.instance)}?groupJid=${encodeURIComponent(args.groupJid)}`,
    { action: args.action, participants: parts });
}

/** Muda o nome (subject) do grupo. */
export function updateGroupSubject(ctx: EvoCtx, args: { groupJid: string; subject: string }): Promise<EvoResult> {
  return call(ctx, "POST",
    `/group/updateGroupSubject/${encodeURIComponent(ctx.instance)}?groupJid=${encodeURIComponent(args.groupJid)}`,
    { subject: args.subject });
}

/** Muda a descrição do grupo. */
export function updateGroupDescription(ctx: EvoCtx, args: { groupJid: string; description: string }): Promise<EvoResult> {
  return call(ctx, "POST",
    `/group/updateGroupDescription/${encodeURIComponent(ctx.instance)}?groupJid=${encodeURIComponent(args.groupJid)}`,
    { description: args.description });
}

/** Muda a foto do grupo (url http ou base64). */
export function updateGroupPicture(ctx: EvoCtx, args: { groupJid: string; image: string }): Promise<EvoResult> {
  return call(ctx, "POST",
    `/group/updateGroupPicture/${encodeURIComponent(ctx.instance)}?groupJid=${encodeURIComponent(args.groupJid)}`,
    { image: args.image });
}

/** Restrição de envio (announcement = só admins mandam) ou libera / trava edição. */
export function updateGroupSetting(ctx: EvoCtx, args: {
  groupJid: string; action: "announcement" | "not_announcement" | "locked" | "unlocked";
}): Promise<EvoResult> {
  return call(ctx, "POST",
    `/group/updateSetting/${encodeURIComponent(ctx.instance)}?groupJid=${encodeURIComponent(args.groupJid)}`,
    { action: args.action });
}

/** Mensagens temporárias, expiration em segundos (0/86400/604800/7776000). */
export function toggleEphemeral(ctx: EvoCtx, args: { groupJid: string; expiration: 0 | 86400 | 604800 | 7776000 }): Promise<EvoResult> {
  return call(ctx, "POST",
    `/group/toggleEphemeral/${encodeURIComponent(ctx.instance)}?groupJid=${encodeURIComponent(args.groupJid)}`,
    { expiration: args.expiration });
}

/** Bot sai do grupo. */
export function leaveGroup(ctx: EvoCtx, args: { groupJid: string }): Promise<EvoResult> {
  return call(ctx, "DELETE",
    `/group/leaveGroup/${encodeURIComponent(ctx.instance)}?groupJid=${encodeURIComponent(args.groupJid)}`);
}

/** Envia enquete no grupo. */
export function sendGroupPoll(ctx: EvoCtx, args: {
  groupJid: string; name: string; options: string[]; selectableCount?: number;
}): Promise<EvoResult> {
  const values = args.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 12);
  if (values.length < 2) return Promise.resolve({ ok: false, status: 400, error: "Enquete precisa de 2+ opções" });
  return call(ctx, "POST", `/message/sendPoll/${encodeURIComponent(ctx.instance)}`, {
    number: args.groupJid,
    name: args.name.slice(0, 255),
    selectableCount: Math.max(1, Math.min(values.length, args.selectableCount ?? 1)),
    values,
  });
}

/** Menciona todos os participantes do grupo em uma mensagem. */
export function mentionEveryone(ctx: EvoCtx, args: { groupJid: string; text: string }): Promise<EvoResult> {
  return call(ctx, "POST", `/message/sendText/${encodeURIComponent(ctx.instance)}`, {
    number: args.groupJid,
    text: args.text,
    mentionsEveryOne: true,
  });
}

/** Busca metadados do grupo (subject, descrição, participantes). */
export function fetchGroupInfo(ctx: EvoCtx, args: { groupJid: string }): Promise<EvoResult> {
  return call(ctx, "GET",
    `/group/findGroupInfos/${encodeURIComponent(ctx.instance)}?groupJid=${encodeURIComponent(args.groupJid)}`);
}
