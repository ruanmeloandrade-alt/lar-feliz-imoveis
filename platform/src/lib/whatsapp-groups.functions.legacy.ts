import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {attachSupabaseAuth} from "@/integrations/supabase/auth-attacher";
import {GroupPromptInputSchema,saveGroupPromptAgent,authorizeGroupActor} from "./slim-group-prompt.core";
import {mergePromptMetadata} from "./slim-prompt-only.core";
import { parseSlimInboxGroupConversationKey } from "./slim-inbox-group-key.core";
import { SLIM_GROUP_HISTORY_SELECT, slimProjectedGroupMessage, type SlimGroupHistoryRow } from "./slim-inbox-group-history.core";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type GroupRow = {
  id: string;
  workspace_id: string;
  session_id: string;
  group_jid: string;
  name: string | null;
  subject: string | null;
  description: string | null;
  picture_url: string | null;
  participants_count: number;
  is_admin: boolean;
  is_announce: boolean;
  invite_code: string | null;
  active_bot_id: string | null;
  active_ai_agent_id: string | null;
  rules: JsonValue;
  metadata: JsonValue;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};
type SalesbotRow = { id: string; nome: string; ativo: boolean; scope: string; updated_at: string };
export type GroupAgentTriggerType =
  | "mention"
  | "keyword"
  | "all_messages"
  | "member_join"
  | "member_leave"
  | "webhook"
  | "schedule"
  | "lead_stage_change";

export type GroupAgentTrigger = {
  id: string;
  type: GroupAgentTriggerType;
  enabled: boolean;
  config: JsonValue;
};

type AgentRow = {
  id: string;
  workspace_id: string;
  name: string;
  persona: string | null;
  system_prompt: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
  respond_only_when_mentioned: boolean;
  cooldown_seconds: number;
  enabled: boolean;
  triggers: GroupAgentTrigger[] | null;
  metadata: JsonValue | null;
  created_at: string;
  updated_at: string;
};

// ============================================================
// WhatsApp Groups, Central de Grupos (Evolution)
// ============================================================
// Cache local de grupos + operações via Evolution API.
// Isolado do fluxo 1-a-1: mensagens de grupo NÃO viram lead.

function encKey(): string {
  const k = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!k) throw new Error("INTEGRATION_ENCRYPTION_KEY missing");
  return k;
}

function baseUrl(): string {
  const b = process.env.EVOLUTION_BASE_URL;
  if (!b) throw new Error("EVOLUTION_BASE_URL missing");
  return b.replace(/\/+$/, "");
}

function globalKey(): string {
  const k = process.env.EVOLUTION_GLOBAL_API_KEY;
  if (!k) throw new Error("EVOLUTION_GLOBAL_API_KEY missing");
  return k;
}

async function evoFetch(
  path: string,
  init: { method?: string; apiKey?: string; body?: unknown } = {},
): Promise<{ status: number; ok: boolean; json: unknown }> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: init.apiKey ?? globalKey(),
  };
  const resp = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await resp.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: resp.status, ok: resp.ok, json };
}

type EvoCreds = {
  workspace_id: string;
  instance_name: string;
  api_key: string;
};

type SbRpc = {
  rpc: (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type AnySb = {
  from: (t: string) => any;
  rpc: (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  const wsId = (prof as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!wsId) throw new Error("Workspace ativo não encontrado.");
  return wsId;
}

async function loadCreds(sb: SbRpc, sessionId: string): Promise<EvoCreds> {
  const { data, error } = await sb.rpc("get_evolution_credentials", {
    _session_id: sessionId,
    _key: encKey(),
  });
  if (error) throw new Error(error.message ?? "rpc error");
  if (!data) throw new Error("Sessão Evolution não encontrada.");
  return data as unknown as EvoCreds;
}

// ---------- Tipos vindos do Evolution ----------
interface EvoGroup {
  id?: string;
  subject?: string;
  subjectOwner?: string;
  desc?: string;
  size?: number;
  participants?: Array<{ id: string; admin?: string | null }>;
  pictureUrl?: string | null;
  announce?: boolean;
  inviteCode?: string;
}

// ---------- Listar grupos do workspace ----------
const ListSchema = z.object({
  workspaceId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
});

export const listWorkspaceGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            c: string,
            v: unknown,
          ) => {
            eq: (
              c: string,
              v: unknown,
            ) => {
              order: (
                c: string,
                o: { ascending: boolean },
              ) => Promise<{ data: unknown; error: { message?: string } | null }>;
            };
            order: (
              c: string,
              o: { ascending: boolean },
            ) => Promise<{ data: unknown; error: { message?: string } | null }>;
          };
        };
      };
    };

    const q = supabase.from("whatsapp_groups").select("*").eq("workspace_id", data.workspaceId);

    const res = data.sessionId
      ? await q.eq("session_id", data.sessionId).order("name", { ascending: true })
      : await q.order("name", { ascending: true });

    if (res.error) throw new Error(res.error.message ?? "erro ao listar grupos");
    return (res.data as unknown as GroupRow[]) ?? [];
  });

