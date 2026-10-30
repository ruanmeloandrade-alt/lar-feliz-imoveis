import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MKTON_FUNNELS } from "@/config/marketon-operation";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveExistingMktonFunnel } from "@/lib/mkton-existing-funnel-resolver.server";

const MKTON_ADMIN_WORKSPACE_SLUG = "ruanandradenegocios.mkton";
const PageSizeSchema = z.union([z.literal(10), z.literal(20), z.literal(50)]);
const ListSchema = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: PageSizeSchema.default(20),
  search: z.string().trim().max(100).default(""),
});
const ReconcileSchema = z.object({ profile_id: z.string().uuid() });
const SubscriptionContingencySchema = z.object({
  workspaceId: z.string().uuid(),
  action: z.enum(["pause", "resume", "cancel_at_period_end", "end_now", "reverse_promotion"]),
  reason: z.string().trim().max(500).optional().nullable(),
  expectedUpdatedAt: z.string().datetime(),
  expectedPaymentId: z.string().uuid().optional().nullable(),
});

type AnySb = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  cpf: string | null;
  whatsapp_primary: string | null;
  whatsapp_secondary: string | null;
  country: string | null;
  niche: string | null;
  acquisition_source: string | null;
  current_workspace_id: string | null;
  created_at: string;
};

type AuthSnapshot = {
  email: string;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
};

type SignupCrmLink = {
  profile_id: string;
  lead_id: string;
  workspace_id: string;
  crm_source_id: string | null;
  crm_source_provider: string | null;
  crm_source_name: string | null;
  synced_at: string;
};

type LeadCandidate = {
  id: string;
  pipeline_id: string | null;
  stage_id: string | null;
  tags: unknown;
  custom_data: unknown;
};

