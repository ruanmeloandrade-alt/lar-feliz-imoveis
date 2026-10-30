import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = { rpc: (fn: string, args?: Record<string, unknown>) => any };

type Run = {
  id: string;
  workspace_id: string;
  salesbot_id: string;
  lead_id: string;
  status: string;
  last_error: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};
type Bot = { id: string; workspace_id: string; name: string; gatilhos?: unknown; is_active?: boolean | null };
type Lead = { id: string; name?: string | null };
type Workspace = { id: string; name: string };

const ReportSchema = z.object({
  executionPage: z.number().int().min(0).max(10_000).default(0),
  botPage: z.number().int().min(0).max(10_000).default(0),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(50)]).default(20),
});

const isoMs = (value?: string | null) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

async function requireSuperAdmin(sb: AnySb, userId: string) {
  const { data, error } = await sb.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (error) throw new Error("Não foi possível validar a permissão administrativa.");
  if (data !== true) throw new Error("Acesso restrito ao administrador geral.");
}

function sanitizeRuntimeMessage(value?: string | null): string | null {
  if (!value) return null;
  return value
    .slice(0, 600)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [credencial]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[e-mail]")
    .replace(/\b(?:\+?\d[\s().-]?){10,15}\b/g, "[telefone]");
}

function pageMeta(page: number, pageSize: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  return {
    page: safePage,
    pageSize,
    total,
    totalPages,
    hasPrevious: safePage > 0,
    hasNext: safePage + 1 < totalPages,
  };
}

