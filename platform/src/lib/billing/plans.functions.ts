import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveServerSupabaseEnv } from "@/integrations/supabase/saude-slim-env";
import type { Database } from "@/integrations/supabase/types";
import { resolveActiveWorkspace } from "@/lib/workspace-resolver.server";
import { ALL_MODULES, canManageWorkspaceBilling, effectiveEntitledModules, isTrialActive } from "./entitlements";
import { PLAN_PRICES_CENTS } from "./price-catalog";
import type { Period, PlanCode } from "./types";

function publicClient() {
  const { url, publishableKey } = resolveServerSupabaseEnv();
  return createClient<Database>(
    url,
    publishableKey,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

const PERIODS: Period[] = ["1m", "3m", "6m", "1y"];

export const listPlans = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data: plans, error: plansError } = await sb.from("plans").select("*").eq("is_active", true).order("tier");
  if (plansError) throw new Error(plansError.message);

  // A UI usa o catálogo versionado como fonte de verdade. Isso evita que uma
  // migration ainda não aplicada deixe cards exibindo preço antigo.
  const activePlans = plans ?? [];
  const prices = activePlans.flatMap((plan) => {
    const code = plan.code as PlanCode;
    const catalog = PLAN_PRICES_CENTS[code];
    if (!catalog) return [];
    return PERIODS.map((period) => ({
      plan_id: plan.id,
      period,
      amount_cents: catalog[period],
    }));
  });

  return {
    plans: activePlans,
    prices,
  };
});

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as ReturnType<typeof publicClient>;
    const wsId = await resolveActiveWorkspace(sb, context.userId, { createIfMissing: false });
    if (!wsId) return null;
    // Instalação própria: módulos locais autorizados, sem assinatura SaaS ou cobrança.
    if(wsId === "2a0e0d29-4e23-47e6-bd9f-30aa8e15e698") {
      return {workspace_id:wsId,workspaceId:wsId,status:"active",plan:null,plan_id:null,trial_ends_at:null,trialDaysLeft:0,modules:[...ALL_MODULES],is_super_admin:false};
    }

    // Bypass total para a conta mãe (super_admin), sempre Enterprise + todos módulos.
    const { data: isSuper, error: roleError } = await sb.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (roleError) throw new Error(roleError.message);

    const { data: sub, error: subError } = await sb
      .from("subscriptions")
      .select("*, plan:plans(*)")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) throw new Error(subError.message);

    if (isSuper === true) {
      const { data: entPlan, error: entPlanError } = await sb.from("plans").select("*").eq("code", "enterprise").maybeSingle();
      if (entPlanError) throw new Error(entPlanError.message);
      return {
        ...(sub ?? {}),
        workspace_id: wsId,
        workspaceId: wsId,
        plan: entPlan ?? sub?.plan ?? null,
        plan_id: entPlan?.id ?? sub?.plan_id ?? null,
        status: "active",
        trial_ends_at: null,
        trialDaysLeft: 0,
        modules: [...ALL_MODULES],
        is_super_admin: true,
      };
    }

    if (!sub) return null;
    const { data: mods, error: modulesError } = await sb
      .from("workspace_modules")
      .select("modules")
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (modulesError) throw new Error(modulesError.message);

    const now = Date.now();
    const trialing = isTrialActive(sub.status, sub.trial_ends_at, now);
    const trialEnds = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
    const trialDaysLeft = trialing ? Math.max(0, Math.ceil((trialEnds - now) / 86_400_000)) : 0;
    const planCode = (sub.plan as { code?: string } | null)?.code ?? null;
    return {
      ...sub,
      workspaceId: wsId,
      trialDaysLeft,
      modules: effectiveEntitledModules({
        status: sub.status,
        trialEndsAt: sub.trial_ends_at,
        currentPeriodEnd: sub.current_period_end,
        planCode,
        workspaceModules: mods?.modules,
        now,
      }),
    };
  });

// Cancelamento de assinatura solicitado somente pelo dono do workspace.
export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { reason?: string }) => data ?? {})
  .handler(async ({ data, context }) => {
    const sb = context.supabase as ReturnType<typeof publicClient>;
    const wsId = await resolveActiveWorkspace(sb, context.userId, { createIfMissing: false });
    if (!wsId) return { error: "Workspace ativo não encontrado." };

    const { data: membership, error: membershipError } = await sb
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", wsId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (membershipError) return { error: "Não foi possível validar o acesso ao workspace." };

    let canManageBilling = canManageWorkspaceBilling(membership?.role);
    if (!canManageBilling) {
      // Compatibilidade com workspaces legados: o resolver canônico reconhece
      // owner_id mesmo quando a linha histórica em workspace_members não existe.
      // Billing deve respeitar a mesma identidade, sem exigir backfill prévio.
      const { data: ownedWorkspace, error: ownerError } = await sb
        .from("workspaces")
        .select("id")
        .eq("id", wsId)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (ownerError) return { error: "Não foi possível validar o dono do workspace." };
      canManageBilling = Boolean(ownedWorkspace?.id);
    }

    if (!canManageBilling) return { error: "Somente o dono do workspace pode cancelar a assinatura." };

    const { data: sub, error: subError } = await sb
      .from("subscriptions")
      .select("id,status,current_period_end,last_payment_id")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) return { error: "Não foi possível carregar a assinatura." };
    if (!sub) return { error: "Nenhuma assinatura encontrada." };
    if (sub.status === "canceled") {
      return { ok: true, accessUntil: sub.current_period_end ?? null, reason: data.reason ?? null };
    }
    if (sub.status !== "active") {
      return { error: "Nenhuma assinatura paga ativa encontrada para cancelamento." };
    }

    // A autorização é validada acima com a identidade autenticada. A escrita é
    // server-side para não depender de DML aberto ao cliente nem de policies de
    // UPDATE permissivas em subscriptions.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let cancelQuery = supabaseAdmin
      .from("subscriptions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("id", sub.id)
      .eq("workspace_id", wsId)
      .eq("status", "active");
    cancelQuery = sub.last_payment_id == null
      ? cancelQuery.is("last_payment_id", null)
      : cancelQuery.eq("last_payment_id", sub.last_payment_id);

    const { data: canceled, error } = await cancelQuery
      .select("current_period_end")
      .maybeSingle();
    if (error) return { error: "Não foi possível cancelar a assinatura." };
    if (!canceled) {
      return { error: "A assinatura mudou durante o cancelamento. Atualize a página e tente novamente." };
    }

    return { ok: true, accessUntil: canceled.current_period_end ?? null, reason: data.reason ?? null };
  });
