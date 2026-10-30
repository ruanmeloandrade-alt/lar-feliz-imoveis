import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> };

const PlanSchema = z.enum(["starter", "professional", "business", "enterprise", "teste"]);
const PeriodSchema = z.enum(["1m", "3m", "6m", "1y"]);

const CouponSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40),
  description: z.string().trim().max(500).optional().nullable(),
  kind: z.enum(["percent", "fixed", "override"]),
  value: z.number().positive(),
  is_active: z.boolean(),
  starts_at: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  max_uses: z.number().int().positive().optional().nullable(),
  max_uses_per_customer: z.number().int().positive().optional().nullable(),
  valid_plans: z.array(PlanSchema),
  valid_periods: z.array(PeriodSchema),
  valid_modules: z.array(z.string()).optional(),
  is_subscription: z.boolean().default(true),
}).superRefine((coupon, ctx) => {
  if (coupon.kind === "percent" && coupon.value > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message: "Cupom percentual não pode ultrapassar 100%.",
    });
  }

  const startsAt = coupon.starts_at?.trim() ? Date.parse(coupon.starts_at) : null;
  const expiresAt = coupon.expires_at?.trim() ? Date.parse(coupon.expires_at) : null;
  if (startsAt !== null && !Number.isFinite(startsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["starts_at"], message: "Data inicial do cupom inválida." });
  }
  if (expiresAt !== null && !Number.isFinite(expiresAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expires_at"], message: "Data de expiração do cupom inválida." });
  }
  if (startsAt !== null && expiresAt !== null && Number.isFinite(startsAt) && Number.isFinite(expiresAt) && startsAt > expiresAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expires_at"],
      message: "A expiração do cupom deve ser posterior ao início.",
    });
  }
});

const CampaignSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  type: z.enum(["billing", "sms", "renewal", "promotional", "recovery"]),
  name: z.string().trim().min(2).max(140),
  audience: z.string().trim().min(2).max(180),
  trigger_key: z.string().trim().max(80).optional().nullable(),
  message: z.string().trim().min(2).max(1200),
  action: z.string().trim().max(220).optional().nullable(),
  status: z.enum(["draft", "scheduled", "active", "paused", "sent", "archived"]),
  scheduled_at: z.string().optional().nullable(),
}).superRefine((campaign, ctx) => {
  const scheduledAt = campaign.scheduled_at?.trim() ? Date.parse(campaign.scheduled_at) : null;
  if (scheduledAt !== null && !Number.isFinite(scheduledAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduled_at"],
      message: "Data de agendamento da régua inválida.",
    });
  }
  if (campaign.status === "scheduled" && scheduledAt === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduled_at"],
      message: "Informe a data de agendamento para uma régua agendada.",
    });
  }
});

async function assertSuperAdmin(sb: AnySb, userId: string) {
  const { data, error } = await sb.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (error || data !== true) throw new Error("Acesso restrito ao administrador geral da Vanessa Simoni.");
}

const PageSizeSchema = z.union([z.literal(10), z.literal(20), z.literal(50)]);

function pagination(page: number, pageSize: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  return { page: safePage, pageSize, total, totalPages };
}