export const getOperationsExecutionReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => ReportSchema.parse(value ?? {}))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase as unknown as AnySb, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const fetchRunsPage = (page: number) => {
      const offset = page * data.pageSize;
      return admin
        .from("salesbot_runs")
        .select("id,workspace_id,salesbot_id,lead_id,status,last_error,started_at,updated_at,finished_at", { count: "exact" })
        .order("started_at", { ascending: false })
        .range(offset, offset + data.pageSize - 1);
    };
    const fetchBotsPage = (page: number) => {
      const offset = page * data.pageSize;
      return admin
        .from("salesbots")
        .select("id,workspace_id,name,gatilhos,is_active", { count: "exact" })
        .order("name", { ascending: true })
        .range(offset, offset + data.pageSize - 1);
    };

    let [runsQ, botsQ, errorCountQ, activeBotsCountQ] = await Promise.all([
      fetchRunsPage(data.executionPage),
      fetchBotsPage(data.botPage),
      admin.from("salesbot_runs").select("id", { count: "exact", head: true }).in("status", ["error", "failed", "falha"]),
      admin.from("salesbots").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);

    const totalRuns = runsQ.error ? null : (runsQ.count ?? 0);
    const totalBots = botsQ.error ? null : (botsQ.count ?? 0);
    const totalErrors = errorCountQ.error ? null : (errorCountQ.count ?? 0);
    const activeBots = activeBotsCountQ.error ? null : (activeBotsCountQ.count ?? 0);

    if (totalRuns !== null) {
      const safeExecutionPage = pageMeta(data.executionPage, data.pageSize, totalRuns).page;
      if (safeExecutionPage !== data.executionPage) runsQ = await fetchRunsPage(safeExecutionPage);
    }
    if (totalBots !== null) {
      const safeBotPage = pageMeta(data.botPage, data.pageSize, totalBots).page;
      if (safeBotPage !== data.botPage) botsQ = await fetchBotsPage(safeBotPage);
    }

    const warnings: Array<{ source: string; message: string }> = [];
    if (runsQ.error) warnings.push({ source: "execuções", message: "A consulta de execuções está indisponível; total e página não são confiáveis." });
    if (botsQ.error) warnings.push({ source: "SalesBots", message: "A consulta de SalesBots está indisponível; total e página não são confiáveis." });
    if (errorCountQ.error) warnings.push({ source: "execuções", message: "A contagem global de execuções com erro está indisponível." });
    if (activeBotsCountQ.error) warnings.push({ source: "SalesBots", message: "A contagem de SalesBots ativos está indisponível." });

    const runs = runsQ.error ? [] : ((runsQ.data ?? []) as Run[]);
    const bots = botsQ.error ? [] : ((botsQ.data ?? []) as Bot[]);
    const reliableRunsTotal = totalRuns ?? 0;
    const reliableBotsTotal = totalBots ?? 0;

    const workspaceIds = Array.from(new Set([...runs.map((run) => run.workspace_id), ...bots.map((bot) => bot.workspace_id)].filter(Boolean)));
    const botIds = Array.from(new Set(runs.map((run) => run.salesbot_id).filter(Boolean)));
    const leadIds = Array.from(new Set(runs.map((run) => run.lead_id).filter(Boolean)));

    const [workspacesQ, executionBotsQ, leadsQ] = await Promise.all([
      workspaceIds.length
        ? admin.from("workspaces").select("id,name").in("id", workspaceIds)
        : Promise.resolve({ data: [], error: null }),
      botIds.length
        ? admin.from("salesbots").select("id,workspace_id,name").in("id", botIds)
        : Promise.resolve({ data: [], error: null }),
      leadIds.length
        ? admin.from("leads").select("id,name").in("id", leadIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (workspacesQ.error) warnings.push({ source: "workspaces", message: "Não foi possível enriquecer alguns registros com o workspace." });
    if (executionBotsQ.error) warnings.push({ source: "SalesBots", message: "Não foi possível enriquecer algumas execuções com o nome do SalesBot." });
    if (leadsQ.error) warnings.push({ source: "leads", message: "Não foi possível enriquecer algumas execuções com o nome do lead." });

    const workspaceById = new Map(((workspacesQ.data ?? []) as Workspace[]).map((row) => [row.id, row]));
    const botById = new Map(((executionBotsQ.data ?? []) as Array<Pick<Bot, "id" | "name">>).map((row) => [row.id, row]));
    const leadById = new Map(((leadsQ.data ?? []) as Lead[]).map((row) => [row.id, row]));

    // Detecção conservadora: somente pares comprovados dentro da página atual.
    // Isso evita carregar milhares de logs e nunca acusa duplicidade sem timestamp.
    const duplicateIds = new Set<string>();
    const lastByKey = new Map<string, Run>();
    for (const run of [...runs].sort((a, b) => isoMs(a.started_at) - isoMs(b.started_at))) {
      const key = `${run.workspace_id}:${run.salesbot_id}:${run.lead_id}`;
      const previous = lastByKey.get(key);
      if (previous && isoMs(run.started_at) - isoMs(previous.started_at) <= 60_000) {
        duplicateIds.add(previous.id);
        duplicateIds.add(run.id);
      }
      lastByKey.set(key, run);
    }

    const executions = runs.map((run) => ({
      id: run.id,
      workspaceId: run.workspace_id,
      workspaceName: workspaceById.get(run.workspace_id)?.name ?? "Workspace removido",
      botName: botById.get(run.salesbot_id)?.name ?? "SalesBot removido",
      leadName: leadById.get(run.lead_id)?.name ?? "Lead",
      status: run.status,
      duplicate: duplicateIds.has(run.id),
      error: sanitizeRuntimeMessage(run.last_error),
      createdAt: run.started_at,
      updatedAt: run.finished_at ?? run.updated_at,
    }));

    const triggers = bots.map((bot) => ({
      id: bot.id,
      workspaceId: bot.workspace_id,
      workspaceName: workspaceById.get(bot.workspace_id)?.name ?? "Workspace removido",
      name: bot.name,
      active: bot.is_active === true,
      triggerCount: Array.isArray(bot.gatilhos) ? bot.gatilhos.length : 0,
    }));

    const incidents = executions
      .filter((item) => item.error || ["error", "failed", "falha"].includes(String(item.status).toLowerCase()) || item.duplicate)
      .map((item) => ({
        id: `${item.duplicate ? "duplicate" : "execution"}:${item.id}`,
        kind: item.duplicate ? "duplicidade" : "bug_execucao",
        title: item.duplicate ? `${item.botName} · possível execução duplicada` : `${item.botName} · falha de execução`,
        description: item.duplicate
          ? "Duas execuções do mesmo SalesBot para o mesmo lead começaram em até 60 segundos dentro desta página de telemetria."
          : item.error ?? `Execução terminou com status ${item.status}.`,
        status: "detectado",
        workspaceName: item.workspaceName,
        customerName: item.leadName,
        source: item.duplicate ? "detector_pagina" : "runtime",
        createdAt: item.createdAt,
      }))
      .sort((a, b) => isoMs(b.createdAt) - isoMs(a.createdAt));

    return {
      generatedAt: new Date().toISOString(),
      warnings,
      summary: {
        bots: totalBots,
        activeBots,
        inactiveBots: totalBots !== null && activeBots !== null ? Math.max(0, totalBots - activeBots) : null,
        executions: totalRuns,
        executionErrors: totalErrors,
      },
      botPagination: pageMeta(data.botPage, data.pageSize, reliableBotsTotal),
      executionPagination: pageMeta(data.executionPage, data.pageSize, reliableRunsTotal),
      triggers,
      executions,
      incidents,
    };
  });
