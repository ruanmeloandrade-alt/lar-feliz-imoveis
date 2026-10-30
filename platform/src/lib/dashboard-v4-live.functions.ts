// SLIM_DASHBOARD_DATA_CONTRACT_V1
import { readDashboardRows, readDashboardRpc, dashboardIssues, classifyDashboardLead, type DashboardIssue } from "@/lib/slim-dashboard-data.core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";

type AnySb = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type LeadRow = {
  status?: string;
  id: string;
  pipeline_id: string | null;
  stage_id: string | null;
  company_id: string | null;
  value: number | string | null;
  tags: unknown;
  created_at: string;
};

type StageRow = { id: string; pipeline_id: string; name: string; position: number | null };
type PipelineRow = { id: string; name: string; position: number | null };

type DashboardV4LiveInput = {
  venda_ganha_pipeline_id?: string;
  venda_ganha_stage_id?: string;
  date_from?: string;
  date_to?: string;
};

export type DashboardV4CompanyRow = {
  id: string;
  name: string;
  leadCount: number;
  wonDeals: number;
  revenue: number;
  leadIds: string[];
};

export type DashboardV4ProductRow = {
  id: string;
  name: string;
  catalogName: string;
  price: number;
  promoPrice: number | null;
  stock: number;
  active: boolean;
  category: string;
};

export type DashboardV4FormRow = {
  id: string;
  name: string;
  origin: string;
  submissions: number;
  linkedLeads: number;
  wonLeads: number;
  conversion: number | null;
  leadIds: string[];
};

export type DashboardV4TagRow = {
  name: string;
  leads: number;
  won: number;
  conversion: number | null;
  leadIds: string[];
};

export type DashboardV4CustomFieldRow = {
  fieldId: string;
  field: string;
  topValue: string;
  occurrences: number;
  baseCount: number;
  share: number;
  won: number;
  conversion: number | null;
  leadIds: string[];
};

export type DashboardV4TrackingData = {
  events24h: number | null;
  sessions24h: number | null;
  pageViews: number;
  clicks: number;
  leads: number;
  conversions: number;
  revenue: number;
  visitors: number;
  identifiedVisitors: number;
  sitesActive: number;
  sitesTotal: number;
  topCampaigns: Array<{ campaign: string; sessions: number; leads: number }>;
  topSources: Array<{ source: string; sessions: number; leads: number }>;
  eventBreakdown: Array<{ event: string; total: number }>;
};

export type DashboardV4LiveResponse = {
  issues?: DashboardIssue[];
  availability?: { forms: boolean; customFields: boolean; tracking: boolean };
  companies: DashboardV4CompanyRow[];
  products: DashboardV4ProductRow[];
  forms: DashboardV4FormRow[];
  tags: DashboardV4TagRow[];
  customFields: DashboardV4CustomFieldRow[];
  tracking: DashboardV4TrackingData | null;
  productSalesLinkAvailable: false;
  sellerOwnershipAvailable: false;
};

function stageStatus(stageName: string | undefined): "won" | "lost" | "open" {
  const name = (stageName ?? "").toLowerCase();
  if (/ganh|venda\s*realiz|won|success/.test(name)) return "won";
  if (/perdid|lost|loss|descart/.test(name)) return "lost";
  return "open";
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tagLabel(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const raw = object.name ?? object.label ?? object.tag_name ?? object.value;
    if (typeof raw === "string") return raw.trim() || null;
  }
  return null;
}