export const getAdminCouponsPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    page: z.number().int().min(1).max(10000).optional(),
    pageSize: PageSizeSchema.optional(),
    search: z.string().max(100).optional(),
  }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertSuperAdmin(sb, context.userId);

    const requestedPage = data.page ?? 1;
    const pageSize = data.pageSize ?? 20;
    const search = (data.search ?? "")
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

    const fetchPage = (page: number) => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = sb
        .from("coupons")
        .select("id,name,code,description,kind,value,is_active,starts_at,expires_at,max_uses,max_uses_per_customer,valid_plans,valid_periods,valid_modules,is_subscription,created_at,updated_at", { count: "exact" })
        .is("archived_at", null);
      if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,description.ilike.%${search}%`);
      return query.order("created_at", { ascending: false }).range(from, to);
    };

    let result = await fetchPage(requestedPage);
    if (result.error) throw new Error(result.error.message);
    const total = result.count ?? 0;
    const meta = pagination(requestedPage, pageSize, total);
    if (meta.page !== requestedPage) {
      result = await fetchPage(meta.page);
      if (result.error) throw new Error(result.error.message);
    }

    const coupons = result.data ?? [];
    const couponIds = coupons.map((coupon: any) => coupon.id as string);
    const statsResult = couponIds.length
      ? await sb.rpc("f06_admin_coupon_stats", { _coupon_ids: couponIds })
      : { data: [], error: null };
    if (statsResult.error) throw new Error(statsResult.error.message);

    const couponStats = (statsResult.data ?? []).map((row: any) => ({
      coupon_id: row.coupon_id as string,
      uses: Number(row.uses ?? 0),
      revenue_cents: Number(row.revenue_cents ?? 0),
      customers: Number(row.customers ?? 0),
    }));

    return { coupons, couponStats, pagination: meta };
  });

export const getAdminRulesPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    type: z.enum(["billing", "renewal"]),
    page: z.number().int().min(1).max(10000).optional(),
    pageSize: PageSizeSchema.optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertSuperAdmin(sb, context.userId);

    const requestedPage = data.page ?? 1;
    const pageSize = data.pageSize ?? 20;
    const fetchPage = (page: number) => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      return sb
        .from("internal_campaigns")
        .select("id,type,name,audience,trigger_key,message,action,status,scheduled_at,created_at", { count: "exact" })
        .eq("type", data.type)
        .order("created_at", { ascending: false })
        .range(from, to);
    };

    let result = await fetchPage(requestedPage);
    if (result.error) throw new Error(result.error.message);
    const total = result.count ?? 0;
    const meta = pagination(requestedPage, pageSize, total);
    if (meta.page !== requestedPage) {
      result = await fetchPage(meta.page);
      if (result.error) throw new Error(result.error.message);
    }

    return { campaigns: result.data ?? [], pagination: meta };
  });

export const getAdminHistoryPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    page: z.number().int().min(1).max(10000).optional(),
    pageSize: PageSizeSchema.optional(),
  }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertSuperAdmin(sb, context.userId);

    const requestedPage = data.page ?? 1;
    const pageSize = data.pageSize ?? 20;
    const fetchPage = (page: number) => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      return sb
        .from("internal_campaign_history")
        .select("id,action_type,title,result,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
    };

    let result = await fetchPage(requestedPage);
    if (result.error) throw new Error(result.error.message);
    const total = result.count ?? 0;
    const meta = pagination(requestedPage, pageSize, total);
    if (meta.page !== requestedPage) {
      result = await fetchPage(meta.page);
      if (result.error) throw new Error(result.error.message);
    }

    return { history: result.data ?? [], pagination: meta };
  });

export const saveAdminCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CouponSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertSuperAdmin(sb, context.userId);
    const payload = {
      ...data,
      code: data.code.trim().toUpperCase(),
      description: data.description || null,
      starts_at: data.starts_at || null,
      expires_at: data.expires_at || null,
      max_uses: data.max_uses ?? null,
      max_uses_per_customer: data.max_uses_per_customer ?? null,
      valid_modules: data.valid_modules || [],
    };
    const { data: savedId, error } = await sb.rpc("f06_save_admin_coupon", { _payload: payload });
    if (error || typeof savedId !== "string") {
      throw new Error(error?.message || "Não foi possível salvar o cupom com trilha de auditoria atômica.");
    }
    return { id: savedId };
  });

export const deleteAdminCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid(), code: z.string().optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertSuperAdmin(sb, context.userId);
    const { data: deleted, error } = await sb.rpc("f06_delete_admin_coupon", {
      _coupon_id: data.id,
      _coupon_code: data.code ?? null,
    });
    if (error || deleted !== true) throw new Error("Não foi possível excluir o cupom com trilha de auditoria atômica.");
    return { ok: true };
  });

export const saveInternalCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CampaignSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertSuperAdmin(sb, context.userId);
    const payload = {
      ...data,
      action: data.action || "",
      trigger_key: data.trigger_key || null,
      scheduled_at: data.scheduled_at || null,
    };
    const { data: savedId, error } = await sb.rpc("f06_save_internal_campaign", { _payload: payload });
    if (error || typeof savedId !== "string") {
      throw new Error(error?.message || "Não foi possível salvar a régua com trilha de auditoria atômica.");
    }
    return { id: savedId };
  });