export interface InboxGroupConversationRow {
  id: string;
  groupId: string;
  groupJid: string;
  sessionId: string;
  name: string;
  subtitle: string;
  pictureUrl: string | null;
  lastMessageFrom: "lead" | "us" | "none";
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
}

function previewFromMessage(body: string | null, messageType: string | null): string {
  const clean = body?.trim();
  if (clean) return clean;
  const type = (messageType ?? "").toLowerCase();
  if (type.includes("image")) return "Imagem";
  if (type.includes("video")) return "Vídeo";
  if (type.includes("audio")) return "Áudio";
  if (type.includes("document")) return "Documento";
  if (type.includes("sticker")) return "Figurinha";
  return "Mensagem";
}

const InboxGroupConversationCursorSchema = z.object({
  lastMessageAt: z.string().datetime({ offset: true }),
  key: z.string().min(1),
});

export const listInboxGroupConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().max(200).optional(),
        cursor: InboxGroupConversationCursorSchema.optional(),
        limit: z.number().int().min(10).max(100).optional().default(40),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: raw, error } = await sb.rpc("list_inbox_group_conversations_page", {
      _workspace_id: wsId,
      _limit: data.limit,
      _cursor_at: data.cursor?.lastMessageAt ?? null,
      _cursor_key: data.cursor?.key ?? null,
      _search: data.search?.trim() || null,
    });
    if (error) throw new Error(error.message ?? "Falha ao listar grupos do Inbox.");

    const rpcRows = (raw ?? []) as Array<{
      conversation_key: string;
      group_id: string | null;
      group_jid: string;
      session_id: string | null;
      name: string;
      description: string | null;
      picture_url: string | null;
      participants_count: number | null;
      body: string | null;
      message_type: string | null;
      from_me: boolean | null;
      sender_name: string | null;
      last_message_at: string;
    }>;

    const hasMore = rpcRows.length > data.limit;
    const pageRows = rpcRows.slice(0, data.limit);
    const search = data.search?.trim().toLowerCase();
    const visibleRows = search
      ? pageRows.filter((row) =>
          [row.name, row.description, row.group_jid].some((value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(search),
          ),
        )
      : pageRows;

    const conversations: InboxGroupConversationRow[] = visibleRows.map((row) => {
      const participantText =
        typeof row.participants_count === "number" && row.participants_count > 0
          ? `${row.participants_count} participantes`
          : "Grupo";
      return {
        id: row.group_id ?? row.conversation_key,
        groupId: row.group_id ?? row.conversation_key,
        groupJid: row.group_jid,
        sessionId: row.session_id ?? "",
        name: row.name,
        subtitle: [participantText, row.description].filter(Boolean).join(" · "),
        pictureUrl: row.picture_url,
        lastMessageFrom:
          row.from_me == null ? "none" : row.from_me ? "us" : "lead",
        lastMessagePreview:
          row.from_me == null
            ? "Sem mensagens ainda."
            : previewFromMessage(row.body, row.message_type),
        lastMessageAt: row.last_message_at,
        unreadCount: 0,
      };
    });

    const cursorRow = pageRows.at(-1);
    return {
      conversations,
      hasMore,
      nextCursor:
        hasMore && cursorRow
          ? {
              lastMessageAt: cursorRow.last_message_at,
              key: cursorRow.conversation_key,
            }
          : null,
      pageSize: data.limit,
    };
  });

const InboxGroupMessageCursorSchema = z.object({
  occurredAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

export const listInboxGroupMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        groupId: z.string().min(1),
        groupJid: z.string().optional(),
        cursor: InboxGroupMessageCursorSchema.optional(),
        // Compatibilidade transitória com chamadores anteriores.
        before: z.string().datetime({ offset: true }).optional(),
        // Delta incremental do cache F3. Não participa da paginação histórica.
        after: z.string().datetime({ offset: true }).optional(),
        limit: z.number().int().min(1).max(200).optional().default(50),
      })
      .refine(
        (value) => [Boolean(value.cursor), Boolean(value.before), Boolean(value.after)].filter(Boolean).length <= 1,
        { message: "cursor, before e after são mutuamente exclusivos" },
      )
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    let groupJid = data.groupJid;
    let sessionId: string | null = null;
    const parsed = parseSlimInboxGroupConversationKey(data.groupId, data.groupJid);
    if (parsed) {
      groupJid = parsed.groupJid;
      sessionId = parsed.sessionId;
    }
    if (!groupJid && data.groupId.includes("@g.us")) groupJid = data.groupId;
    if (!groupJid) {
      const { data: group, error } = await sb
        .from("whatsapp_groups")
        .select("group_jid, session_id")
        .eq("workspace_id", wsId)
        .eq("id", data.groupId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      groupJid = (group as { group_jid?: string; session_id?: string } | null)?.group_jid;
      sessionId =
        (group as { group_jid?: string; session_id?: string } | null)?.session_id ?? null;
    }
    if (!groupJid) {
      return {
        messages: [],
        hasMore: false,
        earliestAt: null,
        nextCursor: null,
      };
    }

    let q = sb
      .from("whatsapp_web_messages")
      .select(SLIM_GROUP_HISTORY_SELECT)
      .eq("workspace_id", wsId)
      .eq("remote_jid", groupJid);
    if (sessionId) q = q.eq("session_id", sessionId);

    const isDelta = Boolean(data.after);
    if (data.cursor) {
      q = q.or(
        `received_at.lt.${data.cursor.occurredAt},and(received_at.eq.${data.cursor.occurredAt},id.lt.${data.cursor.id})`,
      );
    } else if (data.before) {
      q = q.lt("received_at", data.before);
    } else if (data.after) {
      q = q.gt("received_at", data.after);
    }

    const { data: rows, error } = await q
      .order("received_at", { ascending: isDelta })
      .order("id", { ascending: isDelta })
      .limit(data.limit + 1);
    if (error) throw new Error(error.message);

    const rawRows = (rows ?? []) as SlimGroupHistoryRow[];
    const hasMore = rawRows.length > data.limit;
    const limitedRows = rawRows.slice(0, data.limit);
    const pageRows = isDelta ? limitedRows : limitedRows.slice().reverse();

    const messages = pageRows.map(slimProjectedGroupMessage);

    const oldest = pageRows[0];
    return {
      messages,
      hasMore,
      earliestAt: oldest?.received_at ?? null,
      nextCursor:
        !isDelta && hasMore && oldest
          ? { occurredAt: oldest.received_at, id: oldest.id }
          : null,
    };
  });