function customDisplayValue(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as { display?: unknown; raw?: unknown };
    if (object.display !== undefined && object.display !== null && String(object.display).trim()) return String(object.display).trim();
    if (Array.isArray(object.raw)) return object.raw.map(String).filter(Boolean).join(", ").trim();
    if (object.raw !== undefined && object.raw !== null) return String(object.raw).trim();
  }
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(", ").trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export const getDashboardV4LiveData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      venda_ganha_pipeline_id: z.string().optional(),
      venda_ganha_stage_id: z.string().optional(),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
    }).partial().parse(input ?? {}),
  )
  .handler(async ({ context, data }): Promise<DashboardV4LiveResponse> => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await requireActiveWorkspace(sb, context.userId);
    const rules = (data ?? {}) as DashboardV4LiveInput;

    const [
      pipelinesRes,
      stagesRes,
      leadsRes,
      companiesRes,
      catalogsRes,
      productsRes,
      formsRes,
      submissionsRes,
      fieldsRes,
      fieldValuesRes,
      sitesRes,
      tracking7Res,
    ] = await Promise.all([
      readDashboardRows(sb, workspaceId, "pipelines", "id, name, position"),
      readDashboardRows(sb, workspaceId, "pipeline_stages", "id, pipeline_id, name, position"),
      readDashboardRows(sb, workspaceId, "leads", "id, status, pipeline_id, stage_id, company_id, value, tags, created_at"),
      readDashboardRows(sb, workspaceId, "companies", "id, name, created_at"),
      readDashboardRows(sb, workspaceId, "product_catalogs", "id, name"),
      readDashboardRows(sb, workspaceId, "products", "id, catalog_id, name, price, promo_price, stock, active, category"),
      readDashboardRows(sb, workspaceId, "crm_forms", "id, nome, origem", { optional: true }),
      readDashboardRows(sb, workspaceId, "crm_form_submissions", "id, form_id, lead_id, created_at", { optional: true }),
      readDashboardRows(sb, workspaceId, "lead_custom_fields", "id, name", { optional: true }),
      readDashboardRows(sb, workspaceId, "lead_custom_field_values", "lead_id, field_id, value", { optional: true }),
      readDashboardRows(sb, workspaceId, "tracking_sites", "id, verified", { optional: true }),
      readDashboardRpc(sb, workspaceId, "tracking_overview", { _days: 7 }),
    ]);

    for (const result of [pipelinesRes, stagesRes, leadsRes, companiesRes, catalogsRes, productsRes, formsRes, submissionsRes, fieldsRes, fieldValuesRes, sitesRes]) {
      if (result.error) throw new Error(result.error.message);
    }

    const pipelines = (pipelinesRes.data ?? []) as PipelineRow[];
    const stages = (stagesRes.data ?? []) as StageRow[];
    const allLeads = (leadsRes.data ?? []) as LeadRow[];
    const stageById = new Map(stages.map((stage) => [stage.id, stage]));
    const pipelineIds = new Set(pipelines.map((pipeline) => pipeline.id));

    const fromMs = rules.date_from ? new Date(rules.date_from).getTime() : null;
    const toMs = rules.date_to ? new Date(rules.date_to).getTime() + 86_399_999 : null;
    const inPeriod = (iso: string | null | undefined) => {
      if (fromMs == null && toMs == null) return true;
      const timestamp = iso ? new Date(iso).getTime() : Number.NaN;
      if (!Number.isFinite(timestamp)) return false;
      if (fromMs != null && timestamp < fromMs) return false;
      if (toMs != null && timestamp > toMs) return false;
      return true;
    };

    const leads = allLeads.filter((lead) => {
      if (lead.pipeline_id && !pipelineIds.has(lead.pipeline_id)) return false;
      return inPeriod(lead.created_at);
    });
    const activeLeadIds = new Set(leads.map((lead) => lead.id));
    const leadById = new Map(leads.map((lead) => [lead.id, lead]));

    const wonStageOverride = rules.venda_ganha_stage_id ?? null;
    const wonPipelineOverride = rules.venda_ganha_pipeline_id ?? null;
    const hasWonOverride = Boolean(wonStageOverride || wonPipelineOverride);
    const classify = (lead: LeadRow): "won" | "lost" | "open" => classifyDashboardLead(lead, stageById.get(lead.stage_id ?? "")?.name, rules);

    const companyRows = (companiesRes.data ?? []) as Array<{ id: string; name: string }>;
    const companies: DashboardV4CompanyRow[] = companyRows
      .map((company) => {
        const related = leads.filter((lead) => lead.company_id === company.id);
        const won = related.filter((lead) => classify(lead) === "won");
        return {
          id: company.id,
          name: company.name,
          leadCount: related.length,
          wonDeals: won.length,
          revenue: won.reduce((sum, lead) => sum + toNumber(lead.value), 0),
          leadIds: related.map((lead) => lead.id),
        };
      })
      .filter((company) => company.leadCount > 0)
      .sort((a, b) => b.revenue - a.revenue || b.wonDeals - a.wonDeals || b.leadCount - a.leadCount)
      .slice(0, 10);

    const catalogById = new Map(((catalogsRes.data ?? []) as Array<{ id: string; name: string }>).map((catalog) => [catalog.id, catalog.name]));
    const products: DashboardV4ProductRow[] = ((productsRes.data ?? []) as Array<{
      id: string;
      catalog_id: string;
      name: string;
      price: number | string | null;
      promo_price: number | string | null;
      stock: number | string | null;
      active: boolean | null;
      category: string | null;
    }>).map((product) => ({
      id: product.id,
      name: product.name,
      catalogName: catalogById.get(product.catalog_id) ?? "Catálogo",
      price: toNumber(product.price),
      promoPrice: product.promo_price == null ? null : toNumber(product.promo_price),
      stock: toNumber(product.stock),
      active: Boolean(product.active),
      category: product.category ?? "Sem categoria",
    })).sort((a, b) => Number(b.active) - Number(a.active) || b.stock - a.stock || a.name.localeCompare(b.name, "pt-BR")).slice(0, 10);

    const formRows = (formsRes.data ?? []) as Array<{ id: string; nome: string; origem: string | null }>;
    const submissionRows = ((submissionsRes.data ?? []) as Array<{ id: string; form_id: string; lead_id: string | null; created_at: string }>).filter((submission) => inPeriod(submission.created_at));
    const forms: DashboardV4FormRow[] = formRows.map((form) => {
      const submissions = submissionRows.filter((submission) => submission.form_id === form.id);
      const leadIds = [...new Set(submissions.map((submission) => submission.lead_id).filter((id): id is string => Boolean(id) && activeLeadIds.has(id!)))];
      const wonLeads = leadIds.filter((leadId) => {
        const lead = leadById.get(leadId);
        return lead ? classify(lead) === "won" : false;
      });
      return {
        id: form.id,
        name: form.nome,
        origin: form.origem ?? "mkton",
        submissions: submissions.length,
        linkedLeads: leadIds.length,
        wonLeads: wonLeads.length,
        conversion: leadIds.length ? wonLeads.length / leadIds.length : null,
        leadIds,
      };
    }).filter((form) => form.submissions > 0).sort((a, b) => b.submissions - a.submissions || (b.conversion ?? -1) - (a.conversion ?? -1)).slice(0, 10);

    const tagMap = new Map<string, { label: string; leadIds: Set<string>; wonIds: Set<string> }>();
    for (const lead of leads) {
      if (!Array.isArray(lead.tags)) continue;
      for (const rawTag of lead.tags as unknown[]) {
        const label = tagLabel(rawTag);
        if (!label) continue;
        const key = label.toLocaleLowerCase("pt-BR");
        const current = tagMap.get(key) ?? { label, leadIds: new Set<string>(), wonIds: new Set<string>() };
        current.leadIds.add(lead.id);
        if (classify(lead) === "won") current.wonIds.add(lead.id);
        tagMap.set(key, current);
      }
    }
    const tags: DashboardV4TagRow[] = [...tagMap.values()].map((tag) => ({
      name: tag.label,
      leads: tag.leadIds.size,
      won: tag.wonIds.size,
      conversion: tag.leadIds.size ? tag.wonIds.size / tag.leadIds.size : null,
      leadIds: [...tag.leadIds],
    })).sort((a, b) => b.leads - a.leads || (b.conversion ?? 0) - (a.conversion ?? 0)).slice(0, 12);

    const fieldById = new Map(((fieldsRes.data ?? []) as Array<{ id: string; name: string }>).map((field) => [field.id, field.name]));
    const fieldBuckets = new Map<string, Map<string, Set<string>>>();
    for (const row of (fieldValuesRes.data ?? []) as Array<{ lead_id: string; field_id: string; value: unknown }>) {
      if (!activeLeadIds.has(row.lead_id) || !fieldById.has(row.field_id)) continue;
      const value = customDisplayValue(row.value);
      if (!value) continue;
      const byValue = fieldBuckets.get(row.field_id) ?? new Map<string, Set<string>>();
      const ids = byValue.get(value) ?? new Set<string>();
      ids.add(row.lead_id);
      byValue.set(value, ids);
      fieldBuckets.set(row.field_id, byValue);
    }

    const customFields: DashboardV4CustomFieldRow[] = [];
    for (const [fieldId, byValue] of fieldBuckets) {
      const entries = [...byValue.entries()].sort((a, b) => b[1].size - a[1].size);
      const top = entries[0];
      if (!top) continue;
      const baseLeadIds = new Set<string>();
      for (const ids of byValue.values()) for (const leadId of ids) baseLeadIds.add(leadId);
      const topLeadIds = [...top[1]];
      const won = topLeadIds.filter((leadId) => {
        const lead = leadById.get(leadId);
        return lead ? classify(lead) === "won" : false;
      }).length;
      customFields.push({
        fieldId,
        field: fieldById.get(fieldId) ?? "Campo",
        topValue: top[0],
        occurrences: topLeadIds.length,
        baseCount: baseLeadIds.size,
        share: baseLeadIds.size ? topLeadIds.length / baseLeadIds.size : 0,
        won,
        conversion: topLeadIds.length ? won / topLeadIds.length : null,
        leadIds: topLeadIds,
      });
    }
    customFields.sort((a, b) => b.baseCount - a.baseCount || b.occurrences - a.occurrences);

    let tracking: DashboardV4TrackingData | null = null;
    if (!tracking7Res.error && !sitesRes.issue && tracking7Res.data) {
      const raw = tracking7Res.data as {
        events?: number;
        sessions?: number;
        visitors?: number;
        identified_visitors?: number;
        leads?: number;
        page_views?: number;
        conversions?: number;
        revenue?: number;
        by_event?: Record<string, number>;
        by_campaign?: Array<{ campaign: string; sessions: number; leads: number }>;
        by_source?: Array<{ source: string; sessions: number; leads: number }>;
      };
      const byEvent = raw.by_event ?? {};
      tracking = {
        events24h: null,
        sessions24h: null,
        pageViews: toNumber(raw.page_views),
        clicks: toNumber(byEvent.click) + toNumber(byEvent.whatsapp_click) + toNumber(byEvent.phone_click),
        leads: toNumber(raw.leads),
        conversions: toNumber(raw.conversions),
        revenue: toNumber(raw.revenue),
        visitors: toNumber(raw.visitors),
        identifiedVisitors: toNumber(raw.identified_visitors),
        sitesActive: ((sitesRes.data ?? []) as Array<{ verified: boolean }>).filter((site) => site.verified).length,
        sitesTotal: (sitesRes.data ?? []).length,
        topCampaigns: (raw.by_campaign ?? []).slice(0, 8).map((campaign) => ({
          campaign: campaign.campaign,
          sessions: toNumber(campaign.sessions),
          leads: toNumber(campaign.leads),
        })),
        topSources: (raw.by_source ?? []).slice(0, 8).map((source) => ({
          source: source.source,
          sessions: toNumber(source.sessions),
          leads: toNumber(source.leads),
        })),
        eventBreakdown: Object.entries(byEvent)
          .map(([event, total]) => ({ event, total: toNumber(total) }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 8),
      };
    }

    return {
      issues: dashboardIssues(formsRes, submissionsRes, fieldsRes, fieldValuesRes, sitesRes, tracking7Res),
      availability: {
        forms: !formsRes.issue && !submissionsRes.issue,
        customFields: !fieldsRes.issue && !fieldValuesRes.issue,
        tracking: !sitesRes.issue && !tracking7Res.issue && Boolean(tracking7Res.data),
      },
      companies,
      products,
      forms,
      tags,
      customFields: customFields.slice(0, 10),
      tracking,
      productSalesLinkAvailable: false,
      sellerOwnershipAvailable: false,
    };
  });
