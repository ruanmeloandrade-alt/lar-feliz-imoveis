import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = { from: (t: string) => any };

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
  const { data: prof, error: profileError } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  if(profileError)throw new Error("Não foi possível identificar a empresa ativa.");
  const wsId = (prof as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!wsId) throw new Error("Workspace ativo não encontrado.");
  return wsId;
}

export interface InboxLabelRow {
  id: string;
  group_name: string;
  name: string;
  color: string;
}

export const listInboxLabels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: labels, error } = await sb
      .from("inbox_labels")
      .select("id, group_name, name, color")
      .eq("workspace_id", wsId)
      .order("group_name")
      .order("name");
    if (error) throw new Error(error.message);
    const { data: assigns, error: assignmentError } = await sb
      .from("inbox_label_assignments")
      .select("thread_ref, label_id")
      .eq("workspace_id", wsId);
    if(assignmentError)throw new Error("Não foi possível carregar as etiquetas das conversas.");
    const map: Record<string, string[]> = {};
    for (const a of (assigns ?? []) as Array<{ thread_ref: string; label_id: string }>) {
      (map[a.thread_ref] ??= []).push(a.label_id);
    }
    return { labels: (labels ?? []) as InboxLabelRow[], assignments: map };
  });

export const upsertInboxLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    group_name: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(80),
    color: z.string().min(1).max(80),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const payload = { workspace_id: wsId, group_name: data.group_name, name: data.name, color: data.color, updated_at:new Date().toISOString() };
    if (data.id) {
      const { data:saved,error } = await sb.from("inbox_labels").update(payload).eq("id", data.id).eq("workspace_id", wsId).select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if(!saved)throw new Error("Etiqueta não encontrada nesta empresa.");
      return { id: data.id };
    }
    const { data: row, error } = await sb.from("inbox_labels").upsert(payload,{onConflict:"workspace_id,group_name,name"}).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const deleteInboxLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb.from("inbox_labels").delete().eq("id", data.id).eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleLabelAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conversationId: z.string().min(1),
    labelId: z.string().uuid(),
    on: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: ownedLabel, error: labelError } = await sb
      .from("inbox_labels")
      .select("id")
      .eq("id", data.labelId)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (labelError) throw new Error(labelError.message);
    if (!ownedLabel) throw new Error("Etiqueta não pertence a este workspace.");
    if (data.on) {
      const { error } = await sb.from("inbox_label_assignments").upsert({
        workspace_id: wsId,
        thread_ref: data.conversationId,
        label_id: data.labelId,
      }, { onConflict: "label_id,thread_ref" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb.from("inbox_label_assignments").delete()
        .eq("workspace_id", wsId)
        .eq("thread_ref", data.conversationId)
        .eq("label_id", data.labelId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// SLIM_INBOX_RESUMPTION_V1
