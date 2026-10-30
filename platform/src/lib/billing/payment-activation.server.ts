import { periodEndDate, type Period } from "./types";

type JsonRecord = Record<string, unknown>;

type AdminClient = {
  from: (table: string) => any;
};

async function ensureCouponUsage(couponId: string | undefined, workspaceId: string, paymentId: string) {
  if (!couponId) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("coupon_usages")
    .select("id")
    .eq("payment_id", paymentId)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing) return;

  const { error } = await supabaseAdmin.from("coupon_usages").insert({
    coupon_id: couponId,
    workspace_id: workspaceId,
    payment_id: paymentId,
  });
  if (error) {
    const { data: recovered, error: recoveryError } = await supabaseAdmin
      .from("coupon_usages")
      .select("id")
      .eq("payment_id", paymentId)
      .maybeSingle();
    if (recoveryError) throw new Error(recoveryError.message);
    if (!recovered) throw new Error(error.message);
  }
}

function constrainPreviousPayment(query: any, lastPaymentId: string | null | undefined) {
  return lastPaymentId == null
    ? query.is("last_payment_id", null)
    : query.eq("last_payment_id", lastPaymentId);
}

function constrainNullable(query: any, column: string, value: unknown) {
  return value == null ? query.is(column, null) : query.eq(column, value);
}

function constrainSubscriptionSnapshot(query: any, subscription: JsonRecord) {
  let constrained = constrainPreviousPayment(query, subscription.last_payment_id as string | null | undefined);
  constrained = constrainNullable(constrained, "status", subscription.status);
  constrained = constrainNullable(constrained, "plan_id", subscription.plan_id);
  constrained = constrainNullable(constrained, "period", subscription.period);
  constrained = constrainNullable(constrained, "started_at", subscription.started_at);
  constrained = constrainNullable(constrained, "current_period_end", subscription.current_period_end);
  constrained = constrainNullable(constrained, "extra_employees", subscription.extra_employees);
  return constrained;
}

function validFutureDate(value: unknown, now: Date): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() > now.getTime() ? date : null;
}

function activationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "Falha de ativação desconhecida.");
  return message.slice(0, 600);
}

function activationRawResponse(raw: JsonRecord, error?: unknown) {
  if (error !== undefined) {
    return {
      ...raw,
      activation_reconciliation_required: true,
      activation_error: activationErrorMessage(error),
      activation_failed_at: new Date().toISOString(),
    };
  }
  return {
    ...raw,
    activation_reconciliation_required: false,
    activation_error: null,
    activation_reconciled_at: new Date().toISOString(),
  };
}

async function persistActivationState(
  admin: AdminClient,
  input: {
    paymentId: string;
    workspaceId: string;
    raw: JsonRecord;
    error?: unknown;
  },
) {
  let expectedRaw = input.raw;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nextRaw = activationRawResponse(expectedRaw, input.error);
    const { data: claimed, error } = await admin
      .from("payments")
      .update({ raw_response: nextRaw })
      .eq("id", input.paymentId)
      .eq("workspace_id", input.workspaceId)
      .contains("raw_response", expectedRaw)
      .containedBy("raw_response", expectedRaw)
      .select("id")
      .maybeSingle();

    if (error) {
      if (input.error !== undefined) {
        console.error("Não foi possível persistir falha de ativação do pagamento:", error.message);
      }
      return;
    }
    if (claimed) return;

    const { data: latest, error: latestError } = await admin
      .from("payments")
      .select("raw_response")
      .eq("id", input.paymentId)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle();
    if (latestError || !latest) {
      if (input.error !== undefined && latestError) {
        console.error("Não foi possível reler o estado de ativação do pagamento:", latestError.message);
      }
      return;
    }
    expectedRaw = ((latest.raw_response ?? {}) as JsonRecord);
  }

  if (input.error !== undefined) {
    console.error("Não foi possível persistir falha de ativação do pagamento após concorrência repetida.");
  }
}

