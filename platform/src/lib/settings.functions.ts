// SLIM_AUDIENCE_OPERATIONS_V1
import { assertSettingsRow, validateSlimBusinessHours, validateEmployeeSetup } from "@/lib/slim-settings-validation.core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";
import { SLIM_INVITATION_WORKSPACE_ID } from "@/lib/slim-invitations.core";
import { readSlimInvitations, withSlimInvitationRequest } from "@/lib/slim-invitations.server";
import { changeSlimInvitation, previewSlimInvitation, acceptSlimInvitation } from "@/lib/slim-invitations.functions";
// SLIM_INVITATIONS_EXPLICIT_ACCESS_V1: legacy names share the reviewed server contract.

type AnySb = { from: (t: string) => any; rpc: (fn: string, args?: any) => any };

async function activeWorkspace(sb: AnySb, userId: string): Promise<string> {
  return requireActiveWorkspace(sb as never, userId);
}

async function isOwner(sb: AnySb, userId: string, wsId: string): Promise<boolean> {
  const { data: workspace, error: workspaceError } = await sb
    .from("workspaces")
    .select("owner_id")
    .eq("id", wsId)
    .maybeSingle();
  if (workspaceError) throw new Error(workspaceError.message);
  if ((workspace as { owner_id?: string | null } | null)?.owner_id === userId) return true;

  const { data, error } = await sb
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", wsId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { role?: string } | null)?.role === "owner";
}

async function canManageRegionalSettings(sb: AnySb, userId: string, wsId: string): Promise<boolean> {
  if (await isOwner(sb, userId, wsId)) return true;

  const { data, error } = await sb
    .from("workspace_members")
    .select("role, role_type")
    .eq("workspace_id", wsId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const membership = data as { role?: string | null; role_type?: string | null } | null;
  return membership?.role === "admin"
    || membership?.role_type === "admin"
    || membership?.role_type === "owner";
}

async function requireMember(sb: AnySb, wsId: string, userId: string) {
  const { data, error } = await sb
    .from("workspace_members")
    .select("user_id, role, role_type")
    .eq("workspace_id", wsId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Usuário não pertence ao workspace ativo.");
  return data as { user_id: string; role?: string | null; role_type?: string | null };
}

async function requireSector(sb: AnySb, wsId: string, sectorId: string) {
  const { data, error } = await sb
    .from("workflow_sectors")
    .select("id")
    .eq("workspace_id", wsId)
    .eq("id", sectorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Setor não pertence ao workspace ativo.");
  return data as { id: string };
}

/* ---------- Bundle ---------- */

export const getSettingsBundle = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const userId = context.userId;
    const { data: profile } = await sb
      .from("profiles")
      .select("id, display_name, full_name, cpf, whatsapp_primary, whatsapp_secondary, birth_date, job_title, internal_notes, notification_prefs, current_workspace_id")
      .eq("id", userId)
      .maybeSingle();
    const wsId = await activeWorkspace(sb, userId);

    const { data: ws } = await sb
      .from("workspaces")
      .select(
        "id, name, slug, owner_id, default_currency, business_hours, site_url, legal_name, cnpj, logo_path, phone, contact_email, industry, description, instagram_handle, legal_representative, address_zip, address_street, address_number, address_complement, address_district, address_city, address_state, address_country",
      )
      .eq("id", wsId)
      .maybeSingle();
    let wsWithLogo: any = ws;
    if ((ws as any)?.logo_path) {
      const { data: signed } = await (sb as any).storage
        .from("company-logos")
        .createSignedUrl((ws as any).logo_path, 60 * 60 * 24 * 7);
      wsWithLogo = { ...(ws as any), logo_url: signed?.signedUrl ?? null };
    }

    const ownerFlag = await isOwner(sb, userId, wsId);
    const regionalSettingsFlag = await canManageRegionalSettings(sb, userId, wsId);

    const { data: members } = await sb
      .from("workspace_members")
      .select("user_id, role, role_type, is_partner, access_expires_at, created_at")
      .eq("workspace_id", wsId);

    const memberIds = ((members ?? []) as any[]).map((m) => m.user_id);
    let memberProfiles: any[] = [];
    if (memberIds.length) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id, display_name, full_name")
        .in("id", memberIds);
      memberProfiles = (profs ?? []) as any[];
    }

    const canManageInvitations = wsId === SLIM_INVITATION_WORKSPACE_ID && (ws as any)?.owner_id === userId;
    const invitations = canManageInvitations
      ? await withSlimInvitationRequest(signal => readSlimInvitations(sb, wsId, signal))
      : [];

    return {
      actorId: userId,
      workspaceId: wsId,
      profile,
      workspace: wsWithLogo,
      isOwner: ownerFlag,
      canManageRegionalSettings: regionalSettingsFlag,
      canManageInvitations,
      members: ((members ?? []) as any[]).map((m) => ({
        ...m,
        profile: memberProfiles.find((p) => p.id === m.user_id) || null,
      })),
      invitations,
    };
  });

