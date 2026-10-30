import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FolderSchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  parentId: z.string().uuid().nullable().default(null),
  name: z.string().min(1).max(120),
  description: z.string().max(400).default(""),
});

const CopySchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  folderId: z.string().uuid().nullable().default(null),
  name: z.string().min(1).max(160),
  content: z.string().min(1).max(6000),
  notes: z.string().max(1000).default(""),
  tags: z.array(z.string().min(1).max(60)).max(20).default([]),
});

export const listCopyFolders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("meta_copy_folders")
      .select("id,name,description,parent_id")
      .eq("workspace_id", data.workspaceId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertCopyFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FolderSchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      workspace_id: data.workspaceId,
      parent_id: data.parentId,
      name: data.name,
      description: data.description,
      created_by: context.userId,
    };
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("meta_copy_folders")
        .update(row).eq("id", data.id).eq("workspace_id", data.workspaceId)
        .select("id,name,description,parent_id").maybeSingle();
      if (error) throw new Error(error.message);
      return updated;
    }
    const { data: inserted, error } = await context.supabase
      .from("meta_copy_folders").insert(row)
      .select("id,name,description,parent_id").maybeSingle();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const deleteCopyFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("meta_copy_folders").delete()
      .eq("id", data.id).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSavedCopies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; search?: string }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("meta_saved_copies")
      .select("id,folder_id,name,content,notes,tags,created_at,updated_at")
      .eq("workspace_id", data.workspaceId)
      .order("updated_at", { ascending: false });
    const s = (data.search ?? "").trim();
    if (s) q = q.or(`name.ilike.%${s}%,content.ilike.%${s}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertSavedCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CopySchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      workspace_id: data.workspaceId,
      folder_id: data.folderId,
      name: data.name,
      content: data.content,
      notes: data.notes,
      tags: data.tags,
      created_by: context.userId,
    };
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("meta_saved_copies")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("id", data.id).eq("workspace_id", data.workspaceId)
        .select("id").maybeSingle();
      if (error) throw new Error(error.message);
      return updated;
    }
    const { data: inserted, error } = await context.supabase
      .from("meta_saved_copies").insert(row).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const deleteSavedCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("meta_saved_copies").delete()
      .eq("id", data.id).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Move uma copy para outra pasta (usado no arrastar-e-soltar). */
export const moveSavedCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; workspaceId: string; folderId: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("meta_saved_copies")
      .update({ folder_id: data.folderId, updated_at: new Date().toISOString() })
      .eq("id", data.id).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
