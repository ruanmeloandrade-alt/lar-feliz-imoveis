// SLIM_AUDIENCE_OPERATIONS_V1
// Públicos do CRM, segmentos de leads criados a partir de filtros.
// Exportáveis para Meta Ads (customer_list SHA-256) e usáveis em transmissões.

import { querySlimAudience } from "@/lib/slim-audience.core";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = {
  from: (t: string) => any;
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

async function loadWs(sb: AnySb,userId:string):Promise<string>{return requireActiveWorkspace(sb as never,userId);}

// --- Filter schema ---
export const CustomFieldRuleSchema = z.object({
  fieldId: z.string().uuid(),
  op: z.enum(["eq", "neq", "contains", "exists", "empty"]),
  value: z.string().max(500).optional(),
});
export type CustomFieldRule = z.infer<typeof CustomFieldRuleSchema>;

export const AudienceFiltersSchema = z.object({
  // CRM
  pipelineIds: z.array(z.string().uuid()).optional(),
  stageIds: z.array(z.string().uuid()).optional(),
  sourceIds: z.array(z.string().uuid()).optional(),
  channelProviders: z.array(z.string()).optional(),
  responsibleIds: z.array(z.string().uuid()).optional(),
  status: z.enum(["active", "won", "lost", "any"]).optional(),
  lostReasonContains: z.string().max(200).optional(),
  // Tags & custom
  tagsAny: z.array(z.string()).optional(),
  tagsAll: z.array(z.string()).optional(),
  tagsNone: z.array(z.string()).optional(),
  customFields: z.array(CustomFieldRuleSchema).optional(),
  // Empresa / produto
  companyIds: z.array(z.string().uuid()).optional(),
  hasCompany: z.boolean().optional(),
  hasProducts: z.boolean().optional(),
  // Valor & datas
  valueMin: z.number().nullable().optional(),
  valueMax: z.number().nullable().optional(),
  createdFrom: z.string().nullable().optional(),
  createdTo: z.string().nullable().optional(),
  updatedWithinDays: z.number().int().min(1).max(365).nullable().optional(),
  // Conversa
  hasEmail: z.boolean().optional(),
  hasPhone: z.boolean().optional(),
  lastMessageFrom: z.enum(["any", "lead", "us", "none"]).optional(),
  conversationStatus: z.enum(["any", "aberta", "lida", "fechada"]).optional(),
  noMessageForDays: z.number().int().min(1).max(365).nullable().optional(),
  // Tarefas
  taskState: z.enum(["any", "has_open", "has_overdue", "has_completed", "none"]).optional(),
  // Marketing / UTM
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
  // Busca livre
  search: z.string().optional(),
});
export type AudienceFilters = z.infer<typeof AudienceFiltersSchema>;

type LeadRow = {
  id: string; name: string; email: string | null; phone: string | null;
  value: number; stage_id: string | null; last_message_from: string | null;
  tags: unknown; created_at: string; updated_at: string; status: string | null;
  responsible_id: string | null; company_id: string | null;
  conversation_status: string | null; custom_data: Record<string, unknown> | null;
};

async function queryMatchingLeads(sb:AnySb,wsId:string,f:AudienceFilters,limit?:number):Promise<LeadRow[]>{return querySlimAudience(sb,wsId,f,limit) as Promise<LeadRow[]>;}

export const listCrmAudiences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadWs(sb, context.userId);
    const { data, error } = await sb.from("crm_lead_audiences")
      .select("*").eq("workspace_id", wsId).order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { audiences: (data ?? []) as Array<{
      id: string; name: string; description: string | null;
      filters: AudienceFilters; cached_count: number | null; cached_at: string | null;
      meta_audience_id: string | null; last_synced_at: string | null;
      created_at: string; updated_at: string;
    }> };
  });

// --- Preview count + sample ---
export const previewCrmAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ filters: AudienceFiltersSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadWs(sb, context.userId);
    const rows = await queryMatchingLeads(sb, wsId, data.filters);
    const withEmail = rows.filter((r) => !!r.email).length;
    const withPhone = rows.filter((r) => !!r.phone).length;
    return {
      count: rows.length,
      withEmail,
      withPhone,
      sample: rows.slice(0, 20).map((r) => ({
        id: r.id, name: r.name, email: r.email, phone: r.phone, value: Number(r.value ?? 0),
        updatedAt: r.updated_at,
      })),
    };
  });

