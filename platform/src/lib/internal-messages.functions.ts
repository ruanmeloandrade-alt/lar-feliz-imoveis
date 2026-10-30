import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listInternalMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase as any)
      .from("internal_messages")
      .select("id, from_user_id, to_user_id, task_id, body, origin, read_at, created_at")
      .eq("to_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      from_user_id: string | null;
      to_user_id: string;
      task_id: string | null;
      body: string;
      origin: string;
      read_at: string | null;
      created_at: string;
    }>;
  });

export const markInternalMessageRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const q: any = (supabase as any)
      .from("internal_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("to_user_id", userId)
      .is("read_at", null);
    if (data.id) q.eq("id", data.id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendInternalMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        toUserId: z.string().uuid(),
        body: z.string().min(1).max(4000),
        taskId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // find caller's workspace
    const { data: wm } = await (supabase as any)
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const workspaceId = (wm as any)?.workspace_id;
    if (!workspaceId) throw new Error("Sem workspace");
    const { error } = await (supabase as any).from("internal_messages").insert({
      workspace_id: workspaceId,
      from_user_id: userId,
      to_user_id: data.toUserId,
      task_id: data.taskId ?? null,
      body: data.body,
      origin: "admin",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
