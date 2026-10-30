import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeSalesbotPauseConfig } from "@/lib/salesbot-pause-compat";
import { collectCompleteSalesbotPages, normalizeSalesbotBaseIds } from "@/lib/salesbot-safe-pagination";

type AnySb = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any; storage: { from: (b: string) => any } };

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

type Json = null | string | number | boolean | Json[] | { [k: string]: Json };

export interface SalesbotRow {
  id: string;
  name: string;
  trigger: string | null;
  is_active: boolean;
  gatilhos: Json;
  updated_at: string;
  revision?: number;
}

export interface SalesbotBlockRow {
  id: string;
  type: string;
  config: Json;
  position_x: number;
  position_y: number;
  next_block_id: string | null;
}


type SalesbotDbRow = {
  id: string;
  local_id: string | null;
  workspace_id?: string;
  name: string;
  trigger?: string | null;
  is_active: boolean;
  gatilhos: unknown;
  scope: string | null;
  settings?: Record<string, unknown> | null;
  updated_at: string;
  revision: number;
};

type SalesbotBlockDbRow = {
  id: string;
  local_id: string | null;
  salesbot_id: string;
  workspace_id?: string;
  type: string;
  config: Record<string, unknown> | null;
  position_x: number;
  position_y: number;
  next_block_id: string | null;
};

const SALESBOT_BLOCK_PAGE_SIZE = 250;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveSalesbotByLocalId(
  sb: AnySb,
  workspaceId: string,
  localId: string,
): Promise<SalesbotDbRow | null> {
  const columns = "id, local_id, workspace_id, name, trigger, is_active, gatilhos, scope, settings, updated_at, revision";
  const { data: byLocal, error: localError } = await sb
    .from("salesbots")
    .select(columns)
    .eq("workspace_id", workspaceId)
    .eq("local_id", localId)
    .maybeSingle();
  if (localError) throw new Error(localError.message);
  if (byLocal) return byLocal as SalesbotDbRow;

  if (!UUID_RE.test(localId)) return null;
  const { data: byId, error: idError } = await sb
    .from("salesbots")
    .select(columns)
    .eq("workspace_id", workspaceId)
    .eq("id", localId)
    .maybeSingle();
  if (idError) throw new Error(idError.message);
  return (byId ?? null) as SalesbotDbRow | null;
}

async function loadCompleteSalesbotBlockRows(
  sb: AnySb,
  salesbotId: string,
): Promise<{ rows: SalesbotBlockDbRow[]; count: number }> {
  const countResult = await sb
    .from("salesbot_blocks")
    .select("id", { count: "exact", head: true })
    .eq("salesbot_id", salesbotId);
  if (countResult.error) throw new Error(countResult.error.message);
  const expectedCount = Number(countResult.count ?? 0);

  const rows = await collectCompleteSalesbotPages<SalesbotBlockDbRow>(
    expectedCount,
    async (from, to) => {
      const page = await sb
        .from("salesbot_blocks")
        .select("id, local_id, salesbot_id, workspace_id, type, config, position_x, position_y, next_block_id")
        .eq("salesbot_id", salesbotId)
        .order("id", { ascending: true })
        .range(from, to);
      if (page.error) throw new Error(page.error.message);
      return { rows: (page.data ?? []) as SalesbotBlockDbRow[] };
    },
    (row) => row.id,
    SALESBOT_BLOCK_PAGE_SIZE,
  );

  return { rows, count: expectedCount };
}