// --- Create ---
export const createCrmAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string().min(2).max(120),
    description: z.string().max(500).optional().nullable(),
    filters: AudienceFiltersSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadWs(sb, context.userId);
    const rows = await queryMatchingLeads(sb, wsId, data.filters);
    const { data: row, error } = await sb.from("crm_lead_audiences").insert({
      workspace_id: wsId,
      name: data.name,
      description: data.description ?? null,
      filters: data.filters as never,
      cached_count: rows.length,
      cached_at: new Date().toISOString(),
      created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return { audience: row };
  });

// --- Update ---
export const updateCrmAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    name: z.string().min(2).max(120).optional(),
    description: z.string().max(500).optional().nullable(),
    filters: AudienceFiltersSchema.optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadWs(sb, context.userId);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.filters !== undefined) {
      patch.filters = data.filters;
      const rows = await queryMatchingLeads(sb, wsId, data.filters);
      patch.cached_count = rows.length;
      patch.cached_at = new Date().toISOString();
    }
    const { error } = await sb.from("crm_lead_audiences").update(patch)
      .eq("id", data.id).eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Delete ---
export const deleteCrmAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadWs(sb, context.userId);
    const { error } = await sb.from("crm_lead_audiences").delete()
      .eq("id", data.id).eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Refresh count ---
export const refreshCrmAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadWs(sb, context.userId);
    const { data: row, error: e0 } = await sb.from("crm_lead_audiences")
      .select("filters").eq("id", data.id).eq("workspace_id", wsId).maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!row) throw new Error("Público não encontrado.");
    const filters = AudienceFiltersSchema.parse((row as { filters: unknown }).filters);
    const rows = await queryMatchingLeads(sb, wsId, filters);
    const refreshResult=await sb.from("crm_lead_audiences").update({cached_count:rows.length,cached_at:new Date().toISOString()}).eq("id",data.id).eq("workspace_id",wsId);
    if(refreshResult.error)throw new Error("Não foi possível atualizar a contagem do público.");
    return { count: rows.length };
  });

// --- Get contacts for broadcast (respects RLS via user ctx) ---
export const getCrmAudienceContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadWs(sb, context.userId);
    const { data: row } = await sb.from("crm_lead_audiences")
      .select("filters,name").eq("id", data.id).eq("workspace_id", wsId).maybeSingle();
    if (!row) throw new Error("Público não encontrado.");
    const filters = AudienceFiltersSchema.parse((row as { filters: unknown }).filters);
    const rows = await queryMatchingLeads(sb, wsId, filters, 5000);
    return {
      name: (row as { name: string }).name,
      contacts: rows.map((r) => ({
        id: r.id, name: r.name, email: r.email, phone: r.phone,
      })),
    };
  });

// --- Export to Meta as customer_list (SHA-256 email + phone) ---
async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normPhone(p: string): string {
  return p.replace(/[^\d]/g, "");
}