// ---------- Sincronizar grupos de uma sessão ----------
const SyncSchema = z.object({
  workspaceId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export const syncSessionGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SyncSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;
    const creds = await loadCreds(sb, data.sessionId);

    // Número conectado nessa sessão: é ele que define se "sou admin" no grupo.
    const sessionClient = context.supabase as unknown as AnySb;
    const { data: sessRow } = await sessionClient
      .from("whatsapp_web_sessions")
      .select("phone_number")
      .eq("id", data.sessionId)
      .maybeSingle();
    let ownDigits = String((sessRow as { phone_number?: string } | null)?.phone_number ?? "").replace(/\D/g, "");
    if (!ownDigits) {
      // Fallback: pergunta ao Evolution qual número está logado na instância.
      const inst = await evoFetch(
        `/instance/fetchInstances?instanceName=${encodeURIComponent(creds.instance_name)}`,
        { apiKey: creds.api_key },
      );
      const arr = Array.isArray(inst.json) ? (inst.json as Array<Record<string, unknown>>) : [];
      const first = arr[0] ?? {};
      const owner =
        (first["ownerJid"] as string | undefined) ??
        ((first["instance"] as Record<string, unknown> | undefined)?.["owner"] as string | undefined) ??
        "";
      ownDigits = String(owner).split(":")[0].replace(/\D/g, "");
    }
    // WhatsApp às vezes devolve o JID com sufixo de device (`:12`) ou LID.
    const ownTail = ownDigits.slice(-10);

    // Evolution: fetchAllGroups (com participantes)
    const fetched = await evoFetch(
      `/group/fetchAllGroups/${encodeURIComponent(creds.instance_name)}?getParticipants=true`,
      { apiKey: creds.api_key },
    );

    if (!fetched.ok) {
      throw new Error(
        `Evolution não retornou grupos (status ${fetched.status}). Verifique se a sessão está conectada.`,
      );
    }

    const raw = fetched.json;
    const groups: EvoGroup[] = Array.isArray(raw)
      ? (raw as EvoGroup[])
      : Array.isArray((raw as { groups?: EvoGroup[] })?.groups)
        ? (raw as { groups: EvoGroup[] }).groups
        : [];

    const upsertClient = context.supabase as unknown as {
      from: (t: string) => {
        upsert: (
          v: Record<string, unknown>[],
          o: { onConflict: string },
        ) => Promise<{ error: { message?: string } | null }>;
      };
    };

    const valid = groups.filter((g) => typeof g.id === "string" && g.id.endsWith("@g.us"));

    // Grupos sem participantes ou sem foto: busca os detalhes um a um
    // (limitado, para não estourar o tempo da requisição).
    const incompletos = valid
      .filter((g) => !(g.participants ?? []).length || !g.pictureUrl)
      .slice(0, 60);
    const detalhes = new Map<string, EvoGroup>();
    for (let i = 0; i < incompletos.length; i += 6) {
      const lote = incompletos.slice(i, i + 6);
      await Promise.all(
        lote.map(async (g) => {
          try {
            const info = await evoFetch(
              `/group/findGroupInfos/${encodeURIComponent(creds.instance_name)}?groupJid=${encodeURIComponent(g.id!)}`,
              { apiKey: creds.api_key },
            );
            const j = info.json as EvoGroup | { group?: EvoGroup } | null;
            const parsed = (j && "group" in (j as object) ? (j as { group?: EvoGroup }).group : (j as EvoGroup)) ?? null;
            if (parsed) detalhes.set(g.id!, parsed);
            if (!parsed?.pictureUrl) {
              const pic = await evoFetch(
                `/chat/fetchProfilePictureUrl/${encodeURIComponent(creds.instance_name)}`,
                { apiKey: creds.api_key, method: "POST", body: { number: g.id! } },
              );
              const url = (pic.json as { profilePictureUrl?: string } | null)?.profilePictureUrl;
              if (url) detalhes.set(g.id!, { ...(parsed ?? {}), pictureUrl: url });
            }
          } catch {
            /* grupo sem detalhes: mantém o que veio da listagem */
          }
        }),
      );
    }

    const now = new Date().toISOString();
    const rows = valid.map((base) => {
      const extra = detalhes.get(base.id!) ?? {};
      const g: EvoGroup = {
        ...base,
        participants: (base.participants ?? []).length ? base.participants : extra.participants,
        pictureUrl: base.pictureUrl ?? extra.pictureUrl ?? null,
        size: base.size ?? extra.size,
        desc: base.desc ?? extra.desc,
      };
      const participants = g.participants ?? [];
      const souAdmin = participants.some((p) => {
        const d = String(p.id ?? "").split(":")[0].replace(/\D/g, "");
        const ehAdmin = p.admin === "admin" || p.admin === "superadmin";
        return ehAdmin && ownTail.length >= 8 && d.endsWith(ownTail);
      });
      return {
        workspace_id: data.workspaceId,
        session_id: data.sessionId,
        group_jid: g.id!,
        name: g.subject ?? "Grupo sem nome",
        subject: g.subject ?? null,
        description: g.desc ?? null,
        picture_url: g.pictureUrl ?? null,
        participants_count: participants.length || g.size || 0,
        is_admin: souAdmin,
        is_announce: g.announce ?? false,
        invite_code: g.inviteCode ?? null,
        last_synced_at: now,
      };
    });

    if (rows.length > 0) {
      const up = await upsertClient
        .from("whatsapp_groups")
        .upsert(rows, { onConflict: "session_id,group_jid" });
      if (up.error) throw new Error(up.error.message ?? "erro ao salvar grupos");
    }

    return { synced: rows.length };
  });



