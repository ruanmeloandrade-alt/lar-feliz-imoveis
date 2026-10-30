import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveWorkspace } from "@/lib/workspace-resolver.server";

type AnySb = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
  const wsId = await resolveActiveWorkspace(supabase, userId, { createIfMissing: false });
  if (!wsId) throw new Error("Workspace ativo não encontrado.");
  return wsId;
}

async function assertOwnedGroup(sb: AnySb, wsId: string, userId: string, groupId: string) {
  const { data, error } = await sb
    .from("note_groups")
    .select("id")
    .eq("id", groupId)
    .eq("workspace_id", wsId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível validar o grupo de notas.");
  if (!data?.id) throw new Error("Grupo de notas não encontrado para este usuário e workspace.");
}

export type NoteKind = "text" | "checklist";
export interface NoteItem { id: string; text: string; done: boolean }

export interface NoteRow {
  id: string;
  title: string;
  content: string;
  color: string;
  kind: NoteKind;
  items: NoteItem[];
  rotation: number;
  isPinned: boolean;
  isArchived: boolean;
  groupId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteGroupRow {
  id: string;
  name: string;
  color: string;
  position: number;
  noteCount?: number;
  createdAt: string;
  updatedAt: string;
}

function mapRow(r: any): NoteRow {
  const rawItems = Array.isArray(r.items) ? r.items : [];
  return {
    id: r.id,
    title: r.title ?? "",
    content: r.content ?? "",
    color: r.color ?? "default",
    kind: (r.kind === "checklist" ? "checklist" : "text") as NoteKind,
    items: rawItems
      .filter((i: unknown) => i && typeof i === "object")
      .map((i: any, idx: number) => ({
        id: typeof i.id === "string" ? i.id : `it-${idx}`,
        text: typeof i.text === "string" ? i.text : "",
        done: !!i.done,
      })),
    rotation: Number.isFinite(r.rotation) ? Number(r.rotation) : 0,
    isPinned: !!r.is_pinned,
    isArchived: !!r.is_archived,
    groupId: r.group_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapGroup(r: any): NoteGroupRow {
  return {
    id: r.id,
    name: r.name ?? "",
    color: r.color ?? "default",
    position: Number.isFinite(r.position) ? Number(r.position) : 0,
    noteCount: Number(r.note_count ?? 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = "id, title, content, color, kind, items, rotation, is_pinned, is_archived, group_id, created_at, updated_at";

export const listNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      archived: z.boolean().optional(),
      groupId: z.string().uuid().nullable().optional(),
      page: z.number().int().min(1).max(10000).optional(),
      pageSize: z.union([z.literal(20), z.literal(40), z.literal(80)]).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 40;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = sb
      .from("user_notes")
      .select(SELECT, { count: "exact" })
      .eq("workspace_id", wsId)
      .eq("user_id", context.userId)
      .eq("is_archived", !!data.archived);
    if (data.groupId === null) q = q.is("group_id", null);
    else if (typeof data.groupId === "string") q = q.eq("group_id", data.groupId);

    const { data: rows, error, count } = await q
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);

    const total = count ?? 0;
    return {
      notes: (rows ?? []).map(mapRow),
      pagination: {
        page,
        pageSize,
        total,
        hasMore: from + (rows?.length ?? 0) < total,
      },
    };
  });

const ItemSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(500),
  done: z.boolean(),
});

const NoteInput = z.object({
  title: z.string().max(200).optional(),
  content: z.string().max(20000).optional(),
  color: z.string().max(24).optional(),
  kind: z.enum(["text", "checklist"]).optional(),
  items: z.array(ItemSchema).max(200).optional(),
  rotation: z.number().int().min(-8).max(8).optional(),
  groupId: z.string().uuid().nullable().optional(),
});

export const createNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => NoteInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (typeof data.groupId === "string") {
      await assertOwnedGroup(sb, wsId, context.userId, data.groupId);
    }
    const rotation = data.rotation ?? Math.floor(Math.random() * 7) - 3;
    const { data: row, error } = await sb
      .from("user_notes")
      .insert({
        workspace_id: wsId,
        user_id: context.userId,
        title: data.title ?? "",
        content: data.content ?? "",
        color: data.color ?? "default",
        kind: data.kind ?? "text",
        items: data.items ?? [],
        rotation,
        group_id: data.groupId ?? null,
      })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return { note: mapRow(row) };
  });