export const exportCrmAudienceToMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    adAccountId: z.string().min(3),
    retentionDays: z.number().int().min(1).max(180).default(30),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadWs(sb, context.userId);
    const { data: aud } = await sb.from("crm_lead_audiences")
      .select("id,name,description,filters").eq("id", data.id).eq("workspace_id", wsId).maybeSingle();
    if (!aud) throw new Error("Público não encontrado.");

    const filters = AudienceFiltersSchema.parse((aud as { filters: unknown }).filters);
    const rows = await queryMatchingLeads(sb, wsId, filters, 5000);

    // Load token
    const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!encKey) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
    const { data: sec, error: secErr } = await sb.rpc("get_integration_secret", {
      _workspace_id: wsId, _provider: "meta", _key: encKey,
    });
    if (secErr) throw new Error(secErr.message);
    const token = (sec as { access_token?: string } | null)?.access_token;
    if (!token) throw new Error("Meta não conectada neste workspace.");

    const acct = data.adAccountId.startsWith("act_") ? data.adAccountId : `act_${data.adAccountId}`;
    const nameRow = aud as { name: string; description: string | null };
    const audName = `[CRM] ${nameRow.name}`;

    // Create custom audience (CUSTOM subtype)
    const createBody = new URLSearchParams({
      access_token: token,
      name: audName,
      subtype: "CUSTOM",
      description: nameRow.description ?? "",
      customer_file_source: "USER_PROVIDED_ONLY",
      retention_days: String(data.retentionDays),
    });
    const createRes = await fetch(`https://graph.facebook.com/v23.0/${acct}/customaudiences`, {
      method: "POST", body: createBody,
    });
    const createText = await createRes.text();
    if (!createRes.ok) throw new Error(`Meta create ${createRes.status}: ${createText.slice(0, 300)}`);
    const { id: audienceId } = JSON.parse(createText) as { id: string };

    // Persist in meta_custom_audiences to keep consistent with existing panel
    const { data: metaRow } = await sb.from("meta_custom_audiences").insert({
      workspace_id: wsId,
      ad_account_id: acct,
      audience_id: audienceId,
      name: audName,
      description: nameRow.description ?? null,
      audience_type: "customer_list",
      subtype: "CUSTOM",
      retention_days: data.retentionDays,
      origin: "crm",
      created_by: context.userId,
    }).select("id").single();

    // Upload rows in chunks of 500
    const schema = ["EMAIL", "PHONE"] as const;
    const chunkSize = 500;
    let uploaded = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const users: string[][] = [];
      for (const r of chunk) {
        const em = r.email ? await sha256Hex(r.email) : "";
        const ph = r.phone ? await sha256Hex(normPhone(r.phone)) : "";
        if (em || ph) users.push([em, ph]);
      }
      if (!users.length) continue;
      const payload = { schema, data: users };
      const up = new URLSearchParams({ access_token: token, payload: JSON.stringify(payload) });
      const upRes = await fetch(`https://graph.facebook.com/v23.0/${audienceId}/users`, { method: "POST", body: up });
      if (!upRes.ok) {
        const t = await upRes.text();
        console.warn("[crm-audience] upload chunk falhou:", t.slice(0, 200));
      } else {
        uploaded += users.length;
      }
    }

    await sb.from("crm_lead_audiences").update({
      meta_audience_id: metaRow?.id ?? null,
      last_synced_at: new Date().toISOString(),
      cached_count: rows.length,
      cached_at: new Date().toISOString(),
    }).eq("id", data.id).eq("workspace_id", wsId);

    return { audienceId, uploaded, total: rows.length };
  });

// --- Criar Lookalike no Meta a partir de um público já sincronizado ---
export const createCrmAudienceLookalike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    adAccountId: z.string().min(3),
    country: z.string().length(2).default("BR"),
    ratio: z.number().min(0.01).max(0.20).default(0.01),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadWs(sb, context.userId);
    const { data: aud } = await sb.from("crm_lead_audiences")
      .select("name,meta_audience_id").eq("id", data.id).eq("workspace_id", wsId).maybeSingle();
    if (!aud) throw new Error("Público não encontrado.");
    const metaRowId = (aud as { meta_audience_id: string | null }).meta_audience_id;
    if (!metaRowId) throw new Error("Sincronize o público com o Meta primeiro.");
    const { data: metaRow } = await sb.from("meta_custom_audiences")
      .select("audience_id").eq("id", metaRowId).maybeSingle();
    const originAudienceId = (metaRow as { audience_id?: string } | null)?.audience_id;
    if (!originAudienceId) throw new Error("Custom Audience de origem não encontrada no Meta.");

    const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!encKey) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
    const { data: sec, error: secErr } = await sb.rpc("get_integration_secret", {
      _workspace_id: wsId, _provider: "meta", _key: encKey,
    });
    if (secErr) throw new Error(secErr.message);
    const token = (sec as { access_token?: string } | null)?.access_token;
    if (!token) throw new Error("Meta não conectada neste workspace.");

    const acct = data.adAccountId.startsWith("act_") ? data.adAccountId : `act_${data.adAccountId}`;
    const name = (aud as { name: string }).name;
    const lookalikeSpec = {
      origin_audience_id: originAudienceId,
      country: data.country,
      ratio: data.ratio,
    };
    const body = new URLSearchParams({
      access_token: token,
      name: `[CRM LAL ${(data.ratio * 100).toFixed(0)}%] ${name}`,
      subtype: "LOOKALIKE",
      lookalike_spec: JSON.stringify(lookalikeSpec),
    });
    const res = await fetch(`https://graph.facebook.com/v23.0/${acct}/customaudiences`, {
      method: "POST", body,
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`Meta LAL ${res.status}: ${txt.slice(0, 300)}`);
    const { id: lalId } = JSON.parse(txt) as { id: string };

    await sb.from("meta_custom_audiences").insert({
      workspace_id: wsId,
      ad_account_id: acct,
      audience_id: lalId,
      name: `[CRM LAL ${(data.ratio * 100).toFixed(0)}%] ${name}`,
      audience_type: "lookalike",
      subtype: "LOOKALIKE",
      origin: "crm",
      created_by: context.userId,
    });
    return { lookalikeId: lalId };
  });

