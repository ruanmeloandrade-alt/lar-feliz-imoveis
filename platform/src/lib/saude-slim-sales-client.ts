/** Authenticated, workspace-scoped sales history. RLS remains enforced by Supabase. */
import { supabase } from "@/integrations/supabase/client";
import type { DrilldownLead } from "@/lib/mock-dashboard";
import { readAllSalesRows, salesStatus } from "./saude-slim-sales-read.core";

type Stage = { id: string; name: string };
type Pipeline = { id: string; name: string };
type Lead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  stage_id: string | null;
  pipeline_id: string | null;
  value: string | number | null;
  status: string;
  source: string | null;
  tags: unknown;
  custom_data: unknown;
  created_at: string;
  updated_at: string;
};
type Product = { id: string; name: string };
type Link = { lead_id: string; product_id: string };
const sb = supabase as any;

async function activeWorkspace(): Promise<string> {
  const { data: userResponse, error: authError } = await supabase.auth.getUser();
  if (authError || !userResponse.user) throw new Error("Entre na sua conta Vanessa Simoni para continuar.");
  const { data: profile, error: profileError } = await sb
    .from("profiles").select("current_workspace_id")
    .eq("id", userResponse.user.id).maybeSingle();
  if (profileError) throw new Error(profileError.message);
  const workspaceId: string | undefined = profile?.current_workspace_id;
  if (!workspaceId) throw new Error("Não há espaço de trabalho ativo para este usuário.");
  const { data: membership, error } = await sb
    .from("workspace_members").select("id")
    .eq("user_id", userResponse.user.id)
    .eq("workspace_id", workspaceId).maybeSingle();
  if (error || !membership) throw new Error("Você não possui acesso a esta empresa.");
  return workspaceId;
}

function getTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
function getFields(value: unknown): { key: string; value: string }[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([key, data]) => ({
    key,
    value: typeof data === "string" ? data : JSON.stringify(data ?? ""),
  }));
}

export async function getSaudeSlimSalesHistory(): Promise<{ drilldownLeads: DrilldownLead[] }> {
  const workspaceId = await activeWorkspace();
  // Stable ID ordering avoids shifting page boundaries when a lead is edited.
  const [leads, stages, pipelines] = await Promise.all([
    readAllSalesRows<Lead>((from, to) => sb.from("leads")
      .select("id,name,phone,email,stage_id,pipeline_id,value,status,source,tags,custom_data,created_at,updated_at")
      .eq("workspace_id", workspaceId).order("id").range(from, to)),
    readAllSalesRows<Stage>((from, to) => sb.from("pipeline_stages")
      .select("id,name").eq("workspace_id", workspaceId).order("id").range(from, to)),
    readAllSalesRows<Pipeline>((from, to) => sb.from("pipelines")
      .select("id,name").eq("workspace_id", workspaceId).order("id").range(from, to)),
  ]);
  leads.sort((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0) || a.id.localeCompare(b.id));
  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const pipelineMap = new Map(pipelines.map((p) => [p.id, p]));
  return {
    drilldownLeads: leads.map((lead): DrilldownLead => {
      const stage = stageMap.get(lead.stage_id ?? "");
      const status_key = salesStatus(lead.status, stage?.name);
      return {
        lead_id: lead.id,
        stage_id: lead.stage_id,
        status_key,
        name: lead.name,
        phone: lead.phone || "",
        email: lead.email,
        stage_name: stage?.name ?? "",
        funnel_name: pipelineMap.get(lead.pipeline_id ?? "")?.name ?? "Vendas",
        responsible: "",
        status_tags: [{ label: status_key === "won" ? "Venda ganha" : status_key === "lost" ? "Perdida" : "Aberta",
          tone: status_key === "won" ? "success" : status_key === "lost" ? "danger" : "info" }],
        value_brl: Number(lead.value ?? 0) || 0,
        origin: lead.source || "",
        created_at: lead.created_at,
        updated_at: lead.updated_at,
        custom_fields: getFields(lead.custom_data),
        crm_tags: getTags(lead.tags),
      };
    }),
  };
}

export async function getSaudeSlimSalesProducts(): Promise<{ rows: { name: string; leadIds: string[] }[] }> {
  const workspaceId = await activeWorkspace();
  const [links, productRows] = await Promise.all([
    readAllSalesRows<Link>((from, to) => sb.from("lead_products")
      .select("lead_id,product_id").eq("workspace_id", workspaceId).eq("kind", "comprou").order("id").range(from, to)),
    readAllSalesRows<Product>((from, to) => sb.from("products")
      .select("id,name").eq("workspace_id", workspaceId).order("id").range(from, to)),
  ]);
  const products = new Map(productRows.map((product) => [product.id, product.name]));
  const rows = new Map<string, { name: string; leadIds: string[] }>();
  for (const item of links) {
    const name = products.get(item.product_id);
    if (!name) continue;
    const row = rows.get(item.product_id) ?? { name, leadIds: [] };
    if (!row.leadIds.includes(item.lead_id)) row.leadIds.push(item.lead_id);
    rows.set(item.product_id, row);
  }
  return { rows: Array.from(rows.values()) };
}
