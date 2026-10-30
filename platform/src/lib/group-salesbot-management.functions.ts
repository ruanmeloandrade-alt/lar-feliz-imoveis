import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = { from: (table: string) => any };

const ACTIVE_RUN_STATUSES = ["running", "waiting_message", "waiting_timer"] as const;

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

export type GroupSalesbotManageRow = {
  id: string;
  localId: string;
  nome: string;
  ativo: boolean;
};

export type GroupSalesbotSessionRow = {
  runId: string;
  botId: string;
  botName: string;
  groupJid: string;
  groupName: string;
  status: "running" | "waiting_message" | "waiting_timer";
  waitingUntil: string | null;
  createdAt: string;
};

export const listGroupSalesbotsForManagement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await loadActiveWorkspace(sb, context.userId);
    const { data, error } = await sb
      .from("salesbots")
      .select("id, local_id, name, is_active, updated_at")
      .eq("workspace_id", workspaceId)
      .eq("scope", "grupo")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      bots: ((data ?? []) as Array<{ id: string; local_id: string | null; name: string; is_active: boolean }>).map((bot) => ({
        id: bot.id,
        localId: bot.local_id ?? bot.id,
        nome: bot.name,
        ativo: bot.is_active === true,
      })),
    };
  });

export const renameGroupSalesbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await loadActiveWorkspace(sb, context.userId);
    const { data: updated, error } = await sb
      .from("salesbots")
      .update({ name: data.name, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("workspace_id", workspaceId)
      .eq("scope", "grupo")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("SalesBot de grupo não encontrado neste workspace.");
    return { ok: true };
  });

export const setGroupSalesbotActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await loadActiveWorkspace(sb, context.userId);
    const { data: updated, error } = await sb
      .from("salesbots")
      .update({ is_active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("workspace_id", workspaceId)
      .eq("scope", "grupo")
      .select("id, is_active")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("SalesBot de grupo não encontrado neste workspace.");
    return { ok: true, active: (updated as { is_active?: boolean }).is_active === true };
  });

export const exportGroupSalesbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await loadActiveWorkspace(sb, context.userId);

    const { data: bot, error: botError } = await sb
      .from("salesbots")
      .select("id, local_id, name, trigger, is_active, gatilhos, scope, settings, updated_at")
      .eq("id", data.id)
      .eq("workspace_id", workspaceId)
      .eq("scope", "grupo")
      .maybeSingle();
    if (botError) throw new Error(botError.message);
    if (!bot) throw new Error("SalesBot de grupo não encontrado neste workspace.");

    const { data: blocks, error: blocksError } = await sb
      .from("salesbot_blocks")
      .select("id, local_id, type, config, position_x, position_y, next_block_id")
      .eq("salesbot_id", data.id)
      .eq("workspace_id", workspaceId);
    if (blocksError) throw new Error(blocksError.message);

    return {
      format: "mkton-salesbot",
      version: 1,
      scope: "grupo",
      exportedAt: new Date().toISOString(),
      bot,
      blocks: blocks ?? [],
    };
  });

function rewriteIdsDeep(value: unknown, idMap: Map<string, string>): unknown {
  if (typeof value === "string") return idMap.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => rewriteIdsDeep(item, idMap));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, rewriteIdsDeep(nested, idMap)]),
    );
  }
  return value;
}

const ImportPayloadSchema = z.object({
  format: z.literal("mkton-salesbot"),
  version: z.number().int().min(1),
  scope: z.literal("grupo"),
  bot: z.object({
    name: z.string().trim().min(1).max(80),
    trigger: z.string().nullable().optional(),
    gatilhos: z.unknown().optional(),
    settings: z.unknown().optional(),
  }).passthrough(),
  blocks: z.array(z.object({
    id: z.string().min(1),
    local_id: z.string().nullable().optional(),
    type: z.string().min(1),
    config: z.unknown().optional(),
    position_x: z.number().optional().default(0),
    position_y: z.number().optional().default(0),
    next_block_id: z.string().nullable().optional(),
  }).passthrough()).default([]),
});

