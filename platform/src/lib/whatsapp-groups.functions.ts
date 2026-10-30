import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export * from "./whatsapp-groups.functions.legacy";
export { syncSessionGroups } from "./whatsapp-group-sync-robust.functions";

// Central, rule editors and schedule selectors share the persisted Inbox catalogue.
export const listWorkspaceGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ workspaceId: z.string().uuid(), sessionId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { listSlimWorkspaceGroups } = await import("./slim-group-catalog.server");
    return listSlimWorkspaceGroups(context.supabase as any, data.workspaceId, data.sessionId, context.userId);
  });

export const saveGroupRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ workspaceId: z.string().uuid(), groupId: z.string().uuid(), rules: z.record(z.string(), z.unknown()) }).parse(input))
  .handler(async ({ data, context }) => {
    const { saveSlimGroupConfiguration } = await import("./slim-group-catalog.server");
    return saveSlimGroupConfiguration(context.supabase as any, data, context.userId);
  });

export const setGroupAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ workspaceId: z.string().uuid(), groupId: z.string().uuid(), botId: z.string().uuid().nullable().optional(), agentId: z.string().uuid().nullable().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { saveSlimGroupConfiguration } = await import("./slim-group-catalog.server");
    return saveSlimGroupConfiguration(context.supabase as any, data, context.userId);
  });

type AnySb = {
  from: (table: string) => any;
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type EvoCreds = {
  workspace_id: string;
  instance_name: string;
  api_key: string;
};

type EvolutionHttpResult = {
  response: Response;
  body: unknown;
};

function encKey(): string {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY missing");
  return key;
}

function baseUrl(): string {
  const base = process.env.EVOLUTION_BASE_URL;
  if (!base) throw new Error("EVOLUTION_BASE_URL missing");
  return base.replace(/\/+$/, "");
}

function globalKey(): string {
  const key = process.env.EVOLUTION_GLOBAL_API_KEY;
  if (!key) throw new Error("EVOLUTION_GLOBAL_API_KEY missing");
  return key;
}

async function loadCreds(sb: AnySb, sessionId: string): Promise<EvoCreds> {
  const { data, error } = await sb.rpc("get_evolution_credentials", {
    _session_id: sessionId,
    _key: encKey(),
  });
  if (error) throw new Error(error.message ?? "rpc error");
  if (!data) throw new Error("Sessão Evolution não encontrada.");
  return data as EvoCreds;
}

async function loadActiveWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data } = await sb
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  const workspaceId = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!workspaceId) throw new Error("Workspace ativo não encontrado.");
  return workspaceId;
}

function deepString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const stack: unknown[] = [value];
  const seen = new Set<unknown>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    for (const [key, nested] of Object.entries(current as Record<string, unknown>)) {
      if (typeof nested === "string" && nested.trim() && wanted.has(key.toLowerCase())) {
        return nested.trim();
      }
      if (nested && typeof nested === "object") stack.push(nested);
    }
  }
  return null;
}

export function normalizeWhatsAppGroupParticipant(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    throw new Error(`Número de participante inválido: ${value}`);
  }
  return digits;
}

const EXPLICITLY_DISCONNECTED_STATES = new Set([
  "close",
  "closed",
  "disconnect",
  "disconnected",
  "logout",
  "logged_out",
  "loggedout",
]);

export function isExplicitEvolutionDisconnectedState(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return EXPLICITLY_DISCONNECTED_STATES.has(value.trim().toLowerCase());
}

export function isEvolutionConnectionClosedMessage(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /\bconnection\b.*\bclos(?:e|ed)\b/i.test(value.trim());
}

export function extractEvolutionProviderMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object") return fallback;
  const record = value as {
    message?: string | string[];
    error?: string;
    details?: string;
    raw?: string;
    response?: { message?: string | string[] };
  };
  const candidate =
    record.response?.message ?? record.message ?? record.error ?? record.details ?? record.raw;
  if (Array.isArray(candidate)) {
    const joined = candidate.map(String).filter(Boolean).join(", ").trim();
    if (joined) return joined;
  }
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  return deepString(value, ["message", "error", "details", "raw"]) ?? fallback;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function restartEvolutionInstance(instanceName: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${baseUrl()}/instance/restart/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        // O runtime Evolution existente usa a chave global nos endpoints de restart.
        headers: { apikey: globalKey() },
      },
    );
    if (!response.ok) {
      console.warn("Evolution group recovery restart failed", response.status);
      return false;
    }
    // A própria integração já usa restart para tirar instâncias do estado close.
    // Dê um curto intervalo para o Baileys restaurar a conexão antes do retry.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return true;
  } catch (error) {
    console.warn("Evolution group recovery restart unavailable", error);
    return false;
  }
}