export const updateNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().max(200).optional(),
      content: z.string().max(20000).optional(),
      color: z.string().max(24).optional(),
      kind: z.enum(["text", "checklist"]).optional(),
      items: z.array(ItemSchema).max(200).optional(),
      rotation: z.number().int().min(-8).max(8).optional(),
      isPinned: z.boolean().optional(),
      isArchived: z.boolean().optional(),
      groupId: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (typeof data.groupId === "string") {
      await assertOwnedGroup(sb, wsId, context.userId, data.groupId);
    }
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.content !== undefined) patch.content = data.content;
    if (data.color !== undefined) patch.color = data.color;
    if (data.kind !== undefined) patch.kind = data.kind;
    if (data.items !== undefined) patch.items = data.items;
    if (data.rotation !== undefined) patch.rotation = data.rotation;
    if (data.isPinned !== undefined) patch.is_pinned = data.isPinned;
    if (data.isArchived !== undefined) patch.is_archived = data.isArchived;
    if (data.groupId !== undefined) patch.group_id = data.groupId;
    const { data: row, error } = await sb
      .from("user_notes")
      .update(patch)
      .eq("id", data.id)
      .eq("workspace_id", wsId)
      .eq("user_id", context.userId)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return { note: mapRow(row) };
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb
      .from("user_notes")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", wsId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Grupos ---------- */

const GROUP_SELECT = "id, name, color, position, created_at, updated_at";

export const listNoteGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    const [{ data: rows, error }, { data: countRows, error: countError }] = await Promise.all([
      sb
        .from("note_groups")
        .select(GROUP_SELECT)
        .eq("workspace_id", wsId)
        .eq("user_id", context.userId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      sb.rpc("f06_note_group_counts"),
    ]);

    if (error) throw new Error(error.message);
    if (countError) throw new Error(countError.message);

    const countMap = (countRows ?? []).reduce((acc: Record<string, number>, row: any) => {
      const key = row.group_id ?? "none";
      acc[key] = Number(row.note_count ?? 0);
      return acc;
    }, {});
    const totalCount = Object.values(countMap).reduce((sum, value) => sum + value, 0);

    return {
      groups: (rows ?? []).map((r: any) => mapGroup({
        ...r,
        note_count: countMap[r.id] ?? 0,
      })),
      unassignedCount: countMap.none ?? 0,
      totalCount,
    };
  });

export const createNoteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().min(1).max(80),
      color: z.string().max(24).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: last } = await sb
      .from("note_groups")
      .select("position")
      .eq("workspace_id", wsId)
      .eq("user_id", context.userId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = ((last as { position?: number } | null)?.position ?? -1) + 1;
    const { data: row, error } = await sb
      .from("note_groups")
      .insert({
        workspace_id: wsId,
        user_id: context.userId,
        name: data.name,
        color: data.color ?? "default",
        position: nextPos,
      })
      .select(GROUP_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return { group: mapGroup(row) };
  });

export const updateNoteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(80).optional(),
      color: z.string().max(24).optional(),
      position: z.number().int().min(0).max(999).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.color !== undefined) patch.color = data.color;
    if (data.position !== undefined) patch.position = data.position;
    const { data: row, error } = await sb
      .from("note_groups")
      .update(patch)
      .eq("id", data.id)
      .eq("workspace_id", wsId)
      .eq("user_id", context.userId)
      .select(GROUP_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return { group: mapGroup(row) };
  });

export const deleteNoteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      // se true, apaga também as notas do grupo; senão só desvincula.
      deleteNotes: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { data: deleted, error } = await sb.rpc("f06_delete_note_group", {
      _group_id: data.id,
      _delete_notes: data.deleteNotes === true,
    });
    if (error || deleted !== true) throw new Error("Não foi possível excluir o grupo de notas de forma segura.");
    return { ok: true };
  });
