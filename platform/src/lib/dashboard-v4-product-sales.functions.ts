// SLIM_DASHBOARD_DATA_CONTRACT_V1
import { readDashboardRows, readDashboardRpc, dashboardIssues, classifyDashboardLead, type DashboardIssue } from "@/lib/slim-dashboard-data.core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";
import { allocateDashboardDealRevenue } from "@/lib/dashboard-v4-product-sales-revenue";

type AnySb = { from: (table: string) => any };

type LeadRow = {
  status?: string;
  id: string;
  pipeline_id: string | null;
  stage_id: string | null;
  value: number | string | null;
};

type StageRow = { id: string; name: string };

type ProductRow = {
  id: string;
  catalog_id: string;
  name: string;
};

type SaleLinkRow = {
  lead_id: string;
  product_id: string;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  sold_at?: string | null;
  created_at: string;
};

export type DashboardV4ProductSaleRow = {
  productId: string;
  name: string;
  catalogName: string;
  deals: number;
  units: number;
  revenue: number;
  ticket: number | null;
  share: number;
  pricedDeals: number;
  leadIds: string[];
};

export type DashboardV4ProductSalesResponse = {
  rows: DashboardV4ProductSaleRow[];
  totalDeals: number;
  totalUnits: number;
  totalRevenue: number;
  pricedLinks: number;
  totalLinks: number;
  revenueCoverage: number;
  schemaReady: boolean;
};

const inputSchema = z.object({
  venda_ganha_pipeline_id: z.string().optional(),
  venda_ganha_stage_id: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
}).partial();

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function automaticStatus(stageName: string | undefined): "won" | "lost" | "open" {
  const name = (stageName ?? "").toLowerCase();
  if (/ganh|venda\s*realiz|won|success/.test(name)) return "won";
  if (/perdid|lost|loss|descart/.test(name)) return "lost";
  return "open";
}

export const getDashboardV4ProductSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<DashboardV4ProductSalesResponse> => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await requireActiveWorkspace(sb, context.userId);

    const [stagesRes, leadsRes, productsRes, catalogsRes] = await Promise.all([
      readDashboardRows(sb, workspaceId, "pipeline_stages", "id,name"),
      readDashboardRows(sb, workspaceId, "leads", "id,status,pipeline_id,stage_id,value"),
      readDashboardRows(sb, workspaceId, "products", "id,catalog_id,name"),
      readDashboardRows(sb, workspaceId, "product_catalogs", "id,name"),
    ]);

    for (const result of [stagesRes, leadsRes, productsRes, catalogsRes]) {
      if (result.error) throw new Error(result.error.message);
    }

    let schemaReady = true;
    let linksRes = await readDashboardRows(sb, workspaceId, "lead_products", "lead_id,product_id,quantity,unit_price,sold_at,created_at", { purchased: true });

    if (linksRes.error && !["42703", "PGRST204"].includes(linksRes.error.code)) throw new Error(linksRes.error.message);
    if (linksRes.error) {
      schemaReady = false;
      linksRes = await readDashboardRows(sb, workspaceId, "lead_products", "lead_id,product_id,created_at", { purchased: true });
      if (linksRes.error) throw new Error(linksRes.error.message);
    }

    const stageById = new Map(((stagesRes.data ?? []) as StageRow[]).map((stage) => [stage.id, stage.name]));
    const leadById = new Map(((leadsRes.data ?? []) as LeadRow[]).map((lead) => [lead.id, lead]));
    const productById = new Map(((productsRes.data ?? []) as ProductRow[]).map((product) => [product.id, product]));
    const catalogById = new Map(((catalogsRes.data ?? []) as Array<{ id: string; name: string }>).map((catalog) => [catalog.id, catalog.name]));

    const classify = (lead: LeadRow): "won" | "lost" | "open" => classifyDashboardLead(lead, stageById.get(lead.stage_id ?? ""), data);

    const fromMs = data.date_from ? new Date(data.date_from).getTime() : null;
    const toMs = data.date_to ? new Date(`${data.date_to}T23:59:59.999Z`).getTime() : null;
    const inPeriod = (value: string | null | undefined) => {
      if (fromMs == null && toMs == null) return true;
      const timestamp = value ? new Date(value).getTime() : Number.NaN;
      if (!Number.isFinite(timestamp)) return false;
      if (fromMs != null && timestamp < fromMs) return false;
      if (toMs != null && timestamp > toMs) return false;
      return true;
    };

    const links = ((linksRes.data ?? []) as SaleLinkRow[]).filter((link) => {
      const lead = leadById.get(link.lead_id);
      if (!lead || classify(lead) !== "won") return false;
      if (!productById.has(link.product_id)) return false;
      return inPeriod(link.sold_at ?? link.created_at);
    });

    const linksByLead = new Map<string, SaleLinkRow[]>();
    for (const link of links) {
      const current = linksByLead.get(link.lead_id) ?? [];
      current.push(link);
      linksByLead.set(link.lead_id, current);
    }

    const buckets = new Map<string, {
      leadIds: Set<string>;
      units: number;
      revenue: number;
      pricedDeals: Set<string>;
    }>();

    let pricedLinks = 0;
    let totalUnits = 0;
    for (const [leadId, dealLinks] of linksByLead) {
      const lead = leadById.get(leadId);
      if (!lead) continue;

      const finalDealValue = numericOrNull(lead.value);
      const allocations = allocateDashboardDealRevenue(
        finalDealValue,
        dealLinks.map((link) => ({
          productId: link.product_id,
          quantity: Math.max(0, toNumber(link.quantity ?? 1)),
          unitPrice: numericOrNull(link.unit_price),
        })),
      );

      for (const allocation of allocations) {
        const current = buckets.get(allocation.productId) ?? {
          leadIds: new Set<string>(),
          units: 0,
          revenue: 0,
          pricedDeals: new Set<string>(),
        };
        current.leadIds.add(leadId);
        current.units += allocation.quantity;
        current.revenue += allocation.revenue;
        totalUnits += allocation.quantity;
        if (allocation.revenueKnown) {
          current.pricedDeals.add(leadId);
          pricedLinks += 1;
        }
        buckets.set(allocation.productId, current);
      }
    }

    const totalRevenue = [...buckets.values()].reduce((sum, item) => sum + item.revenue, 0);
    const uniqueDeals = new Set<string>();
    for (const bucket of buckets.values()) for (const leadId of bucket.leadIds) uniqueDeals.add(leadId);

    const rows: DashboardV4ProductSaleRow[] = [...buckets.entries()]
      .map(([productId, bucket]) => {
        const product = productById.get(productId)!;
        const deals = bucket.leadIds.size;
        return {
          productId,
          name: product.name,
          catalogName: catalogById.get(product.catalog_id) ?? "Catálogo",
          deals,
          units: bucket.units,
          revenue: bucket.revenue,
          ticket: bucket.pricedDeals.size ? bucket.revenue / bucket.pricedDeals.size : null,
          share: totalRevenue > 0 ? bucket.revenue / totalRevenue : 0,
          pricedDeals: bucket.pricedDeals.size,
          leadIds: [...bucket.leadIds],
        };
      })
      .sort((a, b) => b.revenue - a.revenue || b.deals - a.deals || b.units - a.units || a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, 10);

    return {
      rows,
      totalDeals: uniqueDeals.size,
      totalUnits,
      totalRevenue,
      pricedLinks,
      totalLinks: links.length,
      revenueCoverage: links.length ? pricedLinks / links.length : 1,
      schemaReady,
    };
  });
