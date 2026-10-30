import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = { from: (t: string) => any };

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

export interface CrmReportKpi {
  id: string;
  label: string;
  value: number;
  prev: number;
  format: "number" | "currency" | "percent" | "days";
  invert?: boolean;
}

export interface CrmReportStage {
  id: string;
  name: string;
  count: number;
  value: number;
  status: "aberta" | "ganha" | "perdida";
}

export interface CrmReportSeriesPoint {
  date: string;
  count: number;
}

export interface CrmReportResponse {
  funnelName: string;
  totals: { leads: number; abertas: number; ganhas: number; perdidas: number; faturamento: number; valorAbertas: number };
  kpis: CrmReportKpi[];
  stages: CrmReportStage[];
  series: CrmReportSeriesPoint[];
}

export const getCrmReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(7).max(365).default(30) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    const { data: pipelines } = await sb
      .from("pipelines")
      .select("id, name, crm_sources(provider)")
      .eq("workspace_id", wsId)
      .order("position");

    type Pipe = { id: string; name: string; crm_sources: { provider: string } | null };
    const ps = ((pipelines ?? []) as Pipe[]);
    const pipeline = ps[0];

    if (!pipeline) {
      return {
        funnelName: "Sem funil",
        totals: { leads: 0, abertas: 0, ganhas: 0, perdidas: 0, faturamento: 0, valorAbertas: 0 },
        kpis: [],
        stages: [],
        series: [],
      } satisfies CrmReportResponse;
    }

    const { data: stages } = await sb
      .from("pipeline_stages")
      .select("id, name, position")
      .eq("pipeline_id", pipeline.id)
      .order("position");

    const { data: leads } = await sb
      .from("leads")
      .select("id, stage_id, value, created_at, updated_at")
      .eq("workspace_id", wsId)
      .eq("pipeline_id", pipeline.id);

    const stageRows = (stages ?? []) as Array<{ id: string; name: string; position: number }>;
    const leadRows = (leads ?? []) as Array<{ id: string; stage_id: string | null; value: number; created_at: string; updated_at: string }>;

    const stagesOut: CrmReportStage[] = stageRows.map((s) => {
      const ls = leadRows.filter((l) => l.stage_id === s.id);
      const status: CrmReportStage["status"] = /ganh|venda/i.test(s.name) ? "ganha" : /perdid/i.test(s.name) ? "perdida" : "aberta";
      return {
        id: s.id,
        name: s.name,
        count: ls.length,
        value: ls.reduce((t, l) => t + Number(l.value || 0), 0),
        status,
      };
    });

    const totals = {
      leads: leadRows.length,
      abertas: stagesOut.filter((s) => s.status === "aberta").reduce((t, s) => t + s.count, 0),
      ganhas: stagesOut.filter((s) => s.status === "ganha").reduce((t, s) => t + s.count, 0),
      perdidas: stagesOut.filter((s) => s.status === "perdida").reduce((t, s) => t + s.count, 0),
      faturamento: stagesOut.filter((s) => s.status === "ganha").reduce((t, s) => t + s.value, 0),
      valorAbertas: stagesOut.filter((s) => s.status === "aberta").reduce((t, s) => t + s.value, 0),
    };

    // Time series: leads criados por dia
    const now = new Date();
    const fromTs = now.getTime() - data.days * 86400000;
    const buckets = new Map<string, number>();
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const l of leadRows) {
      const t = new Date(l.created_at).getTime();
      if (t < fromTs) continue;
      const key = new Date(l.created_at).toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const series: CrmReportSeriesPoint[] = Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));

    const ticketMedio = totals.ganhas > 0 ? Math.round(totals.faturamento / totals.ganhas) : 0;
    const winrate = totals.ganhas + totals.perdidas > 0 ? Math.round((totals.ganhas / (totals.ganhas + totals.perdidas)) * 100) : 0;

    const kpis: CrmReportKpi[] = [
      { id: "leads", label: "Total de leads", value: totals.leads, prev: totals.leads, format: "number" },
      { id: "abertas", label: "Oportunidades abertas", value: totals.abertas, prev: totals.abertas, format: "number" },
      { id: "winrate", label: "Win rate", value: winrate, prev: winrate, format: "percent" },
      { id: "ticket", label: "Ticket médio", value: ticketMedio, prev: ticketMedio, format: "currency" },
      { id: "receita", label: "Receita fechada", value: totals.faturamento, prev: totals.faturamento, format: "currency" },
      { id: "pipeline", label: "Valor em pipeline", value: totals.valorAbertas, prev: totals.valorAbertas, format: "currency" },
    ];

    return {
      funnelName: pipeline.name,
      totals,
      kpis,
      stages: stagesOut,
      series,
    } satisfies CrmReportResponse;
  });
