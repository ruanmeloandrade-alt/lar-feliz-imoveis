import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";
import { correctMktonManualAgentsAndSoftware } from "@/lib/mkton-manual-agents-briefing.server";
import {
  MKTON_MANUAL_AGENT_NAMES,
  MKTON_MANUAL_BOT_IDS,
  MKTON_MANUAL_PACK_VERSION,
  resetAndProvisionMktonManualPack,
} from "@/lib/mkton-manual-pack.server";

type AnySb = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

const MKTON_ADMIN_WORKSPACE_SLUG = "ruanandradenegocios.mkton";
const MKTON_AGENT_MODEL = "openai/gpt-5.5";
const SOFTWARE_BRIEFING_SLUG = "mkton-briefing-software";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

async function resolveMktonContext(sb: AnySb, userId: string) {
  const workspaceId = await requireActiveWorkspace(sb as never, userId);
  const { data: workspace, error: wsError } = await sb
    .from("workspaces")
    .select("id,name,slug")
    .eq("id", workspaceId)
    .maybeSingle();
  if (wsError) throw new Error(wsError.message);
  if (!workspace) throw new Error("Workspace ativo não encontrado.");

  const workspaceSlug = normalize(String(workspace.slug ?? ""));
  const isMkton = workspaceSlug === MKTON_ADMIN_WORKSPACE_SLUG;
  const { data: isSuperAdmin, error: roleError } = await sb.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (roleError) throw new Error(roleError.message);

  return { workspaceId, workspace, isMkton, isSuperAdmin: isSuperAdmin === true };
}

function getPackVersion(settings: unknown) {
  if (!settings || typeof settings !== "object") return null;
  const value = (settings as Record<string, unknown>).manual_pack_version;
  return typeof value === "string" ? value : null;
}

async function loadManualPackState(sb: AnySb, workspaceId: string) {
  const [botsResult, agentsResult, softwareBriefingResult] = await Promise.all([
    sb
      .from("salesbots")
      .select("local_id,settings")
      .eq("workspace_id", workspaceId)
      .in("local_id", [...MKTON_MANUAL_BOT_IDS]),
    sb
      .from("conversation_ai_agents")
      .select("name,model,metadata")
      .eq("workspace_id", workspaceId)
      .in("name", [...MKTON_MANUAL_AGENT_NAMES]),
    sb
      .from("crm_forms")
      .select("id,slug")
      .eq("workspace_id", workspaceId)
      .eq("slug", SOFTWARE_BRIEFING_SLUG)
      .maybeSingle(),
  ]);

  if (botsResult.error) {
    throw new Error(`Falha ao auditar SalesBots Vanessa Simoni: ${botsResult.error.message}`);
  }
  if (agentsResult.error) {
    throw new Error(`Falha ao auditar agentes Vanessa Simoni: ${agentsResult.error.message}`);
  }
  if (softwareBriefingResult.error) {
    throw new Error(`Falha ao auditar briefing Software: ${softwareBriefingResult.error.message}`);
  }

  const botRows = (botsResult.data ?? []) as Array<{ local_id?: string | null; settings?: unknown }>;
  const agentRows = (agentsResult.data ?? []) as Array<{
    name?: string | null;
    model?: string | null;
    metadata?: unknown;
  }>;
  const botIds = new Set(botRows.map((row) => String(row.local_id ?? "")).filter(Boolean));
  const agentNames = new Set(agentRows.map((row) => String(row.name ?? "")).filter(Boolean));
  const botsSeeded = botRows.some(
    (row) => getPackVersion(row.settings) === MKTON_MANUAL_PACK_VERSION,
  );
  const agentsCorrect =
    agentRows.length === MKTON_MANUAL_AGENT_NAMES.length &&
    agentRows.every((row) => row.model === MKTON_AGENT_MODEL);
  const softwareBriefingReady = Boolean(softwareBriefingResult.data?.id);

  const missingBots = MKTON_MANUAL_BOT_IDS.filter((id) => !botIds.has(id));
  const missingAgents = MKTON_MANUAL_AGENT_NAMES.filter((name) => !agentNames.has(name));
  const packSeeded =
    botsSeeded &&
    missingBots.length === 0 &&
    missingAgents.length === 0 &&
    agentsCorrect &&
    softwareBriefingReady;

  return {
    packSeeded,
    expectedBots: MKTON_MANUAL_BOT_IDS.length,
    foundBots: botIds.size,
    missingBots,
    expectedAgents: MKTON_MANUAL_AGENT_NAMES.length,
    foundAgents: agentNames.size,
    missingAgents,
    agentsCorrect,
    agentModel: MKTON_AGENT_MODEL,
    softwareBriefingReady,
  };
}

/**
 * O pacote manual é semeado uma única vez.
 * Depois disso, o sistema não reescreve bots/agentes para preservar as conexões feitas à mão.
 */
export const getMktonBootstrapState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const resolved = await resolveMktonContext(sb, context.userId);

    if (!resolved.isMkton || !resolved.isSuperAdmin) {
      return {
        allowed: false,
        reason: !resolved.isMkton ? "workspace_not_mkton" : "not_super_admin",
        workspace: {
          id: resolved.workspace.id,
          name: resolved.workspace.name,
          slug: resolved.workspace.slug,
        },
        leadEntryReady: true,
        fullOperationReady: true,
        productsReady: true,
      };
    }

    const state = await loadManualPackState(sb, resolved.workspaceId);
    return {
      allowed: true,
      workspace: {
        id: resolved.workspace.id,
        name: resolved.workspace.name,
        slug: resolved.workspace.slug,
      },
      // Desativa o bootstrap antigo de 4 bots de entrada + agente de cadastro.
      leadEntryReady: true,
      fullOperationReady: state.packSeeded,
      productsReady: true,
      manualPack: state,
    };
  });

export const provisionMktonFull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { workspaceId, workspace, isMkton, isSuperAdmin } = await resolveMktonContext(
      sb,
      context.userId,
    );

    if (!isMkton) {
      return {
        ok: true,
        skipped: true,
        reason: "workspace_not_mkton",
        workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      };
    }
    if (!isSuperAdmin) {
      return {
        ok: true,
        skipped: true,
        reason: "not_super_admin",
        workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      };
    }

    const before = await loadManualPackState(sb, workspaceId);
    if (before.packSeeded) {
      return {
        ok: true,
        skipped: true,
        reason: "manual_pack_already_seeded_preserve_manual_connections",
        workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
        manualPack: before,
      };
    }

    // Primeiro zera o workspace e cria os 24 SalesBots. O bootstrap legado cria três agentes
    // temporários no fim; na etapa seguinte eles são substituídos pelos agentes de objetivo corretos.
    const pack = await resetAndProvisionMktonManualPack({ sb, workspaceId });
    const corrected = await correctMktonManualAgentsAndSoftware({ sb, workspaceId });
    const after = await loadManualPackState(sb, workspaceId);

    return {
      ok: true,
      skipped: false,
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      bootstrapBefore: before,
      bootstrapAfter: after,
      pack,
      corrected,
    };
  });
