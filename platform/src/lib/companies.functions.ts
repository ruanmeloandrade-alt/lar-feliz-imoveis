// SLIM_APPROVED_UI_COMMERCE_V1
import {requireActiveWorkspace} from "@/lib/workspace-resolver.server";
import {resolveSlimCompanySource} from "@/lib/slim-company-source.core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = { from: (t: string) => any };

async function activeWorkspace(sb:AnySb,userId:string):Promise<string>{return requireActiveWorkspace(sb,userId,{createIfMissing:false});}

async function signLogo(sb: AnySb, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await (sb as any).storage.from("company-logos").createSignedUrl(path, 60 * 60 * 24 * 7);
  return (data as { signedUrl?: string } | null)?.signedUrl ?? null;
}

export const listCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const { data, error } = await sb
      .from("companies")
      .select("id, name, site, notes, primary_lead_id, crm_source_id, cnpj, phone, logo_url, partner_details, created_at")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{ id: string; name: string; site: string | null; notes: string | null; primary_lead_id: string | null; crm_source_id: string; cnpj: string | null; phone: string | null; logo_url: string | null; created_at: string }>;
    const companyIds = rows.map((c) => c.id);
    let counts: Record<string, number> = {};
    if (companyIds.length) {
      const { data: leads } = await sb
        .from("leads")
        .select("company_id")
        .in("company_id", companyIds);
      counts = ((leads ?? []) as Array<{ company_id: string }>).reduce((acc, l) => {
        acc[l.company_id] = (acc[l.company_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    }

    const withLogos = await Promise.all(rows.map(async (c) => ({
      ...c,
      logo_signed_url: await signLogo(sb, c.logo_url),
      leadCount: counts[c.id] ?? 0,
    })));

    return { companies: withLogos };
  });

const PartnerDetailsSchema=z.object({kind:z.enum(['construtora','imobiliaria','corretor','outro']),contact:z.string().trim().max(150).default(''),email:z.union([z.literal(''),z.string().email()]).default(''),region:z.string().trim().max(300).default(''),address:z.string().trim().max(500).default(''),creci:z.string().trim().max(60).default(''),terms:z.string().trim().max(3000).default('')});
const CreateCompanySchema = z.object({
  partnerDetails: PartnerDetailsSchema.optional(),
  name: z.string().trim().min(1).max(120),
  site: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  cnpj: z.string().max(32).optional(),
  phone: z.string().max(40).optional(),
  logoUrl: z.string().max(400).optional(),
  members: z
    .array(z.object({ leadId: z.string().uuid(), role: z.string().max(80).optional() }))
    .optional(),
  primaryLeadId: z.string().uuid().optional().nullable(),
});

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateCompanySchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const crmSourceId = await resolveSlimCompanySource(sb, wsId);
    const { data: created, error } = await sb
      .from("companies")
      .insert({
        workspace_id: wsId,
        crm_source_id: crmSourceId,
        name: data.name,
        partner_details: data.partnerDetails ?? null,
        site: data.site || null,
        notes: data.notes || null,
        cnpj: data.cnpj ? data.cnpj.replace(/\D/g, "") : null,
        phone: data.phone || null,
        logo_url: data.logoUrl || null,
        primary_lead_id: data.primaryLeadId ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const companyId = (created as { id: string }).id;
    if (data.members && data.members.length) {
      for (const m of data.members) {
        await sb
          .from("leads")
          .update({ company_id: companyId, company_role: m.role || null })
          .eq("id", m.leadId)
          .eq("workspace_id", wsId);
      }
    }
    return { companyId };
  });

const UpdateCompanySchema = z.object({
  partnerDetails: PartnerDetailsSchema.optional(),
  companyId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  site: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  cnpj: z.string().max(32).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  logoUrl: z.string().max(400).nullable().optional(),
});

export const updateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateCompanySchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const patch: Record<string, unknown> = {};
    if(data.partnerDetails !== undefined)patch.partner_details=data.partnerDetails;
    if (data.name !== undefined) patch.name = data.name;
    if (data.site !== undefined) patch.site = data.site || null;
    if (data.notes !== undefined) patch.notes = data.notes || null;
    if (data.cnpj !== undefined) patch.cnpj = data.cnpj ? String(data.cnpj).replace(/\D/g, "") : null;
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (data.logoUrl !== undefined) patch.logo_url = data.logoUrl || null;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { data: saved, error } = await sb.from("companies").update(patch).eq("id", data.companyId).eq("workspace_id", wsId).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("Fornecedor não encontrado nesta operação Vanessa Simoni.");
    return { ok: true };
  });