function salesbotRowsToLocal(bot: SalesbotDbRow, rows: SalesbotBlockDbRow[]) {
  const toLocal = new Map<string, string>();
  for (const row of rows) toLocal.set(row.id, row.local_id ?? row.id);
  const mapNext = (value: unknown) =>
    typeof value === "string" ? (toLocal.get(value) ?? value) : undefined;

  let startBlockId: string | undefined;
  const blocks = rows.map((row) => {
    const cfg = normalizeSalesbotPauseConfig({ ...(row.config ?? {}) } as Record<string, unknown>);
    const localId = row.local_id ?? row.id;
    if (cfg.isStartBlock === true) startBlockId = localId;
    delete cfg.isStartBlock;
    const remapList = (value: unknown) =>
      Array.isArray(value)
        ? value.map((item) =>
            item && typeof item === "object"
              ? { ...(item as Record<string, unknown>), nextBlockId: mapNext((item as Record<string, unknown>).nextBlockId) }
              : item,
          )
        : value;
    if (cfg.roleta) cfg.roleta = remapList(cfg.roleta);
    if (cfg.pausas) cfg.pausas = remapList(cfg.pausas);
    if (cfg.condicoes) cfg.condicoes = remapList(cfg.condicoes);
    if (cfg.botoes) cfg.botoes = remapList(cfg.botoes);
    if (typeof cfg.falseNextBlockId === "string") cfg.falseNextBlockId = mapNext(cfg.falseNextBlockId);
    return {
      ...cfg,
      id: localId,
      kind: row.type,
      x: row.position_x,
      y: row.position_y,
      nextBlockId: row.next_block_id ? mapNext(row.next_block_id) : undefined,
    };
  });

  const rawStartPosition = bot.settings?.startPosition;
  const startRecord = rawStartPosition && typeof rawStartPosition === "object"
    ? rawStartPosition as Record<string, unknown>
    : null;
  const startPosition = startRecord
    && typeof startRecord.x === "number"
    && typeof startRecord.y === "number"
    ? { x: startRecord.x, y: startRecord.y }
    : undefined;

  return {
    id: bot.local_id ?? bot.id,
    nome: bot.name,
    escopo: bot.scope === "grupo" ? "grupo" : "individual",
    maxInteracoes: typeof bot.settings?.maxInteracoes === "number" ? bot.settings.maxInteracoes : undefined,
    startBlockId,
    startPosition,
    gatilhos: Array.isArray(bot.gatilhos) ? bot.gatilhos : [],
    isActive: bot.is_active,
    blocks,
    updatedAt: bot.updated_at,
  };
}

function newSalesbotRequestId() {
  return globalThis.crypto.randomUUID();
}

export const listSalesbots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data, error } = await sb
      .from("salesbots")
      .select("id, name, trigger, is_active, gatilhos, updated_at")
      .eq("workspace_id", wsId)
      .neq("scope", "grupo")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { bots: (data ?? []) as SalesbotRow[] };
  });

export const startSalesbotForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    salesbotId: z.string().uuid(),
    leadId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const [{ data: bot }, { data: lead }] = await Promise.all([
      sb.from("salesbots").select("id").eq("id", data.salesbotId).eq("workspace_id", wsId).maybeSingle(),
      sb.from("leads").select("id").eq("id", data.leadId).eq("workspace_id", wsId).maybeSingle(),
    ]);
    if (!bot) throw new Error("SalesBot não encontrado neste workspace.");
    if (!lead) throw new Error("Lead não encontrado neste workspace.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { startSalesbotRun } = await import("@/lib/salesbot-runtime.server");
    const runId = await startSalesbotRun(supabaseAdmin as never, {
      workspaceId: wsId,
      salesbotId: data.salesbotId,
      leadId: data.leadId,
    });
    if (!runId) throw new Error("Não foi possível iniciar o SalesBot.");
    return { ok: true, runId };
  });

export const getSalesbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: bot, error } = await sb
      .from("salesbots")
      .select("id, local_id, workspace_id, name, trigger, is_active, gatilhos, scope, settings, updated_at, revision")
      .eq("id", data.id)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!bot) throw new Error("Bot não encontrado");

    const first = bot as SalesbotDbRow;
    const loaded = await loadCompleteSalesbotBlockRows(sb, first.id);
    const { data: verify, error: verifyError } = await sb
      .from("salesbots")
      .select("revision")
      .eq("id", first.id)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (verifyError) throw new Error(verifyError.message);
    if (!verify || Number((verify as { revision: number }).revision) !== Number(first.revision)) {
      throw new Error("salesbot_changed_during_load");
    }

    return {
      bot: first as unknown as SalesbotRow,
      blocks: loaded.rows as unknown as SalesbotBlockRow[],
      revision: Number(first.revision),
      blockCount: loaded.count,
      complete: true,
    };
  });