type AdminPaymentRow = {
  id: string; workspace_id: string; subscription_id: string | null; plan_id: string | null; period: string | null;
  provider: string; status: string; amount_cents: number; coupon_id: string | null; extra_employees: number;
  created_at: string; paid_at: string | null; raw_response: Record<string, unknown> | null;
  coupon: { code?: string | null; name?: string | null } | null;
};
function paymentRaw(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function isExtrasOnly(value: unknown) { return paymentRaw(value).extras_only === true; }
function promotionReversedAt(value: unknown) { const raw = paymentRaw(value); return typeof raw.admin_promotion_reversed_at === "string" ? raw.admin_promotion_reversed_at : null; }
function subtractPromotionPeriod(currentPeriodEnd: string | null | undefined, period: string | null | undefined) {
  if (!currentPeriodEnd || !period) return null;
  const end = new Date(currentPeriodEnd); if (!Number.isFinite(end.getTime())) return null;
  if (period === "6m") { end.setUTCDate(end.getUTCDate() - 15); if (end.getUTCDate() > 28) return null; end.setUTCMonth(end.getUTCMonth() - 7); return end; }
  const months = period === "1m" ? 1 : period === "3m" ? 4 : period === "1y" ? 14 : null;
  if (!months || end.getUTCDate() > 28) return null; end.setUTCMonth(end.getUTCMonth() - months); return end;
}
function promotionReversalEligibility(subscription: any, promotion: AdminPaymentRow, history: AdminPaymentRow[]) {
  if (!subscription) return { ok: false, reason: "Assinatura não encontrada." };
  if (subscription.status === "paused") return { ok: false, reason: "Retome a assinatura antes de reverter promoção." };
  if (promotionReversedAt(promotion.raw_response)) return { ok: false, reason: "Promoção já revertida." };
  if (subscription.last_payment_id !== promotion.id) return { ok: false, reason: "A promoção não é mais a última ativação da assinatura." };
  if (subscription.period !== promotion.period) return { ok: false, reason: "A vigência atual já não corresponde a esta promoção." };
  const previous = history.find((row) => row.id !== promotion.id && row.created_at < promotion.created_at && !isExtrasOnly(row.raw_response) && !promotionReversedAt(row.raw_response));
  if (!previous) return { ok: false, reason: "Sem ativação anterior compatível para restaurar." };
  if (previous.plan_id !== promotion.plan_id) return { ok: false, reason: "A promoção alterou o plano; não há snapshot anterior seguro." };
  const previousEnd = subtractPromotionPeriod(subscription.current_period_end, promotion.period);
  if (!previousEnd) return { ok: false, reason: "A data atual não permite reversão automática segura." };
  const activationAt = new Date(promotion.paid_at ?? promotion.created_at).getTime();
  if (!Number.isFinite(activationAt) || previousEnd.getTime() <= activationAt) return { ok: false, reason: "A promoção iniciou nova vigência e não pode ser revertida por inferência." };
  return { ok: true, reason: null };
}

async function assertSuperAdmin(sb: AnySb, userId: string) {
  const { data, error } = await sb.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (error || data !== true) throw new Error("Acesso restrito ao administrador geral da Vanessa Simoni.");
}

function sanitizeSearch(value: string) {
  return value
    .replace(/[,%()'"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizePhone(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return "";
  if (raw.startsWith("+")) return digits.slice(0, 15);
  if (digits.startsWith("00") && digits.length >= 12) return digits.slice(2, 17);
  if (digits.startsWith("55") && digits.length >= 12) return digits.slice(0, 13);
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.slice(0, 15);
}

function normalizeInstagram(value: unknown) {
  if (typeof value !== "string") return "";
  const clean = value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "")
    .replace(/[^a-zA-Z0-9._]/g, "")
    .slice(0, 30);
  return clean ? `@${clean}` : "";
}

function tagsWithSignup(existing: unknown) {
  const tags = Array.isArray(existing) ? existing.filter((value): value is string => typeof value === "string") : [];
  return Array.from(new Set([...tags, "jornada:new-cad", "canal:cadastro-site", "origem:site"]));
}

function signupAuthUserId(customData: unknown) {
  if (!customData || typeof customData !== "object" || Array.isArray(customData)) return "";
  const signup = (customData as Record<string, unknown>).signup;
  if (!signup || typeof signup !== "object" || Array.isArray(signup)) return "";
  const value = (signup as Record<string, unknown>).auth_user_id;
  return typeof value === "string" ? value : "";
}

function leadBelongsToProfile(lead: LeadCandidate, profileId: string) {
  const claimedBy = signupAuthUserId(lead.custom_data);
  return !claimedBy || claimedBy === profileId;
}

function signupCustomData(existing: unknown, input: {
  profileId: string;
  name: string;
  whatsapp: string;
  instagram: string;
  cpf: string | null;
  country: string | null;
  niche: string | null;
}) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing)
    ? (existing as Record<string, unknown>)
    : {};
  return {
    ...base,
    signup: {
      responsible_name: input.name,
      whatsapp: input.whatsapp ? `+${input.whatsapp}` : null,
      instagram: input.instagram || null,
      auth_user_id: input.profileId,
      source: "site",
      cpf: input.cpf,
      country: input.country,
      niche: input.niche,
      synced_at: new Date().toISOString(),
    },
  };
}

async function findLeadBySignupIdentity(admin: any, workspaceId: string, profileId: string): Promise<LeadCandidate | null> {
  const { data, error } = await admin
    .from("leads")
    .select("id,pipeline_id,stage_id,tags,custom_data")
    .eq("workspace_id", workspaceId)
    .contains("custom_data", { signup: { auth_user_id: profileId } })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Não foi possível recuperar o lead vencedor da reconciliação.");
  return data ? data as LeadCandidate : null;
}

async function ensureInstagramField(admin: any, workspaceId: string) {
  const findExisting = () => admin
    .from("lead_custom_fields")
    .select("id")
    .eq("workspace_id", workspaceId)
    .ilike("name", "Instagram")
    .limit(1)
    .maybeSingle();

  const { data: existing, error } = await findExisting();
  if (error) throw new Error("Não foi possível localizar o campo Instagram no CRM administrativo.");
  if (existing?.id) return String(existing.id);

  const { data: inserted, error: insertError } = await admin
    .from("lead_custom_fields")
    .insert({ workspace_id: workspaceId, name: "Instagram", field_type: "text", options: [] })
    .select("id")
    .single();
  if (!insertError && inserted?.id) return String(inserted.id);

  const { data: recovered, error: recoveryError } = await findExisting();
  if (recoveryError || !recovered?.id) throw new Error("Não foi possível criar o campo Instagram no CRM administrativo.");
  return String(recovered.id);
}