export const importGroupSalesbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ payload: z.unknown() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await loadActiveWorkspace(sb, context.userId);
    const parsed = ImportPayloadSchema.safeParse(data.payload);
    if (!parsed.success) {
      throw new Error("Arquivo inválido. Importe um JSON baixado de um SalesBot de grupo do Vanessa Simoni.");
    }

    const source = parsed.data;
    const importedName = `${source.bot.name} (importado)`.slice(0, 80);
    const localId = crypto.randomUUID();
    const { data: created, error: createError } = await sb
      .from("salesbots")
      .insert({
        workspace_id: workspaceId,
        local_id: localId,
        name: importedName,
        trigger: source.bot.trigger ?? null,
        gatilhos: Array.isArray(source.bot.gatilhos) ? source.bot.gatilhos : [],
        scope: "grupo",
        settings: source.bot.settings && typeof source.bot.settings === "object" ? source.bot.settings : {},
        is_active: false,
      })
      .select("id, name")
      .single();
    if (createError || !created) {
      throw new Error(createError?.message ?? "Não foi possível criar o bot importado.");
    }

    const botId = String(created.id);
    try {
      if (source.blocks.length > 0) {
        const idMap = new Map<string, string>();
        const localIdMap = new Map<string, string>();
        for (const block of source.blocks) {
          const newDbId = crypto.randomUUID();
          idMap.set(block.id, newDbId);
          if (block.local_id) idMap.set(block.local_id, newDbId);
          localIdMap.set(block.id, crypto.randomUUID());
        }

        const rows = source.blocks.map((block) => ({
          id: idMap.get(block.id)!,
          salesbot_id: botId,
          workspace_id: workspaceId,
          local_id: localIdMap.get(block.id)!,
          type: block.type,
          config: rewriteIdsDeep(block.config ?? {}, idMap),
          position_x: Math.round(block.position_x ?? 0),
          position_y: Math.round(block.position_y ?? 0),
          next_block_id: block.next_block_id ? (idMap.get(block.next_block_id) ?? null) : null,
        }));

        const CHUNK = 100;
        for (let index = 0; index < rows.length; index += CHUNK) {
          const { error } = await sb.from("salesbot_blocks").insert(rows.slice(index, index + CHUNK));
          if (error) throw new Error(error.message);
        }
      }
    } catch (error) {
      await sb.from("salesbot_blocks").delete().eq("salesbot_id", botId).eq("workspace_id", workspaceId);
      await sb.from("salesbots").delete().eq("id", botId).eq("workspace_id", workspaceId);
      throw error;
    }

    return { ok: true, id: botId, localId, name: importedName };
  });