export const createSalesbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string().min(1).max(80),
    trigger: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: row, error } = await sb
      .from("salesbots")
      .insert({ workspace_id: wsId, name: data.name, trigger: data.trigger ?? null, is_active: false })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const saveSalesbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(80).optional(),
    trigger: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
    gatilhos: z.array(z.unknown()).optional(),
    blocks: z.array(z.object({
      id: z.string().uuid(),
      type: z.string(),
      config: z.unknown(),
      position_x: z.number(),
      position_y: z.number(),
      next_block_id: z.string().uuid().nullable().optional(),
    })).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.blocks !== undefined) {
      throw new Error("salesbot_unsafe_legacy_block_save_disabled");
    }
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.trigger !== undefined) patch.trigger = data.trigger;
    if (data.is_active !== undefined) patch.is_active = data.is_active;
    if (data.gatilhos !== undefined) patch.gatilhos = data.gatilhos;
    if (Object.keys(patch).length > 0) {
      const { error } = await sb.from("salesbots").update(patch).eq("id", data.id).eq("workspace_id", wsId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteSalesbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb.from("salesbots").delete().eq("id", data.id).eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Espelha um bot mantido no localStorage para o banco (bot + blocos + gatilhos).
 *  Casa registros pelo `local_id`. IDs de bloco também são mapeados via local_id
 *  → uuid, e as ligações `nextBlockId` (também locais) são traduzidas. */
export const syncSalesbotFromLocal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    bot: z.object({
      id: z.string(),
      nome: z.string().min(1).max(120),
      escopo: z.enum(["individual", "grupo"]).optional(),
      maxInteracoes: z.number().int().min(0).max(50).optional(),
      startPosition: z.object({ x: z.number(), y: z.number() }).optional(),
      startBlockId: z.string().optional().nullable(),
      gatilhos: z.array(z.unknown()).default([]),
      blocks: z.array(z.object({
        id: z.string(),
        kind: z.string(),
        x: z.number().optional(),
        y: z.number().optional(),
        nextBlockId: z.string().optional().nullable(),
      }).passthrough()).default([]),
    }),
    expectedRevision: z.number().int().positive().nullable().optional(),
    baseBlockLocalIds: z.array(z.string().min(1)).optional(),
    requestId: z.string().uuid().optional(),
    source: z.string().min(1).max(80).optional(),
    isActive: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const bot = data.bot;
    const existing = await resolveSalesbotByLocalId(sb, wsId, bot.id);

    let existingRows: SalesbotBlockDbRow[] = [];
    if (existing) {
      if (data.expectedRevision == null || !Array.isArray(data.baseBlockLocalIds)) {
        throw new Error("salesbot_safe_save_requires_complete_load");
      }
      const loaded = await loadCompleteSalesbotBlockRows(sb, existing.id);
      existingRows = loaded.rows;

      const serverBase = normalizeSalesbotBaseIds(
        existingRows.map((row) => row.local_id ?? row.id),
      );
      const suppliedBase = normalizeSalesbotBaseIds(data.baseBlockLocalIds);
      if (
        suppliedBase.length !== data.baseBlockLocalIds.length
        || suppliedBase.length !== serverBase.length
        || suppliedBase.some((id, i) => id !== serverBase[i])
      ) {
        throw new Error("salesbot_incomplete_base");
      }
    } else if (data.expectedRevision != null || (data.baseBlockLocalIds?.length ?? 0) > 0) {
      throw new Error("salesbot_missing_for_expected_revision");
    }

    const existingByLocal = new Map<string, string>();
    for (const row of existingRows) existingByLocal.set(row.local_id ?? row.id, row.id);

    const idMap = new Map<string, string>();
    for (const block of bot.blocks) {
      idMap.set(
        block.id,
        existingByLocal.get(block.id) ?? globalThis.crypto.randomUUID(),
      );
    }

    const mapLocalNext = (value: unknown) =>
      typeof value === "string" ? (idMap.get(value) ?? null) : null;
    const mapBranchList = (value: unknown) =>
      Array.isArray(value)
        ? value.map((item) => {
            if (!item || typeof item !== "object") return item;
            const branch = item as Record<string, unknown>;
            const mappedNext = mapLocalNext(branch.nextBlockId);
            return { ...branch, nextBlockId: mappedNext ?? undefined };
          })
        : value;

    const rows = bot.blocks.map((block) => {
      const cfg = normalizeSalesbotPauseConfig({ ...block } as Record<string, unknown>);
      delete cfg.id;
      delete cfg.kind;
      delete cfg.x;
      delete cfg.y;
      delete cfg.nextBlockId;
      cfg.isStartBlock = bot.startBlockId === block.id;
      cfg.roleta = mapBranchList(cfg.roleta);
      cfg.pausas = mapBranchList(cfg.pausas);
      cfg.condicoes = mapBranchList(cfg.condicoes);
      cfg.botoes = mapBranchList(cfg.botoes);
      if (typeof cfg.falseNextBlockId === "string") {
        cfg.falseNextBlockId = mapLocalNext(cfg.falseNextBlockId) ?? undefined;
      }
      return {
        id: idMap.get(block.id)!,
        local_id: block.id,
        type: block.kind,
        config: cfg,
        position_x: Math.round(block.x ?? 0),
        position_y: Math.round(block.y ?? 0),
        next_block_id: block.nextBlockId ? (idMap.get(block.nextBlockId) ?? null) : null,
      };
    });

    const botPayload: Record<string, unknown> = {
      name: bot.nome,
      scope: bot.escopo ?? "individual",
      gatilhos: bot.gatilhos ?? [],
    };
    if (bot.maxInteracoes !== undefined) botPayload.maxInteracoes = bot.maxInteracoes;
    if (bot.startPosition !== undefined) botPayload.startPosition = bot.startPosition;

    const rid = data.requestId ?? newSalesbotRequestId();
    const rpc = await sb.rpc("salesbot_save_graph_v2", {
      p_bot_local_id: bot.id,
      p_expected_revision: existing ? data.expectedRevision : null,
      p_base_block_local_ids: existing ? (data.baseBlockLocalIds ?? []) : [],
      p_bot: botPayload,
      p_blocks: rows,
      p_request_id: rid,
      p_source: data.source ?? "builder",
    });
    if (rpc.error) throw new Error(rpc.error.message);

    const result = (rpc.data ?? {}) as {
      id?: string;
      revision?: number;
      baseBlockLocalIds?: string[];
      deletedBlockCount?: number;
      requestId?: string;
    };
    if (!Number.isFinite(Number(result.revision))) {
      throw new Error("salesbot_atomic_save_missing_revision");
    }

    return {
      ok: true,
      id: result.id,
      revision: Number(result.revision),
      baseBlockLocalIds: Array.isArray(result.baseBlockLocalIds)
        ? normalizeSalesbotBaseIds(result.baseBlockLocalIds)
        : normalizeSalesbotBaseIds(bot.blocks.map((block) => block.id)),
      deletedBlockCount: Number(result.deletedBlockCount ?? 0),
      requestId: result.requestId ?? rid,
    };
  });