// ---------- Criar grupo ----------
const CreateSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
  name: z.string().min(1).max(120),
  participants: z.array(z.string().min(8)).min(1),
  description: z.string().optional(),
  pictureUrl: z.string().optional(), // data URL (data:image/...;base64,...) ou URL pública
});

export const createWhatsAppGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;
    const dataClient = context.supabase as unknown as AnySb;
    const creds = await loadCreds(sb, data.sessionId);
    const workspaceId = data.workspaceId ?? (await loadActiveWorkspace(dataClient, context.userId));

    const normalized = data.participants.map((p) => {
      const digits = p.replace(/\D/g, "");
      return digits.includes("@") ? p : `${digits}@s.whatsapp.net`;
    });

    const res = await evoFetch(`/group/create/${encodeURIComponent(creds.instance_name)}`, {
      method: "POST",
      apiKey: creds.api_key,
      body: {
        subject: data.name,
        description: data.description ?? "",
        participants: normalized,
      },
    });

    if (!res.ok) {
      const j = res.json as { message?: string; response?: { message?: string } };
      throw new Error(j?.response?.message ?? j?.message ?? "Falha ao criar grupo");
    }

    const created = res.json as { id?: string; groupJid?: string; jid?: string };
    const groupJid = created?.id ?? created?.groupJid ?? created?.jid ?? null;

    if (groupJid && data.pictureUrl) {
      try {
        await evoFetch(
          `/group/updateGroupPicture/${encodeURIComponent(creds.instance_name)}?groupJid=${encodeURIComponent(groupJid)}`,
          { method: "POST", apiKey: creds.api_key, body: { image: data.pictureUrl } },
        );
      } catch {
        /* ignora falha de foto */
      }
    }

    if (groupJid) {
      const now = new Date().toISOString();
      await dataClient.from("whatsapp_groups").upsert(
        {
          workspace_id: workspaceId,
          session_id: data.sessionId,
          group_jid: groupJid,
          name: data.name,
          subject: data.name,
          description: data.description ?? null,
          picture_url: data.pictureUrl ?? null,
          participants_count: normalized.length + 1,
          is_admin: true,
          is_announce: false,
          last_synced_at: now,
          updated_at: now,
        },
        { onConflict: "session_id,group_jid" },
      );
    }

    return { ok: true, groupJid };
  });

// ---------- Entrar em grupo por link ----------
const JoinSchema = z.object({
  sessionId: z.string().uuid(),
  inviteCode: z.string().min(4),
});

export const joinGroupByLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JoinSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;
    const creds = await loadCreds(sb, data.sessionId);

    // Aceita URL completa ou só o código
    const code = data.inviteCode.replace(/^https?:\/\/chat\.whatsapp\.com\//, "").trim();

    const res = await evoFetch(
      `/group/inviteCode/${encodeURIComponent(creds.instance_name)}?inviteCode=${encodeURIComponent(code)}`,
      { method: "GET", apiKey: creds.api_key },
    );

    if (!res.ok) throw new Error("Não foi possível entrar no grupo. Verifique o link.");
    return { ok: true };
  });