/* ---------- Perfil ---------- */

const ProfileSchema = z.object({
  display_name: z.string().min(1).max(120).optional(),
  full_name: z.string().max(160).optional().nullable(),
  whatsapp_primary: z.string().max(40).optional().nullable(),
  whatsapp_secondary: z.string().max(40).optional().nullable(),
  phone_alt: z.string().max(40).optional().nullable(),
  preferred_contact: z.string().max(20).optional().nullable(),
  birth_date: z.string().optional().nullable(),
  job_title: z.string().max(120).optional().nullable(),
  role_in_company: z.string().max(120).optional().nullable(),
  company_name: z.string().max(160).optional().nullable(),
  company_size: z.string().max(40).optional().nullable(),
  niche: z.string().max(120).optional().nullable(),
  instagram_handle: z.string().max(80).optional().nullable(),
  website_url: z.string().max(240).optional().nullable(),
  linkedin_url: z.string().max(240).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(80).optional().nullable(),
  country: z.string().max(80).optional().nullable(),
  bio: z.string().max(600).optional().nullable(),
  internal_notes: z.string().max(2000).optional().nullable(),
});

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => ProfileSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (k === "display_name" && (v === "" || v === null)) continue;
      payload[k] = v === "" ? null : v;
    }

    const { data: changed, error } = await sb.from("profiles").update(payload).eq("id", context.userId).select("id").maybeSingle();
    assertSettingsRow({data:changed,error},"salvar o perfil");
    return { ok: true };
  });

const NotifSchema = z.object({
  email: z.boolean(),
  whatsapp: z.boolean(),
  platform: z.boolean(),
  commercial: z.boolean(),
});

export const updateNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => NotifSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { data: changed, error } = await sb.from("profiles").update({ notification_prefs: data }).eq("id", context.userId).select("id").maybeSingle();
    assertSettingsRow({data:changed,error},"salvar as preferências");
    return { ok: true };
  });

/* ---------- Empresa / Workspace ---------- */

const WsSchema = z.object({
  name: z.string().min(1).max(160),
  legal_name: z.string().max(200).optional().nullable(),
  cnpj: z.string().max(24).optional().nullable(),
  logo_path: z.string().max(400).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  contact_email: z.string().max(200).optional().nullable(),
  site_url: z.string().max(240).optional().nullable(),
  instagram_handle: z.string().max(80).optional().nullable(),
  industry: z.string().max(120).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  legal_representative: z.string().max(160).optional().nullable(),
  address_zip: z.string().max(20).optional().nullable(),
  address_street: z.string().max(200).optional().nullable(),
  address_number: z.string().max(20).optional().nullable(),
  address_complement: z.string().max(120).optional().nullable(),
  address_district: z.string().max(120).optional().nullable(),
  address_city: z.string().max(120).optional().nullable(),
  address_state: z.string().max(80).optional().nullable(),
  address_country: z.string().max(80).optional().nullable(),
});

const LogoSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  base64: z.string().min(1).max(8_000_000),
});