export const uploadSalesbotMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    fileName: z.string().min(1).max(200),
    mimeType: z.string().min(1).max(120),
    kind: z.enum(["image", "video", "audio", "document"]),
    base64: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 20 * 1024 * 1024) {
      throw new Error("Arquivo maior que 20 MB.");
    }
    const safeName = data.fileName.replace(/[^\w.\-]+/g, "_");
    const path = `${wsId}/${Date.now()}-${safeName}`;
    const up = await sb.storage.from("salesbot-media").upload(path, bytes, {
      contentType: data.mimeType,
      upsert: false,
    });
    if (up.error) throw new Error(`upload_failed: ${up.error.message}`);
    return { path, kind: data.kind, mime: data.mimeType, fileName: safeName };
  });

/** Devolve URL assinada (1h) para preview no builder. */
export const getSalesbotMediaSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    // Enforce prefixo do próprio workspace
    if (!data.path.startsWith(`${wsId}/`)) throw new Error("forbidden");
    const signed = await sb.storage.from("salesbot-media").createSignedUrl(data.path, 60 * 60);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data?.signedUrl as string };
  });



/** Duplica um bot (dados + blocos + ligações) dentro do mesmo workspace. */
export const duplicateSalesbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    const { data: bot, error: botErr } = await sb
      .from("salesbots")
      .select("id, name, trigger, gatilhos, scope, settings")
      .eq("id", data.id)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (botErr) throw new Error(botErr.message);
    if (!bot) throw new Error("Bot não encontrado.");

    const source = bot as {
      name: string;
      trigger: string | null;
      gatilhos: Json;
      scope: string | null;
      settings: Json;
    };
    const { data: created, error: insErr } = await sb
      .from("salesbots")
      .insert({
        workspace_id: wsId,
        name: (data.name?.trim() || `${source.name} (cópia)`).slice(0, 80),
        trigger: source.trigger,
        gatilhos: source.gatilhos ?? [],
        scope: source.scope,
        settings: source.settings ?? {},
        // A cópia sempre nasce desligada para não disparar sem revisão.
        is_active: false,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    const newId = (created as { id: string }).id;

    const { data: blocks } = await sb
      .from("salesbot_blocks")
      .select("id, type, config, position_x, position_y, next_block_id")
      .eq("salesbot_id", data.id);

    const rows = (blocks ?? []) as SalesbotBlockRow[];
    if (rows.length > 0) {
      // Cada bloco ganha um id novo; as ligações são reapontadas para os novos ids.
      const idMap = new Map<string, string>();
      for (const b of rows) idMap.set(b.id, crypto.randomUUID());
      const inserts = rows.map((b) => ({
        id: idMap.get(b.id)!,
        salesbot_id: newId,
        workspace_id: wsId,
        type: b.type,
        config: b.config ?? {},
        position_x: b.position_x,
        position_y: b.position_y,
        next_block_id: b.next_block_id ? (idMap.get(b.next_block_id) ?? null) : null,
      }));
      const { error } = await sb.from("salesbot_blocks").insert(inserts);
      if (error) throw new Error(error.message);
    }

    return { id: newId };
  });