// ---------- Sair de grupo ----------
const LeaveSchema = z.object({ sessionId: z.string().uuid(), groupJid: z.string() });
export const leaveGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LeaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;
    const creds = await loadCreds(sb, data.sessionId);
    const res = await evoFetch(
      `/group/leaveGroup/${encodeURIComponent(creds.instance_name)}?groupJid=${encodeURIComponent(data.groupJid)}`,
      { method: "DELETE", apiKey: creds.api_key },
    );
    if (!res.ok) throw new Error("Não foi possível sair do grupo.");
    return { ok: true };
  });

// ---------- Renomear ----------
const RenameSchema = z.object({
  sessionId: z.string().uuid(),
  groupJid: z.string(),
  name: z.string().min(1).max(120),
});
export const renameGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RenameSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;
    const creds = await loadCreds(sb, data.sessionId);
    const res = await evoFetch(
      `/group/updateGroupSubject/${encodeURIComponent(creds.instance_name)}?groupJid=${encodeURIComponent(data.groupJid)}`,
      { method: "POST", apiKey: creds.api_key, body: { subject: data.name } },
    );
    if (!res.ok) throw new Error("Não foi possível renomear o grupo.");
    return { ok: true };
  });

// ---------- Definir descrição ----------
const DescSchema = z.object({
  sessionId: z.string().uuid(),
  groupJid: z.string(),
  description: z.string().max(500),
});
export const setGroupDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DescSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbRpc;
    const creds = await loadCreds(sb, data.sessionId);
    const res = await evoFetch(
      `/group/updateGroupDescription/${encodeURIComponent(creds.instance_name)}?groupJid=${encodeURIComponent(data.groupJid)}`,
      { method: "POST", apiKey: creds.api_key, body: { description: data.description } },
    );
    if (!res.ok) throw new Error("Não foi possível atualizar a descrição.");
    return { ok: true };
  });

// ---------- Definir automação ativa (bot XOR IA) ----------
const AutomationSchema = z.object({
  workspaceId: z.string().uuid(),
  groupId: z.string().uuid(),
  botId: z.string().uuid().nullable().optional(),
  agentId: z.string().uuid().nullable().optional(),
});

export const setGroupAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AutomationSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.botId && data.agentId) {
      throw new Error("Cada grupo pode ter apenas um Salesbot OU um Agente IA, não os dois.");
    }
    const supabase = context.supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (
            c: string,
            v: unknown,
          ) => {
            eq: (c: string, v: unknown) => Promise<{ error: { message?: string } | null }>;
          };
        };
      };
    };
    const res = await supabase
      .from("whatsapp_groups")
      .update({
        active_bot_id: data.botId ?? null,
        active_ai_agent_id: data.agentId ?? null,
      })
      .eq("id", data.groupId)
      .eq("workspace_id", data.workspaceId);
    if (res.error) throw new Error(res.error.message ?? "erro ao salvar");
    return { ok: true };
  });

// ---------- Salvar regras de moderação ----------
const RulesSchema = z.object({
  workspaceId: z.string().uuid(),
  groupId: z.string().uuid(),
  rules: z.record(z.string(), z.unknown()),
});
export const saveGroupRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RulesSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (
            c: string,
            v: unknown,
          ) => {
            eq: (c: string, v: unknown) => Promise<{ error: { message?: string } | null }>;
          };
        };
      };
    };
    const res = await supabase
      .from("whatsapp_groups")
      .update({ rules: data.rules })
      .eq("id", data.groupId)
      .eq("workspace_id", data.workspaceId);
    if (res.error) throw new Error(res.error.message ?? "erro ao salvar regras");
    return { ok: true };
  });

// ---------- Salesbots de grupo ----------
const ListBotsSchema = z.object({ workspaceId: z.string().uuid() });
export const listGroupSalesbots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListBotsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            c: string,
            v: unknown,
          ) => {
            eq: (
              c: string,
              v: unknown,
            ) => {
              order: (
                c: string,
                o: { ascending: boolean },
              ) => Promise<{ data: unknown; error: { message?: string } | null }>;
            };
          };
        };
      };
    };
    const res = await supabase
      .from("salesbots")
      .select("id, nome:name, ativo:is_active, scope, updated_at")
      .eq("workspace_id", data.workspaceId)
      .eq("scope", "grupo")
      .order("updated_at", { ascending: false });
    if (res.error) throw new Error(res.error.message ?? "erro ao listar bots");
    return (res.data as unknown as SalesbotRow[]) ?? [];
  });

