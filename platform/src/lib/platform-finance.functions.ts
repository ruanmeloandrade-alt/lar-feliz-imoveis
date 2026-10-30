import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PageSizeSchema = z.union([z.literal(10), z.literal(20), z.literal(50)]);
const StatusSchema = z.enum([
  "all",
  "pending",
  "paid",
  "failed",
  "canceled",
  "expired",
  "refunded",
  "chargeback",
]);
const ListSchema = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: PageSizeSchema.default(20),
  status: StatusSchema.default("all"),
});
const FinancialSummarySchema = z.object({
  revenue_total_cents: z.coerce.number().finite().nonnegative(),
  revenue_month_cents: z.coerce.number().finite().nonnegative(),
  paid_sales: z.coerce.number().int().nonnegative(),
  new_sales: z.coerce.number().int().nonnegative(),
  renewals: z.coerce.number().int().nonnegative(),
  renewal_revenue_cents: z.coerce.number().finite().nonnegative(),
  mrr_cents: z.coerce.number().finite().nonnegative(),
  active_subscriptions: z.coerce.number().int().nonnegative(),
  trial_subscriptions: z.coerce.number().int().nonnegative(),
  canceled_subscriptions: z.coerce.number().int().nonnegative(),
  overdue_subscriptions: z.coerce.number().int().nonnegative(),
  renewals_due_30d: z.coerce.number().int().nonnegative(),
});

type AnySb = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type JsonRecord = Record<string, unknown>;

async function assertSuperAdmin(sb: AnySb, userId: string) {
  const { data, error } = await sb.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (error || data !== true) throw new Error("Acesso restrito ao administrador geral da Vanessa Simoni.");
}

function activationState(rawResponse: unknown) {
  const raw = rawResponse && typeof rawResponse === "object" ? rawResponse as JsonRecord : {};
  const required = raw.activation_reconciliation_required === true;
  const error = required && typeof raw.activation_error === "string"
    ? raw.activation_error.slice(0, 240)
    : null;
  const failedAt = required && typeof raw.activation_failed_at === "string"
    ? raw.activation_failed_at
    : null;
  return { required, error, failedAt };
}

export const getPlatformFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListSchema.parse(data))
  .handler(async ({ data, context }) => {
    const userClient = context.supabase as unknown as AnySb;
    await assertSuperAdmin(userClient, context.userId);

    const { data: summaryRaw, error: summaryError } = await userClient.rpc(
      "f06_admin_financial_summary",
      {},
    );
    if (summaryError) {
      throw new Error("O resumo financeiro administrativo ainda não está disponível no banco canônico.");
    }
    const parsedSummary = FinancialSummarySchema.safeParse(summaryRaw);
    if (!parsedSummary.success) {
      throw new Error("O resumo financeiro administrativo retornou um contrato inválido.");
    }
    const summary = parsedSummary.data;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const reconciliationQuery = admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("status", "paid")
      .contains("raw_response", { activation_reconciliation_required: true });

    const staleExternalBindingQuery = admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .in("provider", ["cora", "stripe"])
      .is("provider_charge_id", null)
      .lt("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

    const fetchPaymentsPage = (page: number) => {
      const offset = page * data.pageSize;
      let query = admin
        .from("payments")
        .select(
          "id,workspace_id,plan_id,coupon_id,period,provider,provider_charge_id,method,status,amount_cents,discount_cents,extra_employees,paid_at,due_at,created_at,raw_response",
          { count: "exact" },
        )
        .order("created_at", { ascending: false });
      if (data.status !== "all") query = query.eq("status", data.status);
      return query.range(offset, offset + data.pageSize - 1);
    };

    let [paymentsResult, reconciliationResult, staleExternalBindingResult] = await Promise.all([
      fetchPaymentsPage(data.page),
      reconciliationQuery,
      staleExternalBindingQuery,
    ]);
    if (paymentsResult.error) throw new Error("Não foi possível carregar os pagamentos da plataforma.");
    if (reconciliationResult.error) {
      throw new Error("Não foi possível verificar pagamentos aguardando reconciliação de ativação.");
    }
    if (staleExternalBindingResult.error) {
      throw new Error("Não foi possível verificar pagamentos externos sem vínculo de provider.");
    }

    const total = paymentsResult.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / data.pageSize));
    const safePage = Math.min(data.page, totalPages - 1);
    if (safePage !== data.page) {
      paymentsResult = await fetchPaymentsPage(safePage);
      if (paymentsResult.error) throw new Error("Não foi possível carregar a página financeira válida.");
    }

    const rows = paymentsResult.data ?? [];
    const workspaceIds = Array.from(new Set(rows.map((row: any) => row.workspace_id).filter(Boolean))) as string[];
    const planIds = Array.from(new Set(rows.map((row: any) => row.plan_id).filter(Boolean))) as string[];
    const couponIds = Array.from(new Set(rows.map((row: any) => row.coupon_id).filter(Boolean))) as string[];

    const [workspacesResult, plansResult, couponsResult] = await Promise.all([
      workspaceIds.length
        ? admin.from("workspaces").select("id,name,slug").in("id", workspaceIds)
        : Promise.resolve({ data: [], error: null }),
      planIds.length
        ? admin.from("plans").select("id,code,name").in("id", planIds)
        : Promise.resolve({ data: [], error: null }),
      couponIds.length
        ? admin.from("coupons").select("id,code,name").in("id", couponIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (workspacesResult.error || plansResult.error || couponsResult.error) {
      throw new Error("Não foi possível enriquecer a página financeira.");
    }

    const workspaceMap = new Map((workspacesResult.data ?? []).map((row: any) => [row.id, row]));
    const planMap = new Map((plansResult.data ?? []).map((row: any) => [row.id, row]));
    const couponMap = new Map((couponsResult.data ?? []).map((row: any) => [row.id, row]));

    return {
      summary,
      activationReconciliation: {
        pendingCount: reconciliationResult.count ?? 0,
      },
      externalBindingReconciliation: {
        pendingCount: staleExternalBindingResult.count ?? 0,
        staleAfterMinutes: 120,
      },
      payments: rows.map((payment: any) => ({
        id: payment.id,
        workspace: workspaceMap.get(payment.workspace_id) ?? null,
        plan: payment.plan_id ? planMap.get(payment.plan_id) ?? null : null,
        coupon: payment.coupon_id ? couponMap.get(payment.coupon_id) ?? null : null,
        period: payment.period,
        provider: payment.provider,
        provider_charge_id: payment.provider_charge_id,
        method: payment.method,
        status: payment.status,
        amount_cents: Number(payment.amount_cents ?? 0),
        discount_cents: Number(payment.discount_cents ?? 0),
        extra_employees: Number(payment.extra_employees ?? 0),
        activation: activationState(payment.raw_response),
        paid_at: payment.paid_at,
        due_at: payment.due_at,
        created_at: payment.created_at,
      })),
      pagination: {
        page: safePage,
        pageSize: data.pageSize,
        total,
        totalPages,
        hasPrevious: safePage > 0,
        hasNext: safePage + 1 < totalPages,
      },
      attribution: {
        available: false,
        reason: "Atribuição por afiliado, partner ou mídia só será exibida quando houver vínculo persistido e comprovado pela camada de tracking.",
      },
    };
  });
