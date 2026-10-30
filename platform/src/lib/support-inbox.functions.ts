import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error || !data) throw new Error("Acesso restrito ao super admin.");
}

export const listSupportAdminThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    await requireSuperAdmin(sb, context.userId);

    const [{ data: messages, error: messagesError }, { data: handoffs, error: handoffsError }] = await Promise.all([
      sb
        .from("support_robot_messages")
        .select("id,workspace_id,user_id,role,content,created_at,sender_type")
        .order("created_at", { ascending: false })
        .limit(1500),
      sb
        .from("support_handoffs")
        .select("id,workspace_id,user_id,status,reason,created_at,updated_at")
        .order("updated_at", { ascending: false }),
    ]);

    if (messagesError) throw new Error(messagesError.message);
    if (handoffsError) throw new Error(handoffsError.message);

    const rows = (messages ?? []) as Array<any>;
    const workspaceIds = [...new Set(rows.map((row) => row.workspace_id))];
    const userIds = [...new Set(rows.map((row) => row.user_id))];

    const [{ data: workspaces }, { data: profiles }] = await Promise.all([
      workspaceIds.length
        ? sb.from("workspaces").select("id,name,slug").in("id", workspaceIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? sb.from("profiles").select("id,full_name,display_name").in("id", userIds)
        : Promise.resolve({ data: [] }),
    ]);

    const workspaceMap = new Map((workspaces ?? []).map((w: any) => [w.id, w]));
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const handoffMap = new Map((handoffs ?? []).map((h: any) => [`${h.workspace_id}:${h.user_id}`, h]));
    const grouped = new Map<string, any>();

    for (const row of rows) {
      const key = `${row.workspace_id}:${row.user_id}`;
      if (grouped.has(key)) continue;
      const workspace = workspaceMap.get(row.workspace_id) as any;
      const profile = profileMap.get(row.user_id) as any;
      const handoff = handoffMap.get(key) as any;
      grouped.set(key, {
        key,
        workspaceId: row.workspace_id,
        userId: row.user_id,
        workspaceName: workspace?.name ?? "Workspace",
        workspaceSlug: workspace?.slug ?? null,
        userName: profile?.full_name ?? profile?.display_name ?? "Usuário",
        lastMessage: row.content,
        lastMessageAt: row.created_at,
        pendingHandoff: handoff?.status === "pending",
        handoffReason: handoff?.reason ?? null,
      });
    }

    return Array.from(grouped.values());
  });

export const getSupportAdminThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    userId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await requireSuperAdmin(sb, context.userId);

    const [{ data: messages, error }, { data: handoff }] = await Promise.all([
      sb
        .from("support_robot_messages")
        .select("id,role,content,created_at,sender_type")
        .eq("workspace_id", data.workspaceId)
        .eq("user_id", data.userId)
        .order("created_at", { ascending: true })
        .limit(500),
      sb
        .from("support_handoffs")
        .select("status,reason,created_at,updated_at")
        .eq("workspace_id", data.workspaceId)
        .eq("user_id", data.userId)
        .maybeSingle(),
    ]);

    if (error) throw new Error(error.message);
    return { messages: messages ?? [], handoff: handoff ?? null };
  });

export const sendSupportAdminReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    userId: z.string().uuid(),
    content: z.string().trim().min(1).max(8000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await requireSuperAdmin(sb, context.userId);

    const { error } = await sb.from("support_robot_messages").insert({
      workspace_id: data.workspaceId,
      user_id: data.userId,
      role: "assistant",
      sender_type: "human",
      content: data.content,
    });
    if (error) throw new Error(error.message);

    await sb
      .from("support_handoffs")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId);

    return { ok: true };
  });