// ---------- Agentes IA de grupo ----------
const ListAgentsSchema = z.object({ workspaceId: z.string().uuid() });
export const listGroupAiAgents=createServerFn({method:'POST'}).middleware([attachSupabaseAuth,requireSupabaseAuth]).inputValidator((v:unknown)=>ListAgentsSchema.parse(v)).handler(async({data,context})=>{
 const db=context.supabase as any;await authorizeGroupActor(db,data.workspaceId,context.userId);
 const rows:AgentRow[]=[];
 for(let start=0;start<10000;start+=500){const r=await db.from('group_ai_agents').select('id,workspace_id,name,persona,system_prompt,model,temperature,max_tokens,respond_only_when_mentioned,cooldown_seconds,enabled,triggers,metadata,updated_at').eq('workspace_id',data.workspaceId).order('id').range(start,start+499);if(r.error||!Array.isArray(r.data))throw new Error('Não foi possível carregar os agentes de grupo.');rows.push(...r.data);if(r.data.length<500)return rows.sort((a:any,b:any)=>b.updated_at.localeCompare(a.updated_at));}
 throw new Error('Limite de leitura dos agentes atingido; a lista não foi truncada silenciosamente.');
});

const TriggerSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "mention",
    "keyword",
    "all_messages",
    "member_join",
    "member_leave",
    "webhook",
    "schedule",
    "lead_stage_change",
  ]),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.any()).default({}),
});

const AgentRuleSchema = z.object({
  id: z.string().optional(),
  logic: z.enum(["e", "ou"]).default("e"),
  conditions: z
    .array(
      z.object({
        field: z.string(),
        op: z.string(),
        value: z.string(),
      }),
    )
    .default([]),
  action: z.object({ type: z.string(), target: z.string().default("") }),
});

export const upsertGroupAiAgent=createServerFn({method:'POST'}).middleware([attachSupabaseAuth,requireSupabaseAuth]).inputValidator((v:unknown)=>GroupPromptInputSchema.parse(v)).handler(({data,context})=>saveGroupPromptAgent(context.supabase as any,data,context.userId));

const DeleteAgentSchema = z.object({ workspaceId: z.string().uuid(), agentId: z.string().uuid() });
export const deleteGroupAiAgent=createServerFn({method:'POST'}).middleware([attachSupabaseAuth,requireSupabaseAuth]).inputValidator((v:unknown)=>DeleteAgentSchema.parse(v)).handler(async({data,context})=>{
 const db=context.supabase as any;await authorizeGroupActor(db,data.workspaceId,context.userId,true);
 const linked=await db.from('whatsapp_groups').select('id').eq('workspace_id',data.workspaceId).eq('active_ai_agent_id',data.agentId).limit(1);
 if(linked.error)throw new Error('Não foi possível conferir os vínculos do agente.');if(linked.data?.length)throw new Error('Desvincule o agente dos grupos antes de excluí-lo.');
 const r=await db.from('group_ai_agents').delete().eq('workspace_id',data.workspaceId).eq('id',data.agentId).select('id').maybeSingle();if(r.error||!r.data)throw new Error('Exclusão não confirmada nesta empresa.');return {ok:true};
});
export const duplicateGroupAiAgent=createServerFn({method:'POST'}).middleware([attachSupabaseAuth,requireSupabaseAuth]).inputValidator((v:unknown)=>DeleteAgentSchema.extend({name:z.string().trim().min(1).max(120).optional()}).parse(v)).handler(async({data,context})=>{
 const db=context.supabase as any;await authorizeGroupActor(db,data.workspaceId,context.userId,true);
 const r=await db.from('group_ai_agents').select('*').eq('workspace_id',data.workspaceId).eq('id',data.agentId).maybeSingle();if(r.error||!r.data)throw new Error('Agente não encontrado nesta empresa.');const row=r.data;
 const payload={workspace_id:data.workspaceId,name:(data.name||row.name+' (cópia)').slice(0,120),persona:row.persona,system_prompt:row.system_prompt,model:row.model,temperature:row.temperature,max_tokens:row.max_tokens,respond_only_when_mentioned:row.respond_only_when_mentioned,cooldown_seconds:row.cooldown_seconds,triggers:row.triggers,metadata:mergePromptMetadata(row.metadata,{settings:{mode:'prompt'}}),enabled:false};
 const saved=await db.from('group_ai_agents').insert({...payload,created_by:context.userId,creation_request_id:crypto.randomUUID(),creation_payload:payload}).select('id').single();if(saved.error||!saved.data)throw new Error('A duplicação não foi confirmada. Confira a lista antes de repetir.');return {id:saved.data.id};
});

/* ============ Relatório de agentes IA de grupo ============ */

export type GroupAgentRun = {
  id: string;
  workspace_id: string;
  agent_id: string;
  group_id: string | null;
  messages_handled: number;
  mentions_answered: number;
  warnings_issued: number;
  members_removed: number;
  objective_reached: boolean;
  objective_reached_at: string | null;
  interactions_count: number;
  started_at: string;
  last_message_at: string;
  metadata: JsonValue | null;
};

export type GroupAgentStat = {
  agent_id: string;
  agent_name: string;
  total_runs: number;
  groups_covered: number;
  messages_handled: number;
  mentions_answered: number;
  warnings_issued: number;
  members_removed: number;
  objective_reached: number;
  objective_rate: number;
  avg_messages_per_run: number;
};

const GroupStatsSchema = z.object({ workspaceId: z.string().uuid() });