/** Lista todos os bots do workspace no formato usado pelo builder (local).
 *  O banco é a fonte da verdade: o localStorage passa a ser só um cache. */
export const listSalesbotsFull = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: bots, error } = await sb
      .from("salesbots")
      .select("id, local_id, name, scope, gatilhos, is_active, updated_at, settings, revision")
      .eq("workspace_id", wsId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    const out = ((bots ?? []) as SalesbotDbRow[]).map((bot) => ({
      id: bot.local_id ?? bot.id,
      nome: bot.name,
      escopo: bot.scope === "grupo" ? "grupo" : "individual",
      maxInteracoes: typeof bot.settings?.maxInteracoes === "number" ? bot.settings.maxInteracoes : undefined,
      gatilhos: Array.isArray(bot.gatilhos) ? bot.gatilhos : [],
      isActive: bot.is_active,
      blocks: [],
      updatedAt: bot.updated_at,
      revision: Number(bot.revision),
    }));
    return { bots: JSON.parse(JSON.stringify(out)) as Json[] };
  });

export const getSalesbotGraph = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ localId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const first = await resolveSalesbotByLocalId(sb, wsId, data.localId);
    if (!first) throw new Error("salesbot_not_found");

    const loaded = await loadCompleteSalesbotBlockRows(sb, first.id);

    const { data: verify, error: verifyError } = await sb
      .from("salesbots")
      .select("revision")
      .eq("workspace_id", wsId)
      .eq("id", first.id)
      .maybeSingle();
    if (verifyError) throw new Error(verifyError.message);
    if (!verify || Number((verify as { revision: number }).revision) !== Number(first.revision)) {
      throw new Error("salesbot_changed_during_load");
    }

    const graph = salesbotRowsToLocal(first, loaded.rows);
    const baseBlockLocalIds = normalizeSalesbotBaseIds(
      loaded.rows.map((row) => row.local_id ?? row.id),
    );
    if (baseBlockLocalIds.length !== loaded.count) {
      throw new Error("salesbot_duplicate_base_identity");
    }

    return {
      bot: JSON.parse(JSON.stringify(graph)) as Json,
      revision: Number(first.revision),
      blockCount: loaded.count,
      baseBlockLocalIds,
      complete: true,
    };
  });