async function prepareEvolutionForGroupCreation(instanceName: string, apiKey: string): Promise<void> {
  try {
    const response = await fetch(
      `${baseUrl()}/instance/connectionState/${encodeURIComponent(instanceName)}`,
      { headers: { apikey: apiKey } },
    );
    const body = await readResponseBody(response);

    // connectionState é apenas um preflight. Falha HTTP, schema desconhecido ou
    // indisponibilidade transitória não devem impedir o endpoint real /group/create.
    if (!response.ok) {
      console.warn("Evolution group preflight unavailable", response.status);
      return;
    }

    const state = (deepString(body, ["state", "status", "connectionStatus"]) ?? "")
      .trim()
      .toLowerCase();
    if (isExplicitEvolutionDisconnectedState(state)) {
      // O fluxo oficial da própria integração já reinicia instâncias presas em close.
      // Para criação de grupo, fazemos a mesma recuperação antes de tentar /group/create.
      await restartEvolutionInstance(instanceName);
    }
  } catch (error) {
    console.warn("Evolution group preflight failed; continuing to group/create", error);
  }
}

async function createEvolutionGroupRequest(
  instanceName: string,
  apiKey: string,
  payload: { subject: string; description: string; participants: string[] },
): Promise<EvolutionHttpResult> {
  let response: Response;
  try {
    response = await fetch(
      `${baseUrl()}/group/create/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify(payload),
      },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Não foi possível acessar a Evolution para criar o grupo: ${detail}`);
  }
  return { response, body: await readResponseBody(response) };
}

const CreateSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
  name: z.string().min(1).max(120),
  participants: z.array(z.string().min(8)).min(1),
  description: z.string().optional(),
  pictureUrl: z.string().optional(),
});

export const createWhatsAppGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId=await loadActiveWorkspace(sb,context.userId);
    if(data.workspaceId&&data.workspaceId!==workspaceId)throw new Error('A empresa ativa mudou. Reabra o Inbox.');
    const {assertSlimOperator}=await import('@/lib/slim-workspace-operator.server');await assertSlimOperator(sb as any,workspaceId,context.userId);
    const session=await sb.from('whatsapp_web_sessions').select('id').eq('workspace_id',workspaceId).eq('id',data.sessionId).maybeSingle();
    if(session.error||!session.data)throw new Error('A sessão não pertence à empresa ativa.');
    const cache=await sb.from('whatsapp_groups').select('id').eq('workspace_id',workspaceId).limit(1);
    if(cache.error)throw new Error('O cadastro de grupos não está disponível. Nenhum grupo foi criado por esta tentativa.');
    const creds = await loadCreds(sb, data.sessionId);

    await prepareEvolutionForGroupCreation(creds.instance_name, creds.api_key);

    // O endpoint /group/create recebe telefones com DDI. Não anexar JID aqui:
    // a Evolution resolve o JID internamente durante a criação do grupo.
    const participants = Array.from(new Set(data.participants.map(normalizeWhatsAppGroupParticipant)));
    const payload = {
      subject: data.name,
      description: data.description ?? "",
      participants,
    };

    let creation = await createEvolutionGroupRequest(
      creds.instance_name,
      creds.api_key,
      payload,
    );

    if (!creation.response.ok) {
      const firstMessage = extractEvolutionProviderMessage(
        creation.body,
        `Falha ao criar grupo (Evolution ${creation.response.status}).`,
      );

      // "Connection Closed" era o erro real reportado antes de virar 500 genérico.
      // Uma tentativa controlada de restart + retry recupera instâncias Baileys presas
      // sem repetir requisições que tiveram resposta de sucesso ou falha de rede ambígua.
      if (isEvolutionConnectionClosedMessage(firstMessage)) {
        const restarted = await restartEvolutionInstance(creds.instance_name);
        if (restarted) {
          creation = await createEvolutionGroupRequest(
            creds.instance_name,
            creds.api_key,
            payload,
          );
        }
      }
    }

    if (!creation.response.ok) {
      throw new Error(
        extractEvolutionProviderMessage(
          creation.body,
          `Falha ao criar grupo (Evolution ${creation.response.status}).`,
        ),
      );
    }

    const groupJid = deepString(creation.body, ["groupJid", "jid", "id"]);
    if(!groupJid||!groupJid.endsWith("@g.us"))throw new Error("A resposta não confirmou o grupo. Confira o WhatsApp antes de repetir a criação.");

    if (groupJid && data.pictureUrl) {
      try {
        await fetch(
          `${baseUrl()}/group/updateGroupPicture/${encodeURIComponent(creds.instance_name)}?groupJid=${encodeURIComponent(groupJid)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: creds.api_key },
            body: JSON.stringify({ image: data.pictureUrl }),
          },
        );
      } catch {
        // Foto é opcional e não deve invalidar um grupo já criado.
      }
    }

    let cacheWarning: string | null = null;
    if (groupJid) {
      const now = new Date().toISOString();
      const { error } = await sb.from("whatsapp_groups").upsert(
        {
          workspace_id: workspaceId,
          session_id: data.sessionId,
          group_jid: groupJid,
          name: data.name,
          subject: data.name,
          description: data.description ?? null,
          picture_url: data.pictureUrl ?? null,
          participants_count: participants.length + 1,
          is_admin: true,
          is_announce: false,
          last_synced_at: now,
          updated_at: now,
        },
        { onConflict: "session_id,group_jid" },
      );
      if (error) {
        cacheWarning = error.message ?? "Grupo criado, mas não foi possível salvar o cache local.";
        console.error("WhatsApp group created but local cache upsert failed", cacheWarning);
      }
    }

    return { ok: true, groupJid, cacheWarning };
  });

// SLIM_INBOX_RESUMPTION_V1