export const getGroupAgentStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GroupStatsSchema.parse(d))
  .handler(async ({ data, context }): Promise<GroupAgentStat[]> => {
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            c: string,
            v: unknown,
          ) => Promise<{ data: unknown; error: { message?: string } | null }>;
        };
      };
    };
    const agentsRes = await sb
      .from("group_ai_agents")
      .select("id,name")
      .eq("workspace_id", data.workspaceId);
    if (agentsRes.error)
      throw new Error(agentsRes.error.message ?? "erro ao listar agentes de grupo");
    const agents = (agentsRes.data as Array<{ id: string; name: string }>) ?? [];

    const runsRes = await sb
      .from("group_agent_runs")
      .select(
        "agent_id,group_id,messages_handled,mentions_answered,warnings_issued,members_removed,objective_reached",
      )
      .eq("workspace_id", data.workspaceId);
    if (runsRes.error) throw new Error(runsRes.error.message ?? "erro ao listar execuções");
    const runs =
      (runsRes.data as Array<{
        agent_id: string;
        group_id: string | null;
        messages_handled: number;
        mentions_answered: number;
        warnings_issued: number;
        members_removed: number;
        objective_reached: boolean;
      }>) ?? [];

    return agents.map((a) => {
      const mine = runs.filter((r) => r.agent_id === a.id);
      const groups = new Set(mine.map((r) => r.group_id).filter(Boolean));
      const messages = mine.reduce((s, r) => s + (r.messages_handled || 0), 0);
      const mentions = mine.reduce((s, r) => s + (r.mentions_answered || 0), 0);
      const warnings = mine.reduce((s, r) => s + (r.warnings_issued || 0), 0);
      const removed = mine.reduce((s, r) => s + (r.members_removed || 0), 0);
      const reached = mine.filter((r) => r.objective_reached).length;
      return {
        agent_id: a.id,
        agent_name: a.name,
        total_runs: mine.length,
        groups_covered: groups.size,
        messages_handled: messages,
        mentions_answered: mentions,
        warnings_issued: warnings,
        members_removed: removed,
        objective_reached: reached,
        objective_rate: mine.length ? reached / mine.length : 0,
        avg_messages_per_run: mine.length ? messages / mine.length : 0,
      };
    });
  });

const GroupRunsSchema = z.object({
  workspaceId: z.string().uuid(),
  agentId: z.string().uuid(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const listGroupAgentRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GroupRunsSchema.parse(d))
  .handler(async ({ data, context }): Promise<GroupAgentRun[]> => {
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            c: string,
            v: unknown,
          ) => {
            eq: (
              c: string,
              v: unknown,
            ) => {
              order: (
                c: string,
                o: { ascending: boolean },
              ) => {
                limit: (
                  n: number,
                ) => Promise<{ data: unknown; error: { message?: string } | null }>;
              };
            };
          };
        };
      };
    };
    const res = await sb
      .from("group_agent_runs")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("agent_id", data.agentId)
      .order("started_at", { ascending: false })
      .limit(data.limit);
    if (res.error) throw new Error(res.error.message ?? "erro ao listar execuções");
    return (res.data as GroupAgentRun[]) ?? [];
  });

// ============================================================
// Envio de mensagens para grupos (inbox)
// ============================================================

function pickEvoMessageId(value: unknown): string | null {
  const stack: unknown[] = [value];
  const seen = new Set<unknown>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const obj = current as Record<string, unknown>;
    const direct = obj.id ?? obj.messageId ?? obj.message_id;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    for (const nested of Object.values(obj)) {
      if (nested && typeof nested === "object") stack.push(nested);
    }
  }
  return null;
}