async function activateSubscriptionUnsafe(
  supabaseAdmin: AdminClient,
  payment: JsonRecord,
  extrasOnly: boolean,
) {
  const paymentId = typeof payment.id === "string" ? payment.id : undefined;
  const workspaceId = typeof payment.workspace_id === "string" ? payment.workspace_id : undefined;
  const planId = typeof payment.plan_id === "string" ? payment.plan_id : undefined;
  const period = typeof payment.period === "string" ? payment.period : undefined;
  const couponId = typeof payment.coupon_id === "string" ? payment.coupon_id : undefined;
  const raw = (payment.raw_response ?? {}) as JsonRecord;
  if (!paymentId || !workspaceId) throw new Error("Pagamento sem workspace ou identificador.");

  const { data: currentSubscription, error: currentError } = await supabaseAdmin
    .from("subscriptions")
    .select("status,plan_id,period,started_at,current_period_end,extra_employees,last_payment_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  if (!currentSubscription) throw new Error("Assinatura do workspace não encontrada.");

  const alreadyApplied = currentSubscription.last_payment_id === paymentId;
  const now = new Date();
  const currentEnd = validFutureDate(currentSubscription.current_period_end, now);
  const hasPaidCoverage = currentSubscription.status === "active"
    || (currentSubscription.status === "canceled" && currentEnd !== null);

  if (extrasOnly) {
    if (alreadyApplied) {
      await ensureCouponUsage(couponId, workspaceId, paymentId);
      return;
    }
    if (!hasPaidCoverage) {
      throw new Error("Adicionais só podem ser ativados enquanto houver uma vigência paga válida.");
    }
    if (!planId || !period || currentSubscription.plan_id !== planId || currentSubscription.period !== period) {
      throw new Error("A assinatura mudou depois da criação deste pagamento de adicionais. Gere uma nova cobrança para o plano atual.");
    }
    const quotedCoverageEnd = typeof raw.extras_coverage_end === "string" ? raw.extras_coverage_end : null;
    if (!quotedCoverageEnd || currentSubscription.current_period_end !== quotedCoverageEnd) {
      throw new Error("A vigência da assinatura mudou depois da cotação dos adicionais. Gere uma nova cobrança para a vigência atual.");
    }

    const baseQuery = supabaseAdmin
      .from("subscriptions")
      .update({
        extra_employees: Number(currentSubscription.extra_employees ?? 0) + Number(payment.extra_employees ?? 0),
        last_payment_id: paymentId,
      })
      .eq("workspace_id", workspaceId);
    const { data: claimed, error } = await constrainSubscriptionSnapshot(baseQuery, currentSubscription as JsonRecord)
      .select("last_payment_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!claimed) {
      const { data: latest, error: latestError } = await supabaseAdmin
        .from("subscriptions")
        .select("last_payment_id")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (latestError) throw new Error(latestError.message);
      if (latest?.last_payment_id !== paymentId) throw new Error("Assinatura foi alterada concorrentemente; pagamento será reconciliado em novo retry.");
    }
    await ensureCouponUsage(couponId, workspaceId, paymentId);
    return;
  }

  if (!alreadyApplied) {
    if (!planId || !period) throw new Error("Pagamento sem plano ou período.");
    const samePlanRenewal = hasPaidCoverage
      && currentSubscription.plan_id === planId
      && currentEnd !== null;
    const coverageStart = samePlanRenewal && currentEnd ? currentEnd : now;
    const end = periodEndDate(coverageStart, period as Period);
    const startedAt = samePlanRenewal && currentSubscription.started_at
      ? currentSubscription.started_at
      : now.toISOString();

    const baseQuery = supabaseAdmin
      .from("subscriptions")
      .update({
        status: "active",
        plan_id: planId,
        period,
        started_at: startedAt,
        current_period_end: end.toISOString(),
        extra_employees: Number(payment.extra_employees ?? 0),
        last_payment_id: paymentId,
      })
      .eq("workspace_id", workspaceId);
    const { data: claimed, error } = await constrainSubscriptionSnapshot(baseQuery, currentSubscription as JsonRecord)
      .select("last_payment_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!claimed) {
      const { data: latest, error: latestError } = await supabaseAdmin
        .from("subscriptions")
        .select("last_payment_id")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (latestError) throw new Error(latestError.message);
      if (latest?.last_payment_id !== paymentId) throw new Error("Assinatura foi alterada concorrentemente; pagamento será reconciliado em novo retry.");
    }
  }

  await ensureCouponUsage(couponId, workspaceId, paymentId);
}

export async function activateSubscriptionForPayment(payment: JsonRecord, extrasOnly = false) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const paymentId = typeof payment.id === "string" ? payment.id : undefined;
  const workspaceId = typeof payment.workspace_id === "string" ? payment.workspace_id : undefined;
  if (!paymentId || !workspaceId) throw new Error("Pagamento sem workspace ou identificador.");

  const { data: canonical, error: canonicalError } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (canonicalError) throw new Error(canonicalError.message);
  if (!canonical) throw new Error("Pagamento não encontrado no ledger canônico.");
  if (canonical.status !== "paid") throw new Error("Pagamento ainda não está confirmado como pago no ledger.");

  const canonicalPayment = canonical as JsonRecord;
  const raw = (canonicalPayment.raw_response ?? {}) as JsonRecord;
  const canonicalExtrasOnly = Boolean(raw.extras_only);
  if (extrasOnly !== canonicalExtrasOnly) {
    throw new Error("Modo de ativação divergente do pagamento canônico.");
  }

  try {
    await activateSubscriptionUnsafe(supabaseAdmin, canonicalPayment, canonicalExtrasOnly);
    if (raw.activation_reconciliation_required === true) {
      await persistActivationState(supabaseAdmin, { paymentId, workspaceId, raw });
    }
  } catch (error) {
    await persistActivationState(supabaseAdmin, { paymentId, workspaceId, raw, error });
    throw error;
  }
}

export async function markStripePaymentPaidAndActivate(payment: JsonRecord) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const paymentId = typeof payment.id === "string" ? payment.id : undefined;
  const workspaceId = typeof payment.workspace_id === "string" ? payment.workspace_id : undefined;
  if (!paymentId || !workspaceId) throw new Error("Pagamento inválido.");

  let current = payment;
  if (payment.status !== "paid") {
    const paidAt = new Date().toISOString();
    const { data: claimed, error } = await supabaseAdmin
      .from("payments")
      .update({ status: "paid", paid_at: paidAt })
      .eq("id", paymentId)
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (claimed) current = claimed as JsonRecord;
    else {
      const { data: latest, error: latestError } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("id", paymentId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (latestError) throw new Error(latestError.message);
      if (!latest || latest.status !== "paid") return false;
      current = latest as JsonRecord;
    }
  }

  const currentRaw = (current.raw_response ?? {}) as JsonRecord;
  await activateSubscriptionForPayment(current, Boolean(currentRaw.extras_only));
  return true;
}
