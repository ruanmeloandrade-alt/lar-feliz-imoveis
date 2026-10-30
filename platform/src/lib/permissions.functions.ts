import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";

type AnySb = { from: (t: string) => any; rpc: (fn: string, args?: any) => any };

async function activeWorkspace(sb: AnySb, userId: string): Promise<string> {
  return requireActiveWorkspace(sb as never, userId);
}

async function assertOwner(sb: AnySb, userId: string, wsId: string) {
  const { data, error } = await sb
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", wsId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = (data as any)?.role;
  if (role !== "owner") throw new Error("Apenas o dono pode editar permissões.");
}

async function requireWorkspaceMember(sb: AnySb, wsId: string, userId: string) {
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

async function requireWorkspaceSector(sb: AnySb, wsId: string, sectorId: string) {
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

/* ---------- Contexto: plano + pipelines + etapas + usuário ---------- */

export const getPermissionsContext = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    await assertOwner(sb, context.userId, wsId);
    const targetMember = await requireWorkspaceMember(sb, wsId, data.userId);

    const [{ data: sub }, { data: pipelines }, { data: stages }, { data: perm }, { data: sectors }, { data: mySectors }, { data: sources }, { data: sourceLinks }] = await Promise.all([
      sb.from("subscriptions").select("plan_id, plans(code, name, modules)").eq("workspace_id", wsId).maybeSingle(),
      sb.from("pipelines").select("id, name, provider").eq("workspace_id", wsId).order("name"),
      sb.from("pipeline_stages").select("id, name, pipeline_id, position").eq("workspace_id", wsId).order("position"),
      sb.from("user_permissions").select("permissions").eq("workspace_id", wsId).eq("user_id", data.userId).maybeSingle(),
      sb.from("workflow_sectors").select("id, name, color").eq("workspace_id", wsId).order("position"),
      sb.from("workflow_sector_members").select("sector_id").eq("workspace_id", wsId).eq("user_id", data.userId),
      sb.from("crm_sources").select("id, provider, display_name, is_default").eq("workspace_id", wsId).order("is_default", { ascending: false }),
      sb.from("crm_source_funnels").select("crm_source_id, pipeline_id").eq("workspace_id", wsId),
    ]);

    return {
      workspace_id: wsId,
      plan: (sub as any)?.plans ?? null,
      pipelines: pipelines ?? [],
      stages: stages ?? [],
      permissions: (perm as any)?.permissions ?? null,
      member: targetMember,
      sectors: sectors ?? [],
      sectorId: ((mySectors ?? []) as any[])[0]?.sector_id ?? null,
      crmSources: sources ?? [],
      sourceLinks: sourceLinks ?? [],
    };
  });

/* ---------- Salvar permissões ---------- */

const PermSchema = z.object({
  userId: z.string().uuid(),
  permissions: z.record(z.string(), z.any()),
});

export const saveUserPermissions = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => PermSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    await assertOwner(sb, context.userId, wsId);
    const target = await requireWorkspaceMember(sb, wsId, data.userId);
    if (target.role === "owner") throw new Error("As permissões do dono do workspace não podem ser restringidas.");

    const { error } = await sb.from("user_permissions").upsert({
      workspace_id: wsId,
      user_id: data.userId,
      permissions: data.permissions,
      updated_by: context.userId,
    }, { onConflict: "workspace_id,user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Modelos de permissão (reutilizáveis entre usuários) ---------- */

export const listPermissionTemplates = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    await assertOwner(sb, context.userId, wsId);
    const { data, error } = await sb
      .from("permission_templates")
      .select("id, name, permissions, sector_id, updated_at")
      .eq("workspace_id", wsId)
      .order("name");
    if (error) throw new Error(error.message);
    return { templates: data ?? [] };
  });

export const savePermissionTemplate = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().trim().min(2).max(60),
      permissions: z.record(z.string(), z.any()),
      sectorId: z.string().uuid().nullish(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    await assertOwner(sb, context.userId, wsId);
    if (data.sectorId) await requireWorkspaceSector(sb, wsId, data.sectorId);

    if (data.sectorId) {
      await sb
        .from("permission_templates")
        .update({ sector_id: null })
        .eq("workspace_id", wsId)
        .eq("sector_id", data.sectorId)
        .neq("name", data.name);
    }

    const { data: row, error } = await sb
      .from("permission_templates")
      .upsert(
        {
          workspace_id: wsId,
          name: data.name,
          permissions: data.permissions,
          sector_id: data.sectorId ?? null,
          created_by: context.userId,
        },
        { onConflict: "workspace_id,name" },
      )
      .select("id, name, permissions, sector_id, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { template: row };
  });

export const deletePermissionTemplate = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    await assertOwner(sb, context.userId, wsId);
    const { error } = await sb.from("permission_templates").delete().eq("id", data.id).eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Setores de trabalho (fluxo de trabalho) ---------- */

export const listWorkSectors = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const { data, error } = await sb
      .from("workflow_sectors")
      .select("id, name, color")
      .eq("workspace_id", wsId)
      .order("position");
    if (error) throw new Error(error.message);
    return { sectors: data ?? [] };
  });

export const createWorkSector = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().min(2).max(60), color: z.string().max(20).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    await assertOwner(sb, context.userId, wsId);
    const { data: row, error } = await sb
      .from("workflow_sectors")
      .insert({ workspace_id: wsId, name: data.name.trim(), color: data.color ?? "#6366f1" })
      .select("id, name, color")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { sector: row };
  });

export const setUserSector = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), sectorId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    await assertOwner(sb, context.userId, wsId);
    const target = await requireWorkspaceMember(sb, wsId, data.userId);
    if (target.role === "owner") throw new Error("O dono do workspace não precisa de setor obrigatório para permissões.");
    if (data.sectorId) await requireWorkspaceSector(sb, wsId, data.sectorId);

    const { error: deleteError } = await sb
      .from("workflow_sector_members")
      .delete()
      .eq("workspace_id", wsId)
      .eq("user_id", data.userId);
    if (deleteError) throw new Error(deleteError.message);

    if (data.sectorId) {
      const { error } = await sb
        .from("workflow_sector_members")
        .insert({ workspace_id: wsId, sector_id: data.sectorId, user_id: data.userId });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
