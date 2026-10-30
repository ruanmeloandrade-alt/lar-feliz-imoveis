import { createFileRoute } from "@tanstack/react-router";

const VALID_ROLES = new Set(["affiliate", "partner"]);
const VALID_EXPERIENCE = new Set(["iniciante", "intermediario", "avancado", "especialista"]);
const VALID_PERSON_TYPES = new Set(["pf", "pj"]);
type ProgramRole = "affiliate" | "partner";

function normalizeRole(value: unknown): ProgramRole | null {
  const role = String(value ?? "").trim().toLowerCase();
  return VALID_ROLES.has(role) ? (role as ProgramRole) : null;
}
function normalizeReferralBase(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "mkton";
}
function buildReferralCode(name: string, userId: string, role: ProgramRole) {
  return `${normalizeReferralBase(name)}-${role === "affiliate" ? "a" : "p"}-${userId.replace(/-/g, "").slice(0, 8)}`;
}

export const Route = createFileRoute("/api/public/partners/register")({
  server: { handlers: { POST: async ({ request }) => {
    const body = (await request.json().catch(() => null)) as {
      name?: string; email?: string; password?: string; whatsapp?: string; instagram?: string; experience?: string;
      personType?: string; channel?: string; audience?: string; role?: string;
    } | null;
    const name = body?.name?.trim() ?? "";
    const email = body?.email?.trim().toLowerCase() ?? "";
    const password = body?.password ?? "";
    const whatsapp = body?.whatsapp?.trim() ?? "";
    const instagram = body?.instagram?.trim().replace(/^@+/, "") ?? "";
    const experience = body?.experience?.trim().toLowerCase() ?? "";
    const personType = body?.personType?.trim().toLowerCase() ?? "";
    const channel = body?.channel?.trim() ?? "";
    const audience = body?.audience?.trim() ?? "";
    const role = normalizeRole(body?.role ?? "affiliate");

    if (!name || !email || !email.includes("@") || password.length < 8 || !whatsapp || !role || !VALID_EXPERIENCE.has(experience) || !VALID_PERSON_TYPES.has(personType)) {
      return Response.json({ ok: false, error: "Preencha os dados obrigatórios. A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
    }
    if (name.length > 160 || email.length > 320 || password.length > 128 || whatsapp.length > 40 || instagram.length > 120 || channel.length > 160 || audience.length > 2000) {
      return Response.json({ ok: false, error: "Dados de cadastro inválidos." }, { status: 400 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        partner_program_role: role,
        whatsapp,
        instagram_handle: instagram || null,
        experience_level: experience,
        person_type: personType,
        acquisition_channel: channel,
        audience_description: audience,
        partner_access_created_immediately: true,
      },
    });

    if (error) {
      if (/already|registered|exists/i.test(error.message ?? "")) {
        return Response.json({ ok: false, error: "Já existe uma conta com este e-mail. Entre com sua senha ou recupere o acesso." }, { status: 409 });
      }
      console.error("[partners-register] createUser", error.message);
      return Response.json({ ok: false, error: "Não foi possível criar sua conta agora." }, { status: 500 });
    }

    const userId = data.user?.id;
    if (!userId) return Response.json({ ok: false, error: "Não foi possível preparar sua conta agora." }, { status: 500 });
    const referralCode = buildReferralCode(name, userId, role);
    const roleStatus = "pending" as const;

    const results = await Promise.all([
      admin.from("partner_program_profiles").upsert({
        user_id: userId,
        display_name: name,
        whatsapp: whatsapp || null,
        instagram_handle: instagram || null,
        experience_level: experience,
        person_type: personType,
        acquisition_channel: channel || null,
        audience_description: audience || null,
        referral_code: referralCode,
      }),
      admin.from("partner_program_roles").upsert({ user_id: userId, role, status: roleStatus, approved_at: null, approved_by: null }, { onConflict: "user_id,role" }),
      admin.from("partner_program_referral_codes").upsert({ user_id: userId, role, code: referralCode, active: false }, { onConflict: "user_id,role" }),
      role === "partner" ? admin.from("partner_program_partner_profiles").upsert({ user_id: userId }) : Promise.resolve({ error: null }),
    ]);
    const provisioningError = results.find((result: any) => result?.error)?.error;
    if (provisioningError) {
      console.error("[partners-register] provisioning", provisioningError.message);
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
      return Response.json({ ok: false, error: "Não foi possível preparar sua conta agora." }, { status: 500 });
    }

    await admin.from("partner_program_audit_log").insert({
      actor_user_id: null,
      subject_user_id: userId,
      entity_type: "program_role",
      entity_id: role,
      action: "created_from_public_registration",
      after_data: {
        role,
        status: roleStatus,
        referral_code: referralCode,
        referral_active: false,
        immediate_platform_access: true,
        commercial_approval_required: true,
        experience_level: experience,
        person_type: personType,
      },
    });

    return Response.json({
      ok: true,
      immediateAccess: true,
      verificationRequired: false,
      message: "Conta criada. Entrando na sua área...",
    });
  } } },
});
