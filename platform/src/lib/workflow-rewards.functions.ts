import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = any;

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
  const { data: p } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  if (!p?.current_workspace_id) throw new Error("Workspace ativo não definido.");
  return p.current_workspace_id as string;
}

async function canManage(sb: AnySb, wsId: string, userId: string): Promise<boolean> {
  const { data } = await sb.rpc("can_manage_workflow", { _workspace_id: wsId, _user_id: userId });
  return Boolean(data);
}

export interface WorkflowReward {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  coinCost: number;
  imageUrl: string | null;
  active: boolean;
  position: number;
}

export const listRewards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data, error } = await sb
      .from("workflow_gamification_rewards")
      .select("*")
      .eq("workspace_id", wsId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      title: r.title,
      description: r.description ?? null,
      coinCost: r.coin_cost ?? 0,
      imageUrl: r.image_url ?? null,
      active: r.active,
      position: r.position ?? 0,
    })) as WorkflowReward[];
  });

export const createReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(2000).nullable().optional(),
        coinCost: z.number().int().min(0).default(0),
        imageUrl: z.string().max(1000).nullable().optional(),
        active: z.boolean().default(true),
        position: z.number().int().default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    const { data: inserted, error } = await sb
      .from("workflow_gamification_rewards")
      .insert({
        workspace_id: wsId,
        title: data.title,
        description: data.description ?? null,
        coin_cost: data.coinCost,
        image_url: data.imageUrl ?? null,
        active: data.active,
        position: data.position,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const r = inserted as any;
    return {
      id: r.id,
      workspaceId: r.workspace_id,
      title: r.title,
      description: r.description ?? null,
      coinCost: r.coin_cost ?? 0,
      imageUrl: r.image_url ?? null,
      active: r.active,
      position: r.position ?? 0,
    } as WorkflowReward;
  });

export const updateReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).nullable().optional(),
        coinCost: z.number().int().min(0).default(0),
        imageUrl: z.string().max(1000).nullable().optional(),
        active: z.boolean().default(true),
        position: z.number().int().default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    const { data: updated, error } = await sb
      .from("workflow_gamification_rewards")
      .update({
        title: data.title,
        description: data.description ?? null,
        coin_cost: data.coinCost,
        image_url: data.imageUrl ?? null,
        active: data.active,
        position: data.position,
      })
      .eq("id", data.id)
      .eq("workspace_id", wsId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const r = updated as any;
    return {
      id: r.id,
      workspaceId: r.workspace_id,
      title: r.title,
      description: r.description ?? null,
      coinCost: r.coin_cost ?? 0,
      imageUrl: r.image_url ?? null,
      active: r.active,
      position: r.position ?? 0,
    } as WorkflowReward;
  });

export const deleteReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!(await canManage(sb, wsId, context.userId))) throw new Error("Sem permissão.");
    const { error } = await sb
      .from("workflow_gamification_rewards")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
