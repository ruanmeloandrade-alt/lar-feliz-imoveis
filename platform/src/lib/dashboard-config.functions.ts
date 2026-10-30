import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { META_KPI_CATALOG, type MetaKpiUnit } from "@/lib/meta-dashboard-kpis";

function metaUnitToDashboard(unit: MetaKpiUnit): "currency_brl" | "percent" | "count" {
  if (unit === "currency") return "currency_brl";
  if (unit === "percent") return "percent";
  return "count";
}

type AnySb = {
  from: (t: string) => any;
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function tagLabel(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const raw = obj.name ?? obj.label ?? obj.tag_name ?? obj.value;
    if (typeof raw === "string") return raw.trim() || null;
  }
  return null;
}


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

export interface CatalogKpiItem {
  id: string;
  source: string;
  label: string;
  description: string;
  unit: "count" | "currency_brl" | "percent" | "duration_min";
  group?: string;
}

export interface KpiCatalogGroup {
  source: string;
  label: string;
  caption: string;
  connected: boolean;
  comingSoon?: boolean;
  connectHref?: string;
  items: CatalogKpiItem[];
}

export const listKpiCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    const [integRes, pipelinesRes, stagesRes, leadsRes, fieldsRes, metaAccountsRes] = await Promise.all([
      sb.from("integrations").select("provider, status").eq("workspace_id", wsId),
      sb.from("pipelines").select("id, name, position").eq("workspace_id", wsId).order("position"),
      sb.from("pipeline_stages").select("id, pipeline_id, name, position").eq("workspace_id", wsId).order("position"),
      sb.from("leads").select("id, pipeline_id, stage_id, tags").eq("workspace_id", wsId).eq("status", "active").limit(5000),
      sb.from("lead_custom_fields").select("id, name, field_type").eq("workspace_id", wsId).order("name"),
      sb.from("meta_ad_accounts").select("account_id").eq("workspace_id", wsId).limit(1),
    ]);
    const connectedSet = new Set(
      ((integRes.data ?? []) as Array<{ provider: string; status: string }>)
        .filter((i) => i.status === "connected")
        .map((i) => i.provider),
    );

    const pipelines = (pipelinesRes.data ?? []) as Array<{ id: string; name: string }>;
    const stages = (stagesRes.data ?? []) as Array<{ id: string; pipeline_id: string; name: string }>;
    const leads = (leadsRes.data ?? []) as Array<{ id: string; pipeline_id: string | null; stage_id: string | null; tags: unknown }>;
    const fields = (fieldsRes.data ?? []) as Array<{ id: string; name: string; field_type: string }>;
    const metaConnected = connectedSet.has("meta") || connectedSet.has("meta_ads") || ((metaAccountsRes.data ?? []) as unknown[]).length > 0;

    const tags = Array.from(new Set(leads.flatMap((lead) => Array.isArray(lead.tags) ? lead.tags.map(tagLabel).filter(Boolean) as string[] : [])))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));

    const crmItems: CatalogKpiItem[] = [
      { id: "crm.leads_total", source: "crm", label: "Leads totais", description: "Todos os leads ativos do CRM", unit: "count", group: "Volume" },
      { id: "crm.leads_abertos", source: "crm", label: "Leads em aberto", description: "Leads em etapas abertas", unit: "count", group: "Volume" },
      { id: "crm.leads_ganhos", source: "crm", label: "Leads ganhos", description: "Leads em etapas ganhas", unit: "count", group: "Resultado" },
      { id: "crm.leads_perdidos", source: "crm", label: "Leads perdidos", description: "Leads em etapas perdidas", unit: "count", group: "Resultado" },
      { id: "crm.valor_pipeline", source: "crm", label: "Valor do pipeline", description: "Soma dos leads em aberto", unit: "currency_brl", group: "Financeiro" },
      { id: "crm.valor_ganho", source: "crm", label: "Valor ganho", description: "Soma das vendas ganhas", unit: "currency_brl", group: "Financeiro" },
      { id: "crm.ticket_medio", source: "crm", label: "Ticket médio", description: "Valor médio por venda ganha", unit: "currency_brl", group: "Financeiro" },
      { id: "crm.taxa_conversao", source: "crm", label: "Taxa de conversão", description: "Ganhos sobre total de leads", unit: "percent", group: "Resultado" },
      { id: "crm.leads_24h", source: "crm", label: "Leads recebidos (24h)", description: "Criados nas últimas 24 horas", unit: "count", group: "Volume" },
      { id: "crm.leads_7d", source: "crm", label: "Leads recebidos (7d)", description: "Criados nos últimos 7 dias", unit: "count", group: "Volume" },
      { id: "crm.leads_30d", source: "crm", label: "Leads recebidos (30d)", description: "Criados nos últimos 30 dias", unit: "count", group: "Volume" },
      { id: "mkton.tasks_open", source: "crm", label: "Tarefas em aberto", description: "Tarefas pendentes no calendário", unit: "count", group: "Tarefas" },
      { id: "mkton.tasks_overdue", source: "crm", label: "Tarefas atrasadas", description: "Tarefas vencidas e não concluídas", unit: "count", group: "Tarefas" },
      { id: "mkton.companies_total", source: "crm", label: "Empresas cadastradas", description: "Total de empresas no CRM", unit: "count", group: "Empresas" },
      ...pipelines.flatMap((pipeline) => [
        { id: `crm.pipeline.${pipeline.id}.count`, source: "crm", label: `Leads · ${pipeline.name}`, description: `Leads no funil ${pipeline.name}`, unit: "count" as const, group: "Funis" },
        { id: `crm.pipeline.${pipeline.id}.value`, source: "crm", label: `Valor · ${pipeline.name}`, description: `Valor dos leads no funil ${pipeline.name}`, unit: "currency_brl" as const, group: "Funis" },
      ]),
      ...stages.flatMap((stage) => [
        { id: `crm.stage.${stage.id}.count`, source: "crm", label: `Leads · ${stage.name}`, description: "Leads nesta etapa do funil", unit: "count" as const, group: "Etapas do funil" },
        { id: `crm.stage.${stage.id}.value`, source: "crm", label: `Valor · ${stage.name}`, description: "Valor dos leads nesta etapa", unit: "currency_brl" as const, group: "Etapas do funil" },
      ]),
      ...tags.map((tag) => ({ id: `crm.tag.${tag}`, source: "crm", label: `Tag · ${tag}`, description: `Leads com a tag ${tag}`, unit: "count" as const, group: "Tags" })),
      ...fields.flatMap((field) => {
        const base = [
          { id: `crm.custom_field.${field.id}.filled`, source: "crm", label: `${field.name} preenchido`, description: `Leads com ${field.name} preenchido`, unit: "count" as const, group: "Campos personalizados" },
          { id: `crm.custom_field.${field.id}.unique`, source: "crm", label: `${field.name} únicos`, description: `Valores únicos em ${field.name}`, unit: "count" as const, group: "Campos personalizados" },
        ];
        if (field.field_type === "number") {
          base.push(
            { id: `crm.custom_field.${field.id}.sum`, source: "crm", label: `Soma · ${field.name}`, description: `Soma numérica de ${field.name}`, unit: "count" as const, group: "Campos personalizados" },
            { id: `crm.custom_field.${field.id}.avg`, source: "crm", label: `Média · ${field.name}`, description: `Média numérica de ${field.name}`, unit: "count" as const, group: "Campos personalizados" },
          );
        }
        return base;
      }),
    ];

    const groups: KpiCatalogGroup[] = [
      {
        source: "crm",
        label: "CRM Vanessa Simoni",
        caption: "Leads, funis, etapas, tags, tarefas, empresas e campos personalizados do CRM.",
        connected: true,
        items: crmItems,
      },
      {
        source: "meta_ads",
        label: "Meta Ads",
        caption: metaConnected ? "Todas as KPIs do Gerenciador de Anúncios da Meta, prontas para o dashboard." : "Conecte sua conta Meta Business para ver KPIs reais aqui.",
        connected: metaConnected,
        connectHref: "/integracoes",
        items: metaConnected ? META_KPI_CATALOG.map((k) => ({
          id: `meta.${k.key}`,
          source: "meta_ads",
          label: k.label,
          description: k.description ?? `${k.group} · Meta Ads`,
          unit: metaUnitToDashboard(k.unit),
          group: k.group,
        })) : [],
      },
      {
        source: "google_ads",
        label: "Google Ads",
        caption: "Em breve: KPIs de Google Ads ficarão disponíveis quando essa integração for liberada.",
        connected: false,
        comingSoon: true,
        items: [],
      },
      {
        source: "tiktok_ads",
        label: "TikTok Ads",
        caption: "Em breve: KPIs de TikTok Ads ficarão disponíveis quando essa integração for liberada.",
        connected: false,
        comingSoon: true,
        items: [],
      },
    ];

    return { groups };
  });