export const setSalesbotActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    localId: z.string().min(1),
    expectedRevision: z.number().int().positive(),
    isActive: z.boolean(),
    requestId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await loadActiveWorkspace(sb, context.userId);
    const rid = data.requestId ?? newSalesbotRequestId();
    const rpc = await sb.rpc("salesbot_set_active_v2", {
      p_bot_local_id: data.localId,
      p_expected_revision: data.expectedRevision,
      p_is_active: data.isActive,
      p_request_id: rid,
      p_source: "builder-activation",
    });
    if (rpc.error) throw new Error(rpc.error.message);
    const result = (rpc.data ?? {}) as { revision?: number; isActive?: boolean; requestId?: string };
    if (!Number.isFinite(Number(result.revision))) throw new Error("salesbot_activation_missing_revision");
    return {
      ok: true,
      revision: Number(result.revision),
      isActive: result.isActive === true,
      requestId: result.requestId ?? rid,
    };
  });

export const listSalesbotRevisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ localId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const bot = await resolveSalesbotByLocalId(sb, wsId, data.localId);
    if (!bot) throw new Error("salesbot_not_found");
    const { data: rows, error } = await sb
      .from("salesbot_revisions")
      .select("revision, source_event, actor_user_id, request_id, created_at")
      .eq("workspace_id", wsId)
      .eq("salesbot_id", bot.id)
      .order("revision", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { revisions: rows ?? [], currentRevision: Number(bot.revision) };
  });

export const restoreSalesbotRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    localId: z.string().min(1),
    expectedRevision: z.number().int().positive(),
    targetRevision: z.number().int().positive(),
    requestId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await loadActiveWorkspace(sb, context.userId);
    const rid = data.requestId ?? newSalesbotRequestId();
    const rpc = await sb.rpc("salesbot_restore_revision_v2", {
      p_bot_local_id: data.localId,
      p_expected_revision: data.expectedRevision,
      p_target_revision: data.targetRevision,
      p_request_id: rid,
      p_source: "builder-restore",
    });
    if (rpc.error) throw new Error(rpc.error.message);
    const result = (rpc.data ?? {}) as { revision?: number; requestId?: string };
    if (!Number.isFinite(Number(result.revision))) throw new Error("salesbot_restore_missing_revision");
    return { ok: true, revision: Number(result.revision), requestId: result.requestId ?? rid };
  });

export const deleteSalesbotByLocalId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    localId: z.string().min(1),
    expectedRevision: z.number().int().positive(),
    requestId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const bot = await resolveSalesbotByLocalId(sb, wsId, data.localId);
    if (!bot) return { ok: true, alreadyDeleted: true };

    const rid = data.requestId ?? newSalesbotRequestId();
    const rpc = await sb.rpc("salesbot_delete_v2", {
      p_bot_local_id: data.localId,
      p_expected_revision: data.expectedRevision,
      p_request_id: rid,
      p_source: "builder-delete",
    });
    if (rpc.error) throw new Error(rpc.error.message);
    const result = (rpc.data ?? {}) as Record<string, unknown>;
    return { ok: true, ...result };
  });

export const listSalesbotPickerOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data, error } = await sb
      .from("salesbots")
      .select("id, local_id, name, scope")
      .eq("workspace_id", wsId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ id: string; local_id: string | null; name: string; scope: string | null }>;
    return {
      bots: rows.map((b) => ({
        id: b.id,
        localId: b.local_id ?? b.id,
        nome: b.name,
        escopo: b.scope === "grupo" ? ("grupo" as const) : ("individual" as const),
      })),
    };
  });

/**
 * Lista os arquivos já salvos na biblioteca de mídia do workspace
 * (bucket salesbot-media), para reaproveitar em blocos e ações de agente.
 */
export const listSalesbotMedia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data, error } = await sb.storage.from("salesbot-media").list(wsId, {
      limit: 200,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) throw new Error(error.message);
    const files = (data ?? [])
      .filter((f: { id?: string | null; name: string }) => !!f.name && f.name !== ".emptyFolderPlaceholder")
      .map((f: { name: string; metadata?: { mimetype?: string; size?: number } | null }) => ({
        path: `${wsId}/${f.name}`,
        // remove o prefixo de timestamp aplicado no upload
        fileName: f.name.replace(/^\d{10,}-/, ""),
        mime: f.metadata?.mimetype ?? "",
        size: f.metadata?.size ?? 0,
      }));
    return { files };
  });
