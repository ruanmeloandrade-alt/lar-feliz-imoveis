import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { z } from "zod";
import { formatWorkspaceError, requireActiveWorkspace, resolveActiveWorkspace } from "@/lib/workspace-resolver.server";

type Sb = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  from: (t: string) => {
    select: (s: string) => {
      eq: (col: string, v: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  };
};

async function resolveWorkspaceId(sb: Sb, userId: string, provided?: string): Promise<string> {
  if (provided) return provided;
  return requireActiveWorkspace(sb, userId);
}

export const getWorkspaceDefaultCurrency = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Sb;
    const wsId = data.workspaceId ?? await resolveActiveWorkspace(sb, context.userId as string, { createIfMissing: false });
    if (!wsId) return { workspaceId: null, currency: "BRL" };
    const { data: cur, error } = await sb.rpc("get_workspace_default_currency", { _workspace_id: wsId });
    if (error) return { workspaceId: wsId, currency: "BRL", error: formatWorkspaceError(error) };
    return { workspaceId: wsId, currency: (cur as string) || "BRL" };
  });


export const getWorkspaceRegionalSettings = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Sb;
    const wsId = data.workspaceId ?? await resolveActiveWorkspace(sb, context.userId as string, { createIfMissing: false });
    if (!wsId) return { workspaceId: null, currency: "BRL", timezone: "America/Sao_Paulo" };

    const { data: regional, error } = await sb.rpc("get_workspace_regional_settings", {
      _workspace_id: wsId,
    });
    if (error) {
      return {
        workspaceId: wsId,
        currency: "BRL",
        timezone: "America/Sao_Paulo",
        error: formatWorkspaceError(error),
      };
    }

    const value = (regional ?? {}) as { currency?: string; timezone?: string };
    return {
      workspaceId: wsId,
      currency: value.currency || "BRL",
      timezone: value.timezone || "America/Sao_Paulo",
    };
  });

export const setWorkspaceDefaultCurrency = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      workspaceId: z.string().uuid().optional(),
      currency: z.string().regex(/^[A-Z]{3}$/, "Use um código ISO 4217 (3 letras maiúsculas)"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Sb;
    const wsId = await resolveWorkspaceId(sb, context.userId as string, data.workspaceId);
    const { data: cur, error } = await sb.rpc("set_workspace_default_currency", {
      _workspace_id: wsId,
      _currency: data.currency,
    });
    if (error) throw new Error(error.message ?? "erro ao atualizar moeda do workspace");
    return { workspaceId: wsId, currency: (cur as string) || data.currency };
  });


export const setWorkspaceRegionalSettings = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      workspaceId: z.string().uuid().optional(),
      currency: z.string().regex(/^[A-Z]{3}$/, "Use um código ISO 4217 (3 letras maiúsculas)"),
      timezone: z.string().min(1).max(60),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Sb;
    const wsId = await resolveWorkspaceId(sb, context.userId as string, data.workspaceId);
    const { data: regional, error } = await sb.rpc("set_workspace_regional_settings", {
      _workspace_id: wsId,
      _currency: data.currency,
      _timezone: data.timezone,
    });
    if (error) throw new Error(error.message ?? "erro ao atualizar regionalização do workspace");
    const value = (regional ?? {}) as { currency?: string; timezone?: string };
    return {
      workspaceId: wsId,
      currency: value.currency || data.currency,
      timezone: value.timezone || data.timezone,
    };
  });