/* ============== Selections ============== */

export const listKpiSelections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data, error } = await sb
      .from("dashboard_kpi_selections")
      .select("id, kpi_key, source, position, size, viz")
      .eq("workspace_id", wsId)
      .eq("user_id", context.userId)
      .order("position");
    if (error) throw new Error(error.message);
    return { selections: (data ?? []) as Array<{ id: string; kpi_key: string; source: string; position: number; size: string; viz: string }> };
  });

export const saveKpiSelections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
    .inputValidator((d: unknown) => z.object({
    kpis: z.array(z.object({
      kpi_key: z.string(),
      source: z.string(),
      size: z.enum(["1x1", "2x1", "2x2"]).default("1x1"),
      viz: z.enum(["number", "sparkline", "area", "progress", "bars"]).default("number"),
    })),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    // Strategy: delete + reinsert (simpler than diff)
    await sb.from("dashboard_kpi_selections").delete().eq("workspace_id", wsId).eq("user_id", context.userId);
    if (data.kpis.length > 0) {
      const rows = data.kpis.map((k, idx) => ({
        workspace_id: wsId,
        user_id: context.userId,
        kpi_key: k.kpi_key,
        source: k.source,
        size: k.size,
        viz: k.viz,
        position: idx,
        config: {},
      }));
      const { error } = await sb.from("dashboard_kpi_selections").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const updateKpiSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    kpi_key: z.string(),
    size: z.enum(["1x1", "2x1", "2x2"]).optional(),
    viz: z.enum(["number", "sparkline", "area", "progress", "bars"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const patch: Record<string, unknown> = {};
    if (data.size) patch.size = data.size;
    if (data.viz) patch.viz = data.viz;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await sb.from("dashboard_kpi_selections")
      .update(patch)
      .eq("workspace_id", wsId)
      .eq("user_id", context.userId)
      .eq("kpi_key", data.kpi_key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============== Priority zones ============== */

export const listPriorityZones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data, error } = await sb
      .from("dashboard_priority_zones")
      .select("id, name, color, kpi_key, source, operator, threshold, position")
      .eq("workspace_id", wsId)
      .order("position");
    if (error) throw new Error(error.message);
    return { zones: (data ?? []) as Array<{ id: string; name: string; color: string; kpi_key: string; source: string; operator: string; threshold: number; position: number }> };
  });

export const upsertPriorityZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(80),
    color: z.string().min(3).max(40),
    kpi_key: z.string(),
    source: z.string(),
    operator: z.enum(["gt", "lt", "gte", "lte", "eq"]).default("gt"),
    threshold: z.number(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (data.id) {
      const { error } = await sb.from("dashboard_priority_zones").update({
        name: data.name, color: data.color, kpi_key: data.kpi_key, source: data.source,
        operator: data.operator, threshold: data.threshold,
      }).eq("id", data.id).eq("workspace_id", wsId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    } else {
      const { data: ins, error } = await sb.from("dashboard_priority_zones").insert({
        workspace_id: wsId, name: data.name, color: data.color, kpi_key: data.kpi_key,
        source: data.source, operator: data.operator, threshold: data.threshold,
      }).select("id").single();
      if (error) throw new Error(error.message);
      return { id: (ins as { id: string }).id };
    }
  });

export const deletePriorityZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb.from("dashboard_priority_zones").delete().eq("id", data.id).eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============== Meta ad-account selection for dashboard ============== */

export const listMetaDashboardAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data, error } = await sb
      .from("meta_ad_accounts")
      .select("account_id, name, currency, account_status, dashboard_enabled")
      .eq("workspace_id", wsId)
      .order("name");
    if (error) throw new Error(error.message);
    return {
      accounts: (data ?? []) as Array<{
        account_id: string;
        name: string | null;
        currency: string | null;
        account_status: number | null;
        dashboard_enabled: boolean;
      }>,
    };
  });

export const setMetaDashboardAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ account_ids: z.array(z.string()).default([]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    // desliga todas do workspace, e liga só as escolhidas
    const off = await sb
      .from("meta_ad_accounts")
      .update({ dashboard_enabled: false })
      .eq("workspace_id", wsId);
    if (off.error) throw new Error(off.error.message);
    if (data.account_ids.length > 0) {
      const on = await sb
        .from("meta_ad_accounts")
        .update({ dashboard_enabled: true })
        .eq("workspace_id", wsId)
        .in("account_id", data.account_ids);
      if (on.error) throw new Error(on.error.message);
    }
    return { ok: true };
  });