async function setInstagramField(admin: any, input: { workspaceId: string; leadId: string; fieldId: string; value: string }) {
  const findCurrent = () => admin
    .from("lead_custom_field_values")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("lead_id", input.leadId)
    .eq("field_id", input.fieldId)
    .maybeSingle();

  const updateValue = async (id: string) => {
    const { error } = await admin
      .from("lead_custom_field_values")
      .update({ value: input.value, updated_at: new Date().toISOString() })
      .eq("workspace_id", input.workspaceId)
      .eq("id", id);
    if (error) throw new Error("Não foi possível atualizar o Instagram do lead administrativo.");
  };

  const { data: current, error } = await findCurrent();
  if (error) throw new Error("Não foi possível verificar o Instagram do lead administrativo.");
  if (current?.id) {
    await updateValue(String(current.id));
    return;
  }

  const { error: insertError } = await admin.from("lead_custom_field_values").insert({
    workspace_id: input.workspaceId,
    lead_id: input.leadId,
    field_id: input.fieldId,
    value: input.value,
  });
  if (!insertError) return;

  const { data: recovered, error: recoveryError } = await findCurrent();
  if (recoveryError || !recovered?.id) throw new Error("Não foi possível registrar o Instagram do lead administrativo.");
  await updateValue(String(recovered.id));
}

async function ensureSignupActivity(admin: any, input: {
  workspaceId: string;
  leadId: string;
  profileId: string;
  name: string;
  whatsapp: string;
  instagram: string;
}) {
  const { error } = await admin.from("lead_activities").insert({
    workspace_id: input.workspaceId,
    lead_id: input.leadId,
    type: "signup_completed",
    payload: {
      auth_user_id: input.profileId,
      responsible_name: input.name,
      whatsapp: input.whatsapp ? `+${input.whatsapp}` : null,
      instagram: input.instagram || null,
      source: "admin_recovery",
    },
  });
  if (!error) return;

  const { data: existing, error: recoveryError } = await admin
    .from("lead_activities")
    .select("lead_id")
    .eq("workspace_id", input.workspaceId)
    .eq("type", "signup_completed")
    .contains("payload", { auth_user_id: input.profileId })
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recoveryError) throw new Error("Não foi possível verificar a atividade vencedora da reconciliação.");
  if (existing?.lead_id && String(existing.lead_id) === input.leadId) return;
  throw new Error("Não foi possível registrar a reconciliação do cadastro no CRM.");
}

async function loadAuthPage(admin: any, ids: string[]): Promise<Map<string, AuthSnapshot>> {
  const result = new Map<string, AuthSnapshot>();
  const chunkSize = 10;
  for (let start = 0; start < ids.length; start += chunkSize) {
    const chunk = ids.slice(start, start + chunkSize);
    const settled = await Promise.allSettled(chunk.map((id) => admin.auth.admin.getUserById(id)));
    settled.forEach((entry, index) => {
      if (entry.status !== "fulfilled") return;
      const user = entry.value?.data?.user ?? entry.value?.user ?? null;
      if (!user) return;
      result.set(chunk[index], {
        email: user.email ?? "",
        emailConfirmed: Boolean(user.email_confirmed_at),
        lastSignInAt: user.last_sign_in_at ?? null,
      });
    });
  }
  return result;
}