async function resolveGroupTarget(
  sb: AnySb,
  wsId: string,
  groupId: string,
  groupJidHint?: string,
): Promise<{ groupJid: string; sessionId: string }> {
  const parsed = parseSlimInboxGroupConversationKey(groupId, groupJidHint);
  if (parsed) {
    const {data: session, error: sessionError} = await sb.from("whatsapp_web_sessions")
      .select("id, status")
      .eq("workspace_id", wsId)
      .eq("id", parsed.sessionId)
      .maybeSingle();
    if (sessionError || !session || session.status !== "conectado") {
      throw new Error("A sessão de origem do grupo não está conectada. Nenhuma mensagem foi enviada.");
    }
    return { groupJid: parsed.groupJid, sessionId: parsed.sessionId };
  }
  let groupJid = groupJidHint ?? (groupId.includes("@g.us") ? groupId : undefined);
  let sessionId: string | null = null;
  const { data: group } = await sb
    .from("whatsapp_groups")
    .select("group_jid, session_id")
    .eq("workspace_id", wsId)
    .eq(groupId.includes("@g.us") ? "group_jid" : "id", groupId)
    .maybeSingle();
  const g = group as { group_jid?: string; session_id?: string } | null;
  if (g?.group_jid) groupJid = g.group_jid;
  if (g?.session_id) sessionId = g.session_id;
  if (!sessionId) {
    // Fallback: pega sessão ativa mais recente do workspace
    const { data: sess } = await sb
      .from("whatsapp_web_sessions")
      .select("id")
      .eq("workspace_id", wsId)
      .eq("provider", "evolution")
      .eq("status", "conectado")
      .order("last_connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    sessionId = (sess as { id?: string } | null)?.id ?? null;
  }
  if (!groupJid) throw new Error("Grupo não encontrado.");
  if (!sessionId) throw new Error("Conecte o WhatsApp Web em Integrações para enviar no grupo.");
  return { groupJid, sessionId };
}

export const sendGroupMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        groupId: z.string().min(1),
        groupJid: z.string().optional(),
        text: z.string().min(1).max(4096),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { groupJid, sessionId } = await resolveGroupTarget(sb, wsId, data.groupId, data.groupJid);
    const creds = await loadCreds(sb as unknown as SbRpc, sessionId);
    const base = baseUrl();
    // One bounded provider request, even when Evolution never answers.
    // Do not resend an uncertain operation or claim success without its ID.
    const { boundedMediaRequest, MediaSendUncertain } = await import("./slim-media-transport.server");
    const url = `${base}/message/sendText/${encodeURIComponent(creds.instance_name)}`;
    const sent = await boundedMediaRequest({
      url,
      apiKey: creds.api_key,
      payload: { number: groupJid, text: data.text },
    }, { timeoutMs: 25_000, maxBodyBytes: 64 * 1024 });
    if (!sent.response.ok) throw new MediaSendUncertain();
    const messageId = pickEvoMessageId(sent.body);
    if (!messageId) throw new MediaSendUncertain();
    const persisted = await sb.from("whatsapp_web_messages").upsert(
      {
        workspace_id: wsId,
        session_id: sessionId,
        remote_jid: groupJid,
        to_jid: groupJid,
        message_id: messageId,
        from_me: true,
        message_type: "text",
        body: data.text,
        delivery_status: "sent",
        raw: {},
        received_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,message_id" },
    );
    if (persisted.error) return { ok: true, messageId, historyPending: true };
    return { ok: true, messageId, historyPending: false };
  });

export const sendGroupMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        groupId: z.string().min(1),
        groupJid: z.string().optional(),
        kind: z.enum(["image", "video", "audio", "document"]),
        mimeType: z.string().min(1).max(200),
        fileName: z.string().min(1).max(300),
        base64: z.string().min(1),
        caption: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { groupJid, sessionId } = await resolveGroupTarget(sb, wsId, data.groupId, data.groupJid);

    // Upload no bucket inbox-outgoing
    const { decodeSlimMedia, boundedMediaRequest, mediaPreparation, MediaSendUncertain } =
      await import("./slim-media-transport.server");
    const bytes = decodeSlimMedia(data.base64);
    const safeName = data.fileName.replace(/[^\w.\-]+/g, "_");
    const safeGroupPathId = data.groupId.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 160);
    const storagePath = wsId + "/groups/" + safeGroupPathId + "/" + Date.now() + "-" + safeName;
    const anySb = sb as unknown as { storage: { from: (b: string) => any } };
    const up = await mediaPreparation(anySb.storage.from("inbox-outgoing").upload(storagePath, bytes, {
      contentType: data.mimeType, upsert: false,
    }), "Upload do anexo");
    if (up.error) throw new Error(`upload_failed: ${up.error.message}`);
    const signed = await mediaPreparation(anySb.storage.from("inbox-outgoing")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7), "Link do anexo");
    const mediaUrl: string = signed.data?.signedUrl;
    if (!mediaUrl) throw new Error("Falha ao gerar URL da mídia.");

    const creds = await loadCreds(sb as unknown as SbRpc, sessionId);
    const base = baseUrl();
    const isAudio = data.kind === "audio";
    const url = isAudio
      ? `${base}/message/sendWhatsAppAudio/${encodeURIComponent(creds.instance_name)}`
      : `${base}/message/sendMedia/${encodeURIComponent(creds.instance_name)}`;
    const body = isAudio
      ? { number: groupJid, audio: mediaUrl, encoding: true }
      : {
          number: groupJid,
          mediatype: data.kind,
          mimetype: data.mimeType,
          media: mediaUrl,
          fileName: data.fileName,
          caption: data.caption ?? "",
        };
    // A single bounded provider attempt. Never restart/retry an uncertain send.
    const sent = await boundedMediaRequest({url,apiKey:creds.api_key,payload:body});
    if (!sent.response.ok) throw new MediaSendUncertain();
    const messageId = pickEvoMessageId(sent.body);
    if (!messageId) throw new MediaSendUncertain();
    if (messageId) {
      const persisted = await sb.from("whatsapp_web_messages").upsert(
        {
          workspace_id: wsId,
          session_id: sessionId,
          remote_jid: groupJid,
          to_jid: groupJid,
          message_id: messageId,
          from_me: true,
          message_type: data.kind,
          body: data.caption ?? null,
          media_url: mediaUrl,
          delivery_status: "sent",
          raw: {},
          received_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,message_id" },
      );
      if (persisted.error) return { ok: true, messageId, mediaUrl, historyPending: true };
    }
    return { ok: true, messageId, mediaUrl, historyPending: false };
  });

// SLIM_GROUP_PROMPT_V1
