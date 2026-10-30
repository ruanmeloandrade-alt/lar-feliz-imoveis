import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BYTES_PER_GB, includedStorageBytes } from "@/lib/billing/storage-catalog";

type AnySb = {
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
};

const StorageKindSchema = z.enum(["image", "audio", "video", "pdf", "document", "attachment", "other_binary"]);
const StorageSourceSchema = z.enum([
  "upload",
  "social_media",
  "gestor_trafego",
  "crm",
  "inbox",
  "notas",
  "workflow",
  "other",
]);

async function assertWorkspaceAccess(sb: AnySb, userId: string, workspaceId: string) {
  const { data, error } = await sb
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Workspace não autorizado.");
}

async function loadStorageState(sb: AnySb, workspaceId: string) {
  const { data: moduleRow, error: moduleError } = await sb
    .from("workspace_modules")
    .select("plan_code")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (moduleError) throw new Error(moduleError.message);
  const planCode = (moduleRow as { plan_code?: string | null } | null)?.plan_code ?? "starter";

  const { data: files, error: filesError } = await sb
    .from("workspace_storage_files")
    .select("size_bytes")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  if (filesError) throw new Error(filesError.message);
  const usedBytes = ((files || []) as Array<{ size_bytes: number | string }>).reduce(
    (sum, row) => sum + Number(row.size_bytes || 0),
    0,
  );

  const { data: addons, error: addonsError } = await sb
    .from("workspace_storage_addons")
    .select("extra_gb")
    .eq("workspace_id", workspaceId)
    .eq("status", "active");
  if (addonsError) throw new Error(addonsError.message);
  const addonGb = ((addons || []) as Array<{ extra_gb: number }>).reduce((sum, row) => sum + Number(row.extra_gb || 0), 0);

  // includedStorageBytes resolves every current plan to the same 5 GB base.
  const includedBytes = includedStorageBytes(planCode);
  const addonBytes = addonGb * BYTES_PER_GB;
  const limitBytes = includedBytes + addonBytes;

  return {
    planCode,
    includedBytes,
    addonBytes,
    addonGb,
    limitBytes,
    usedBytes,
    availableBytes: Math.max(0, limitBytes - usedBytes),
    percentUsed: limitBytes > 0 ? Math.min(100, (usedBytes / limitBytes) * 100) : 0,
  };
}

const UsageSchema = z.object({ workspaceId: z.string().uuid() });

export const getWorkspaceStorageUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UsageSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertWorkspaceAccess(sb, context.userId, data.workspaceId);
    return loadStorageState(sb, data.workspaceId);
  });

const CheckSchema = z.object({
  workspaceId: z.string().uuid(),
  incomingBytes: z.number().int().nonnegative(),
});

export const checkWorkspaceStorageCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CheckSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertWorkspaceAccess(sb, context.userId, data.workspaceId);
    const state = await loadStorageState(sb, data.workspaceId);
    const allowed = state.usedBytes + data.incomingBytes <= state.limitBytes;
    return {
      ...state,
      incomingBytes: data.incomingBytes,
      allowed,
      requiredExtraBytes: allowed ? 0 : state.usedBytes + data.incomingBytes - state.limitBytes,
    };
  });

const RegisterSchema = z.object({
  workspaceId: z.string().uuid(),
  bucket: z.string().min(1).max(120),
  storagePath: z.string().min(1).max(1000),
  fileName: z.string().min(1).max(500),
  mime: z.string().max(255).nullable().optional(),
  kind: StorageKindSchema,
  source: StorageSourceSchema,
  sizeBytes: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const registerWorkspaceStorageFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RegisterSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    await assertWorkspaceAccess(sb, context.userId, data.workspaceId);

    const { data: existing, error: existingError } = await sb
      .from("workspace_storage_files")
      .select("id, size_bytes, deleted_at")
      .eq("bucket", data.bucket)
      .eq("storage_path", data.storagePath)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    if (!existing || (existing as { deleted_at?: string | null }).deleted_at) {
      const state = await loadStorageState(sb, data.workspaceId);
      const previousBytes = existing ? Number((existing as { size_bytes?: number | string }).size_bytes || 0) : 0;
      const projected = state.usedBytes - (existing && !(existing as { deleted_at?: string | null }).deleted_at ? previousBytes : 0) + data.sizeBytes;
      if (projected > state.limitBytes) {
        const required = projected - state.limitBytes;
        throw new Error(`Limite de armazenamento atingido. Libere espaço ou adicione pelo menos ${Math.ceil(required / BYTES_PER_GB)} GB.`);
      }
    }

    const payload = {
      workspace_id: data.workspaceId,
      bucket: data.bucket,
      storage_path: data.storagePath,
      file_name: data.fileName,
      mime: data.mime ?? null,
      kind: data.kind,
      source: data.source,
      size_bytes: data.sizeBytes,
      created_by: context.userId,
      deleted_at: null,
      metadata: data.metadata ?? {},
    };

    const { data: row, error } = await sb
      .from("workspace_storage_files")
      .upsert(payload, { onConflict: "bucket,storage_path" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id: string }).id };
  });

const DeleteSchema = z.object({ id: z.string().uuid() });

export const deleteWorkspaceStorageFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => DeleteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { data: row, error } = await sb
      .from("workspace_storage_files")
      .select("id, workspace_id, bucket, storage_path")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { ok: true, deleted: false };

    const file = row as { id: string; workspace_id: string; bucket: string; storage_path: string };
    await assertWorkspaceAccess(sb, context.userId, file.workspace_id);

    const { error: storageError } = await sb.storage.from(file.bucket).remove([file.storage_path]);
    if (storageError) throw new Error(storageError.message);

    const { error: updateError } = await sb
      .from("workspace_storage_files")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", file.id)
      .eq("workspace_id", file.workspace_id);
    if (updateError) throw new Error(updateError.message);
    return { ok: true, deleted: true };
  });