export const uploadWorkspaceLogo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => LogoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    if (!(await isOwner(sb, context.userId, wsId))) throw new Error("Apenas o dono pode editar a empresa.");
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(data.contentType)) throw new Error("Formato de imagem inválido.");
    const ext = (data.filename.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "png";
    const objectPath = `${wsId}/workspace-${Date.now()}.${ext}`;
    const buf = Buffer.from(data.base64, "base64");
    const { error } = await (sb as any).storage.from("company-logos").upload(objectPath, buf, {
      contentType: data.contentType,
      upsert: true,
    });
    if (error) throw new Error(error.message);
    const { data: signed } = await (sb as any).storage
      .from("company-logos")
      .createSignedUrl(objectPath, 60 * 60 * 24 * 7);
    return { path: objectPath, url: (signed?.signedUrl as string | undefined) ?? null };
  });

export const updateWorkspace = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => WsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    if (!(await isOwner(sb, context.userId, wsId))) throw new Error("Apenas o dono pode editar a empresa.");
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (k === "name" && (v === "" || v === null)) continue;
      payload[k] = v === "" ? null : v;
    }
    const { data: changed, error } = await sb.from("workspaces").update(payload).eq("id", wsId).select("id").maybeSingle();
    assertSettingsRow({data:changed,error},"salvar a empresa");
    return { ok: true };
  });

/* ---------- Expediente / Horário comercial ---------- */

const BHDaySchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});
const BusinessHoursSchema = z.object({
  timezone: z.string().min(1).max(60),
  days: z.array(BHDaySchema).length(7),
});

export const updateBusinessHours = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => validateSlimBusinessHours(BusinessHoursSchema.parse(d)))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    if (!(await canManageRegionalSettings(sb, context.userId, wsId))) {
      throw new Error("Você não tem permissão administrativa para editar o expediente.");
    }
    const { data: changed, error } = await sb.from("workspaces").update({ business_hours: data }).eq("id", wsId).select("id").maybeSingle();
    assertSettingsRow({data:changed,error},"salvar o expediente");
    return { ok: true };
  });

/* ---------- Equipe / Convites ---------- */

export const inviteMember = changeSlimInvitation;

/* ---------- Criar funcionário direto (sem confirmação por e-mail) ---------- */

const CreateEmployeeSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
  full_name: z.string().min(2).max(120),
  role_type: z.enum(["admin", "gestor", "funcionario", "vendedor", "visualizador"]),
  modules: z.array(z.string()).default([]),
  sector_id: z.string().uuid().nullish(),
  sector_name: z.string().min(2).max(60).nullish(),
});

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateEmployeeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    if (!(await isOwner(sb, context.userId, wsId))) throw new Error("Apenas o dono pode criar funcionários.");

    validateEmployeeSetup(data);
    if(data.sector_id) await requireSector(sb,wsId,data.sector_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      auth: { admin: { createUser: (a: any) => Promise<any>; listUsers: (a?: any) => Promise<any> } };
      from: (t: string) => any;
    };

    const emailNorm = data.email.trim().toLowerCase();
    let userId: string | null = null;
    let reusedExistingUser = false;

    const created = await admin.auth.admin.createUser({
      email: emailNorm,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, display_name: data.full_name },
    });
    if (created.error) {
      const msg = String(created.error.message || "");
      if (/already|registered|exists/i.test(msg)) {
        // Um e-mail representa uma única identidade Auth, que pode participar de vários workspaces.
        let found: any = null;
        for (let page = 1; page <= 100 && !found; page += 1) {
          const { data: list, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (listError) throw new Error(listError.message ?? "Falha ao localizar usuário existente.");
          const users = list?.users ?? [];
          found = users.find((u: any) => (u.email ?? "").toLowerCase() === emailNorm) ?? null;
          if (users.length < 1000) break;
        }
        if (!found) throw new Error("O e-mail já existe no Auth, mas não foi possível localizar o usuário para vinculá-lo a esta conta.");
        userId = found.id;
        reusedExistingUser = true;
      } else {
        throw new Error(msg || "Falha ao criar usuário.");
      }
    } else {
      userId = created.data?.user?.id ?? null;
    }
    if (!userId) throw new Error("Falha ao criar usuário.");

    // Não sobrescreve nome, senha ou identidade de quem já usa a MKTOn em outra conta.
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (!existingProfile) {
      const { error: profileErr } = await admin
        .from("profiles")
        .insert({ id: userId, display_name: data.full_name, full_name: data.full_name });
      if (profileErr) throw new Error(profileErr.message);
    }

    // O mesmo usuário pode pertencer a vários workspaces. O isolamento continua
    // sendo feito por workspace_id em cada membership, permissão e dado operacional.
    // Adiciona ao workspace atual
    const { error: memErr } = await admin.from("workspace_members").upsert({
      workspace_id: wsId,
      user_id: userId,
      role: data.role_type === "admin" || data.role_type === "gestor" ? "admin" : "member",
      role_type: data.role_type,
      is_partner: false,
    }, { onConflict: "workspace_id,user_id" });
    if (memErr) throw new Error(memErr.message);

    if (data.modules.length > 0) {
      await admin.from("module_permissions").upsert({
        workspace_id: wsId, user_id: userId, modules: data.modules,
      }, { onConflict: "workspace_id,user_id" });
    }

    // Setor de trabalho (obrigatório): usa o existente ou cria o primeiro
    let sectorId = data.sector_id ?? null;
    if (sectorId) await requireSector(sb, wsId, sectorId);
    if (!sectorId && data.sector_name) {
      const { data: created2, error: secErr } = await admin
        .from("workflow_sectors")
        .upsert({ workspace_id: wsId, name: data.sector_name.trim() }, { onConflict: "workspace_id,name" })
        .select("id")
        .maybeSingle();
      if (secErr) throw new Error(secErr.message);
      sectorId = (created2 as any)?.id ?? null;
    }
    if (!sectorId) throw new Error("Defina o setor de trabalho do usuário.");
    await admin.from("workflow_sector_members").upsert(
      { workspace_id: wsId, sector_id: sectorId, user_id: userId },
      { onConflict: "sector_id,user_id" },
    );

    // Modelo padrão do setor: já entrega o usuário com as permissões certas
    const { data: sectorTpl } = await admin
      .from("permission_templates")
      .select("permissions")
      .eq("workspace_id", wsId)
      .eq("sector_id", sectorId)
      .maybeSingle();
    if ((sectorTpl as any)?.permissions) {
      await admin.from("user_permissions").upsert(
        {
          workspace_id: wsId,
          user_id: userId,
          permissions: (sectorTpl as any).permissions,
          updated_by: context.userId,
        },
        { onConflict: "workspace_id,user_id" },
      );
    }

    // A identidade nova entra na empresa contratante; a reutilizada mantém sua escolha.
    const { selectSlimEmployeeWorkspace } = await import("@/lib/slim-employee-workspace.server");
    await selectSlimEmployeeWorkspace(admin, { workspaceId: wsId, userId, reusedExistingUser });

    return { ok: true, userId, reusedExistingUser };
  });

const InvIdSchema = z.object({ id: z.string().uuid() });

export const revokeInvitation = changeSlimInvitation;

export const resendInvitation = changeSlimInvitation;

const RemoveSchema = z.object({ userId: z.string().uuid() });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => RemoveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    if (!(await isOwner(sb, context.userId, wsId))) throw new Error("Apenas o dono pode remover.");
    if (data.userId === context.userId) throw new Error("Você não pode remover a si mesmo.");
    const target = await requireMember(sb, wsId, data.userId);
    if (target.role === "owner") throw new Error("O dono do workspace não pode ser removido.");
    const { error } = await sb
      .from("workspace_members")
      .delete()
      .eq("workspace_id", wsId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RoleSchema = z.object({
  userId: z.string().uuid(),
  role_type: z.enum(["admin", "gestor", "funcionario", "vendedor", "visualizador", "parceiro"]),
});

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => RoleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    if (!(await isOwner(sb, context.userId, wsId))) throw new Error("Apenas o dono pode mudar papéis.");
    const target = await requireMember(sb, wsId, data.userId);
    if (target.role === "owner") throw new Error("O papel do dono do workspace não pode ser alterado.");
    const { error } = await sb
      .from("workspace_members")
      .update({
        role_type: data.role_type,
        role: data.role_type === "admin" || data.role_type === "gestor" ? "admin" : "member",
      })
      .eq("workspace_id", wsId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Aceitar convite ---------- */

export const previewInvitation = previewSlimInvitation;

export const acceptInvitation = acceptSlimInvitation;

// SLIM_SETTINGS_CONTINUATION_V1