export const listPlatformSignupsPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListSchema.parse(data))
  .handler(async ({ data, context }) => {
    const userClient = context.supabase as unknown as AnySb;
    await assertSuperAdmin(userClient, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const offset = data.page * data.pageSize;
    const safeSearch = sanitizeSearch(data.search);

    let profilesQuery = admin
      .from("profiles")
      .select(
        "id,full_name,display_name,cpf,whatsapp_primary,whatsapp_secondary,country,niche,acquisition_source,current_workspace_id,created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (safeSearch) {
      const pattern = `%${safeSearch}%`;
      profilesQuery = profilesQuery.or(
        [
          `full_name.ilike.${pattern}`,
          `display_name.ilike.${pattern}`,
          `country.ilike.${pattern}`,
          `niche.ilike.${pattern}`,
          `whatsapp_primary.ilike.${pattern}`,
        ].join(","),
      );
    }

    const { data: profiles, count, error: profilesError } = await profilesQuery.range(
      offset,
      offset + data.pageSize - 1,
    );
    if (profilesError) throw new Error("Não foi possível carregar os cadastros da plataforma.");

    const list = (profiles ?? []) as ProfileRow[];
    const total = count ?? 0;
    if (list.length === 0) {
      return {
        signups: [],
        pagination: pageMeta(data.page, data.pageSize, total),
      };
    }

    const ids = list.map((profile) => profile.id);
    const workspaceIds = Array.from(
      new Set(list.map((profile) => profile.current_workspace_id).filter(Boolean)),
    ) as string[];

    const [authMap, workspacesResult, subscriptionsResult, crmLinksResult, paymentsResult] = await Promise.all([
      loadAuthPage(admin, ids),
      workspaceIds.length
        ? admin.from("workspaces").select("id,name,slug").in("id", workspaceIds)
        : Promise.resolve({ data: [], error: null }),
      workspaceIds.length
        ? admin
            .from("subscriptions")
            .select("id,workspace_id,status,plan_id,period,trial_ends_at,started_at,current_period_end,extra_employees,last_payment_id,updated_at,admin_paused_previous_status,admin_paused_at,admin_pause_reason,created_at")
            .in("workspace_id", workspaceIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      userClient.rpc("f06_admin_signup_crm_links", { _profile_ids: ids }),
      workspaceIds.length
        ? admin.from("payments")
            .select("id,workspace_id,subscription_id,plan_id,period,provider,status,amount_cents,coupon_id,extra_employees,created_at,paid_at,raw_response,coupon:coupons(code,name)")
            .in("workspace_id", workspaceIds).in("provider", ["internal", "stripe"]).eq("status", "paid")
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (workspacesResult.error) throw new Error("Não foi possível relacionar os workspaces aos cadastros.");
    if (subscriptionsResult.error) throw new Error("Não foi possível relacionar as assinaturas aos cadastros.");
    if (crmLinksResult.error) throw new Error("Não foi possível relacionar os cadastros ao CRM administrativo.");
    if (paymentsResult.error) throw new Error("Não foi possível carregar o histórico promocional das assinaturas.");

    const workspaceMap = new Map<string, { id: string; name: string; slug: string }>(
      (workspacesResult.data ?? []).map((workspace: any) => [workspace.id, workspace]),
    );

    const subscriptionMap = new Map<string, any>();
    for (const subscription of subscriptionsResult.data ?? []) {
      if (!subscriptionMap.has(subscription.workspace_id)) {
        subscriptionMap.set(subscription.workspace_id, subscription);
      }
    }

    const planIds = Array.from(
      new Set(Array.from(subscriptionMap.values()).map((subscription) => subscription.plan_id).filter(Boolean)),
    ) as string[];
    const plansResult = planIds.length
      ? await admin.from("plans").select("id,code,name").in("id", planIds)
      : { data: [], error: null };
    if (plansResult.error) throw new Error("Não foi possível relacionar os planos aos cadastros.");
    const planMap = new Map<string, { id: string; code: string; name: string }>(
      (plansResult.data ?? []).map((plan: any) => [plan.id, plan]),
    );

    const crmLinkMap = new Map<string, SignupCrmLink>(
      ((crmLinksResult.data ?? []) as SignupCrmLink[]).map((link) => [link.profile_id, link]),
    );
    const paymentHistoryMap = new Map<string, AdminPaymentRow[]>();
    for (const rawPayment of (paymentsResult.data ?? []) as AdminPaymentRow[]) {
      if (isExtrasOnly(rawPayment.raw_response)) continue;
      const history = paymentHistoryMap.get(rawPayment.workspace_id) ?? [];
      history.push(rawPayment); paymentHistoryMap.set(rawPayment.workspace_id, history);
    }

    const signups = list.map((profile) => {
      const auth = authMap.get(profile.id);
      const workspace = profile.current_workspace_id
        ? workspaceMap.get(profile.current_workspace_id) ?? null
        : null;
      const subscription = profile.current_workspace_id
        ? subscriptionMap.get(profile.current_workspace_id) ?? null
        : null;
      const plan = subscription?.plan_id ? planMap.get(subscription.plan_id) ?? null : null;
      const crmLink = crmLinkMap.get(profile.id) ?? null;
      const paymentHistory = profile.current_workspace_id ? paymentHistoryMap.get(profile.current_workspace_id) ?? [] : [];
      const promotionRows = paymentHistory.filter((payment) => payment.provider === "internal" && payment.amount_cents === 0 && Boolean(payment.coupon_id)).slice(0, 5);
      const latestNonReversed = promotionRows.find((payment) => !promotionReversedAt(payment.raw_response)) ?? null;
      const promotions = promotionRows.map((payment) => {
        const reversedAt = promotionReversedAt(payment.raw_response);
        const eligibility = payment.id === latestNonReversed?.id ? promotionReversalEligibility(subscription, payment, paymentHistory) : { ok: false, reason: reversedAt ? "Promoção já revertida." : "Somente a promoção não revertida mais recente pode ser desfeita." };
        return { id: payment.id, period: payment.period, created_at: payment.created_at, paid_at: payment.paid_at, coupon_code: payment.coupon?.code ?? null, coupon_name: payment.coupon?.name ?? null, reversed_at: reversedAt, is_reversible: eligibility.ok, reversible_reason: eligibility.reason };
      });

      return {
        id: profile.id,
        full_name: profile.full_name ?? profile.display_name ?? "Cadastro sem nome",
        email: auth?.email ?? "",
        email_confirmed: auth?.emailConfirmed ?? false,
        last_sign_in_at: auth?.lastSignInAt ?? null,
        cpf: profile.cpf,
        whatsapp_primary: profile.whatsapp_primary,
        whatsapp_secondary: profile.whatsapp_secondary,
        country: profile.country,
        niche: profile.niche,
        acquisition_source: profile.acquisition_source,
        created_at: profile.created_at,
        workspace,
        subscription: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              period: subscription.period,
              trial_ends_at: subscription.trial_ends_at,
              started_at: subscription.started_at,
              current_period_end: subscription.current_period_end,
              extra_employees: subscription.extra_employees,
              last_payment_id: subscription.last_payment_id,
              updated_at: subscription.updated_at,
              paused_previous_status: subscription.admin_paused_previous_status,
              paused_at: subscription.admin_paused_at,
              pause_reason: subscription.admin_pause_reason,
              plan: plan ? { code: plan.code, name: plan.name } : null,
            }
          : null,
        promotions,
        lead_id: crmLink?.lead_id ?? null,
        crm_synced_at: crmLink?.synced_at ?? null,
        crm_source: crmLink
          ? {
              provider: crmLink.crm_source_provider ?? "mkton",
              name: crmLink.crm_source_name ?? crmLink.crm_source_provider ?? "MKTOn",
            }
          : null,
      };
    });

    return {
      signups,
      pagination: pageMeta(data.page, data.pageSize, total),
    };
  });

export const managePlatformSubscriptionContingency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SubscriptionContingencySchema.parse(data))
  .handler(async ({ data, context }) => {
    const userClient = context.supabase as unknown as AnySb;
    await assertSuperAdmin(userClient, context.userId);
    const reason = data.reason?.trim() || null;
    if ((data.action === "end_now" || data.action === "reverse_promotion") && !reason) throw new Error("Informe o motivo para esta ação administrativa.");
    const { data: result, error } = await userClient.rpc("admin_manage_subscription_contingency_v1", {
      _workspace_id: data.workspaceId, _action: data.action, _reason: reason,
      _expected_updated_at: data.expectedUpdatedAt, _expected_payment_id: data.expectedPaymentId ?? null,
    });
    if (error) throw new Error(error.message ?? "Não foi possível alterar a assinatura.");
    return result as Record<string, unknown>;
  });

export const reconcilePlatformSignupToCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ReconcileSchema.parse(data))
  .handler(async ({ data, context }) => {
    const userClient = context.supabase as unknown as AnySb;
    await assertSuperAdmin(userClient, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: workspace, error: workspaceError } = await admin
      .from("workspaces")
      .select("id")
      .eq("slug", MKTON_ADMIN_WORKSPACE_SLUG)
      .maybeSingle();
    if (workspaceError || !workspace?.id) throw new Error("Workspace administrativo Vanessa Simoni não encontrado.");
    const workspaceId = String(workspace.id);

    const { data: previousActivities, error: previousActivityError } = await admin
      .from("lead_activities")
      .select("lead_id,occurred_at")
      .eq("workspace_id", workspaceId)
      .eq("type", "signup_completed")
      .contains("payload", { auth_user_id: data.profile_id })
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (previousActivityError) throw new Error("Não foi possível verificar o vínculo CRM existente.");

    const previousLeadId = previousActivities?.[0]?.lead_id ? String(previousActivities[0].lead_id) : null;
    if (previousLeadId) {
      const { data: linkedLead, error: linkedLeadError } = await admin
        .from("leads")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("id", previousLeadId)
        .maybeSingle();
      if (linkedLeadError) throw new Error("Não foi possível validar o lead já sincronizado.");
      if (linkedLead?.id) return { ok: true, leadId: String(linkedLead.id), created: false, moved: false, alreadyLinked: true };
    }

    const [{ data: profile, error: profileError }, authResult] = await Promise.all([
      admin
        .from("profiles")
        .select("id,full_name,display_name,cpf,whatsapp_primary,country,niche")
        .eq("id", data.profile_id)
        .maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(data.profile_id),
    ]);
    if (authResult.error) throw new Error("Não foi possível carregar a identidade autenticada do cadastro.");
    const authUser = authResult.data?.user ?? null;
    if (profileError || !profile || !authUser?.email) throw new Error("Cadastro não encontrado ou sem identidade verificável.");

    const registrationSpec = MKTON_FUNNELS.find((item) => item.key === "registration");
    const leadEntrySpec = MKTON_FUNNELS.find((item) => item.key === "lead_entry");
    if (!registrationSpec || !leadEntrySpec) throw new Error("Configuração operacional do CRM Vanessa Simoni não encontrada.");

    const [registration, leadEntry] = await Promise.all([
      resolveExistingMktonFunnel(admin, workspaceId, registrationSpec.name, registrationSpec.stages),
      resolveExistingMktonFunnel(admin, workspaceId, leadEntrySpec.name, leadEntrySpec.stages),
    ]);
    const newCad = registration.stages.find((stage) => normalize(stage.name) === normalize("New Cad"));
    if (!newCad) throw new Error("Etapa New Cad não encontrada no funil de Cadastros Vanessa Simoni.");

    const { data: sources, error: sourceError } = await admin
      .from("crm_sources")
      .select("id,is_default")
      .eq("workspace_id", workspaceId)
      .order("is_default", { ascending: false })
      .limit(1);
    if (sourceError || !sources?.[0]?.id) throw new Error("Fonte CRM Vanessa Simoni não encontrada.");
    const crmSourceId = String(sources[0].id);

    const email = String(authUser.email).trim().toLowerCase();
    const metadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
    const phoneNormalized = normalizePhone((profile as any).whatsapp_primary ?? String(metadata.whatsapp ?? ""));
    const name = String((profile as any).full_name || (profile as any).display_name || metadata.responsible_name || metadata.full_name || email).trim();
    const instagram = normalizeInstagram(metadata.instagram);

    const selectLead = "id,pipeline_id,stage_id,tags,custom_data";
    const { data: emailCandidates, error: emailError } = await admin
      .from("leads")
      .select(selectLead)
      .eq("workspace_id", workspaceId)
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(5);
    if (emailError) throw new Error("Não foi possível verificar leads existentes pelo e-mail.");

    let candidates = ((emailCandidates ?? []) as LeadCandidate[])
      .filter((lead) => leadBelongsToProfile(lead, data.profile_id));
    if (candidates.length === 0 && phoneNormalized) {
      const { data: phoneCandidates, error: phoneError } = await admin
        .from("leads")
        .select(selectLead)
        .eq("workspace_id", workspaceId)
        .eq("phone_normalized", phoneNormalized)
        .order("created_at", { ascending: false })
        .limit(5);
      if (phoneError) throw new Error("Não foi possível verificar leads existentes pelo WhatsApp.");
      candidates = ((phoneCandidates ?? []) as LeadCandidate[])
        .filter((lead) => leadBelongsToProfile(lead, data.profile_id));
    }

    const registrationId = String(registration.id);
    const leadEntryId = String(leadEntry.id);
    let existing =
      candidates.find((lead) => lead.pipeline_id === registrationId) ??
      candidates.find((lead) => lead.pipeline_id === leadEntryId) ??
      candidates[0] ??
      null;

    const now = new Date().toISOString();
    const commonPayload = {
      name,
      email,
      phone: phoneNormalized ? `+${phoneNormalized}` : null,
      phone_normalized: phoneNormalized || null,
      source: "site_signup",
      updated_at: now,
    };

    let leadId: string;
    let created = false;
    let moved = false;
    let fromStageId: string | null = null;

    if (!existing) {
      const { data: inserted, error: insertError } = await admin
        .from("leads")
        .insert({
          workspace_id: workspaceId,
          crm_source_id: crmSourceId,
          pipeline_id: registrationId,
          stage_id: String(newCad.id),
          ...commonPayload,
          tags: tagsWithSignup([]),
          custom_data: signupCustomData({}, {
            profileId: data.profile_id,
            name,
            whatsapp: phoneNormalized,
            instagram,
            cpf: (profile as any).cpf ?? null,
            country: (profile as any).country ?? null,
            niche: (profile as any).niche ?? null,
          }),
        })
        .select("id")
        .single();

      if (!insertError && inserted?.id) {
        leadId = String(inserted.id);
        created = true;
      } else {
        existing = await findLeadBySignupIdentity(admin, workspaceId, data.profile_id);
        if (!existing) throw new Error("Não foi possível criar o lead administrativo.");
        leadId = existing.id;
      }
    } else {
      leadId = existing.id;
    }

    if (!created && existing) {
      const shouldMove = !existing.pipeline_id || existing.pipeline_id === leadEntryId;
      const { error: updateError } = await admin
        .from("leads")
        .update({
          ...commonPayload,
          tags: tagsWithSignup(existing.tags),
          custom_data: signupCustomData(existing.custom_data, {
            profileId: data.profile_id,
            name,
            whatsapp: phoneNormalized,
            instagram,
            cpf: (profile as any).cpf ?? null,
            country: (profile as any).country ?? null,
            niche: (profile as any).niche ?? null,
          }),
          ...(shouldMove ? { pipeline_id: registrationId, stage_id: String(newCad.id) } : {}),
        })
        .eq("workspace_id", workspaceId)
        .eq("id", leadId);
      if (updateError) throw new Error("Não foi possível atualizar o lead administrativo sem violar a identidade do cadastro.");
      if (shouldMove) {
        moved = true;
        fromStageId = existing.stage_id;
      }
    }

    let instagramFieldId: string | null = null;
    if (instagram) {
      instagramFieldId = await ensureInstagramField(admin, workspaceId);
      await setInstagramField(admin, { workspaceId, leadId, fieldId: instagramFieldId, value: instagram });
    }

    await ensureSignupActivity(admin, {
      workspaceId,
      leadId,
      profileId: data.profile_id,
      name,
      whatsapp: phoneNormalized,
      instagram,
    });

    const { dispatchCrmLeadCreated, dispatchCrmStageMoved, dispatchCrmFieldUpdated } = await import("@/lib/crm-event-dispatch.server");
    if (created) {
      await dispatchCrmLeadCreated(supabaseAdmin as never, {
        workspaceId,
        leadId,
        pipelineId: registrationId,
        stageId: String(newCad.id),
      });
      await dispatchCrmStageMoved(supabaseAdmin as never, {
        workspaceId,
        leadId,
        newStageId: String(newCad.id),
        newPipelineId: registrationId,
        fromStageId: null,
      });
    } else if (moved) {
      await dispatchCrmStageMoved(supabaseAdmin as never, {
        workspaceId,
        leadId,
        newStageId: String(newCad.id),
        newPipelineId: registrationId,
        fromStageId,
      });
    }
    if (instagramFieldId) {
      await dispatchCrmFieldUpdated(supabaseAdmin as never, {
        workspaceId,
        leadId,
        fieldId: instagramFieldId,
        fieldName: "Instagram",
      });
    }

    return { ok: true, leadId, created, moved, alreadyLinked: false };
  });

function pageMeta(page: number, pageSize: 10 | 20 | 50, total: number) {
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