export const listGroupSalesbotSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ botId: z.string().uuid().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await loadActiveWorkspace(sb, context.userId);

    let botQuery = sb
      .from("salesbots")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .eq("scope", "grupo");
    if (data.botId) botQuery = botQuery.eq("id", data.botId);
    const { data: botRows, error: botError } = await botQuery;
    if (botError) throw new Error(botError.message);
    const bots = (botRows ?? []) as Array<{ id: string; name: string }>;
    if (bots.length === 0) return { sessions: [] as GroupSalesbotSessionRow[] };

    const { data: runRows, error: runError } = await sb
      .from("salesbot_runs")
      .select("id, salesbot_id, lead_id, status, waiting_until, created_at, variables")
      .eq("workspace_id", workspaceId)
      .in("salesbot_id", bots.map((bot) => bot.id))
      .in("status", [...ACTIVE_RUN_STATUSES])
      .order("created_at", { ascending: false })
      .limit(500);
    if (runError) throw new Error(runError.message);

    const runs = (runRows ?? []) as Array<{
      id: string;
      salesbot_id: string;
      lead_id: string;
      status: string;
      waiting_until: string | null;
      created_at: string;
      variables: Record<string, unknown> | null;
    }>;
    if (runs.length === 0) return { sessions: [] as GroupSalesbotSessionRow[] };

    const leadIds = Array.from(new Set(runs.map((run) => run.lead_id).filter(Boolean)));
    const { data: leadRows, error: leadError } = await sb
      .from("leads")
      .select("id, phone, name, custom_data")
      .eq("workspace_id", workspaceId)
      .in("id", leadIds);
    if (leadError) throw new Error(leadError.message);
    const leads = new Map(
      ((leadRows ?? []) as Array<{ id: string; phone: string | null; name: string; custom_data: Record<string, unknown> | null }>)
        .map((lead) => [lead.id, lead] as const),
    );

    const groupJids = Array.from(new Set(runs.map((run) => {
      const lead = leads.get(run.lead_id);
      const fromVariables = typeof run.variables?.group_jid === "string" ? run.variables.group_jid : null;
      return fromVariables ?? lead?.phone ?? null;
    }).filter((value): value is string => !!value && value.endsWith("@g.us"))));

    const groupsByJid = new Map<string, { name: string | null; subject: string | null }>();
    if (groupJids.length > 0) {
      const { data: groupRows } = await sb
        .from("whatsapp_groups")
        .select("group_jid, name, subject")
        .eq("workspace_id", workspaceId)
        .in("group_jid", groupJids);
      for (const group of (groupRows ?? []) as Array<{ group_jid: string; name: string | null; subject: string | null }>) {
        groupsByJid.set(group.group_jid, group);
      }
    }

    const botNames = new Map(bots.map((bot) => [bot.id, bot.name] as const));
    const sessions: GroupSalesbotSessionRow[] = [];
    for (const run of runs) {
      const lead = leads.get(run.lead_id);
      const fromVariables = typeof run.variables?.group_jid === "string" ? run.variables.group_jid : null;
      const groupJid = fromVariables ?? lead?.phone ?? "";
      const isGroup = groupJid.endsWith("@g.us") || run.variables?.group_schedule === true;
      if (!isGroup || !groupJid) continue;
      const group = groupsByJid.get(groupJid);
      sessions.push({
        runId: run.id,
        botId: run.salesbot_id,
        botName: botNames.get(run.salesbot_id) ?? "SalesBot",
        groupJid,
        groupName: group?.name ?? group?.subject ?? lead?.name?.replace(/^\[Grupo\]\s*/, "") ?? groupJid,
        status: run.status as GroupSalesbotSessionRow["status"],
        waitingUntil: run.waiting_until,
        createdAt: run.created_at,
      });
    }
    return { sessions };
  });

export const stopGroupSalesbotRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await loadActiveWorkspace(sb, context.userId);
    const { data: run, error: runError } = await sb
      .from("salesbot_runs")
      .select("id, salesbot_id, lead_id, status, variables")
      .eq("id", data.runId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (runError) throw new Error(runError.message);
    if (!run) throw new Error("Sessão não encontrada.");
    if (!ACTIVE_RUN_STATUSES.includes(run.status as (typeof ACTIVE_RUN_STATUSES)[number])) {
      return { ok: true, alreadyStopped: true };
    }

    const { data: bot } = await sb
      .from("salesbots")
      .select("id")
      .eq("id", run.salesbot_id)
      .eq("workspace_id", workspaceId)
      .eq("scope", "grupo")
      .maybeSingle();
    if (!bot) throw new Error("Esta execução não pertence a um SalesBot de grupo.");

    const { data: lead } = await sb
      .from("leads")
      .select("phone")
      .eq("id", run.lead_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const variables = run.variables && typeof run.variables === "object"
      ? run.variables as Record<string, unknown>
      : {};
    const groupJid = typeof variables.group_jid === "string" ? variables.group_jid : lead?.phone;
    if (!(typeof groupJid === "string" && groupJid.endsWith("@g.us")) && variables.group_schedule !== true) {
      throw new Error("Esta execução não é uma sessão de grupo.");
    }

    const now = new Date().toISOString();
    const { data: stopped, error: stopError } = await sb
      .from("salesbot_runs")
      .update({
        status: "finished",
        finished_at: now,
        waiting_until: null,
        current_block_id: null,
        last_error: null,
        variables: {
          ...variables,
          group_stopped_manually: true,
          group_stopped_at: now,
        },
      })
      .eq("id", data.runId)
      .eq("workspace_id", workspaceId)
      .in("status", [...ACTIVE_RUN_STATUSES])
      .select("id")
      .maybeSingle();
    if (stopError) throw new Error(stopError.message);
    return { ok: true, alreadyStopped: !stopped };
  });