// --- Iniciar transmissão (WhatsApp via Evolution) ---
export const broadcastCrmAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    requestId: z.string().uuid().optional(),
    sessionId: z.string().uuid(),
    message: z.string().min(1).max(4096),
    limit: z.number().int().min(1).max(500).default(200),
    delayMs: z.number().int().min(500).max(15000).default(1500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadWs(sb, context.userId);
    const { data: row } = await sb.from("crm_lead_audiences")
      .select("filters,name").eq("id", data.id).eq("workspace_id", wsId).maybeSingle();
    if (!row) throw new Error("Público não encontrado.");
    const filters = AudienceFiltersSchema.parse((row as { filters: unknown }).filters);
    const rows = await queryMatchingLeads(sb, wsId, filters, data.limit);
    const {enqueueSlimAudience}=await import("@/lib/slim-audience-queue.functions");
    return enqueueSlimAudience(sb,wsId,data,rows,"text");
  });

// --- Options for filter builder ---
export const listAudienceFilterOptions=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const sb=context.supabase as unknown as AnySb;const ws=await loadWs(sb,context.userId);
 const {slimAudienceOptions}=await import("@/lib/slim-audience-options.server");return slimAudienceOptions(sb,ws);
});

// --- Reativar público disparando um Salesbot para cada lead ---
export const reactivateCrmAudienceWithSalesbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    requestId: z.string().uuid().optional(),
    salesbotId: z.string().uuid(),
    delaySeconds: z.number().int().min(0).max(86400).default(0),
    limit: z.number().int().min(1).max(1000).default(300),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadWs(sb, context.userId);
    const { data: row } = await sb.from("crm_lead_audiences")
      .select("filters,name").eq("id", data.id).eq("workspace_id", wsId).maybeSingle();
    if (!row) throw new Error("Público não encontrado.");
    const filters = AudienceFiltersSchema.parse((row as { filters: unknown }).filters);
    const rows = await queryMatchingLeads(sb, wsId, filters, data.limit);
    const {enqueueSlimAudience}=await import("@/lib/slim-audience-queue.functions");
    return enqueueSlimAudience(sb,wsId,data,rows,"salesbot");
  });

// --- Reativar público via Agente IA (envia 1ª mensagem via Evolution) ---
export const reactivateCrmAudienceWithAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    requestId: z.string().uuid().optional(),
    agentId: z.string().uuid(),
    sessionId: z.string().uuid(),
    message: z.string().min(1).max(4096),
    limit: z.number().int().min(1).max(500).default(200),
    delayMs: z.number().int().min(500).max(15000).default(1500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadWs(sb, context.userId);
    const { data: row } = await sb.from("crm_lead_audiences")
      .select("filters,name").eq("id", data.id).eq("workspace_id", wsId).maybeSingle();
    if (!row) throw new Error("Público não encontrado.");
    const filters = AudienceFiltersSchema.parse((row as { filters: unknown }).filters);
    const rows = await queryMatchingLeads(sb, wsId, filters, data.limit);
    const {enqueueSlimAudience}=await import("@/lib/slim-audience-queue.functions");
    return enqueueSlimAudience(sb,wsId,data,rows,"agent");
  });