const UploadLogoSchema = z.object({
  companyId: z.string().uuid().optional(),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(80),
  base64: z.string().min(1),
});

export const uploadCompanyLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadLogoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const ext = (data.filename.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "png";
    const rand = Math.random().toString(36).slice(2, 10);
    const objectPath = `${wsId}/${data.companyId ?? "new"}-${Date.now()}-${rand}.${ext}`;
    const buf = Buffer.from(data.base64, "base64");
    const { error } = await (sb as any).storage.from("company-logos").upload(objectPath, buf, {
      contentType: data.contentType,
      upsert: true,
    });
    if (error) throw new Error(error.message);
    const signed = await signLogo(sb, objectPath);
    return { path: objectPath, url: signed };
  });

const CompanyLeadsSchema = z.object({ companyId: z.string().uuid() });

export const listCompanyLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompanyLeadsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const { data: leads, error } = await sb
      .from("leads")
      .select("id, name, email, phone, value, stage_id, company_role, crm_sources(provider)")
      .eq("workspace_id", wsId)
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);
    return {
      leads: ((leads ?? []) as Array<{
        id: string; name: string; email: string | null; phone: string | null;
        value: number; stage_id: string | null; company_role: string | null;
        crm_sources: { provider: string } | null;
      }>).map((l) => ({
        id: l.id, name: l.name, email: l.email, phone: l.phone,
        value: l.value, stage_id: l.stage_id, role: l.company_role,
        provider: l.crm_sources?.provider ?? "mkton",
      })),
    };
  });

const SetPrimarySchema = z.object({ companyId: z.string().uuid(), leadId: z.string().uuid() });

export const setCompanyPrimaryLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetPrimarySchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const { error } = await sb
      .from("companies")
      .update({ primary_lead_id: data.leadId })
      .eq("id", data.companyId)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Manage members (add / update role / remove) ---------- */

const AddMembersSchema = z.object({
  companyId: z.string().uuid(),
  members: z.array(z.object({ leadId: z.string().uuid(), role: z.string().max(80).optional() })).min(1),
});

export const addCompanyMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AddMembersSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    for (const m of data.members) {
      await sb
        .from("leads")
        .update({ company_id: data.companyId, company_role: m.role || null })
        .eq("id", m.leadId)
        .eq("workspace_id", wsId);
    }
    return { ok: true };
  });

const UpdateRoleSchema = z.object({ leadId: z.string().uuid(), role: z.string().max(80).nullable() });

export const updateCompanyMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateRoleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const { error } = await sb
      .from("leads")
      .update({ company_role: data.role || null })
      .eq("id", data.leadId)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RemoveMemberSchema = z.object({ leadId: z.string().uuid() });

export const removeCompanyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RemoveMemberSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const { error } = await sb
      .from("leads")
      .update({ company_id: null, company_role: null })
      .eq("id", data.leadId)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Leads ainda sem empresa ---------- */

export const listUnassignedLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const { data, error } = await sb
      .from("leads")
      .select("id, name, email, phone, crm_sources(provider, display_name)")
      .eq("workspace_id", wsId)
      .is("company_id", null)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return {
      leads: ((data ?? []) as Array<{
        id: string; name: string; email: string | null; phone: string | null;
        crm_sources: { provider: string; display_name: string } | null;
      }>).map((l) => ({
        id: l.id, name: l.name, email: l.email, phone: l.phone,
        provider: l.crm_sources?.provider ?? "mkton",
        sourceName: l.crm_sources?.display_name ?? "MKTOn",
      })),
    };
  });
