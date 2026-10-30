import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const GRAPH = "v23.0";
type Ctx = { supabase: SupabaseClient; userId: string; workspaceId: string };

type MetaObject = {
  id?: string;
  name?: string;
  account_id?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
};

async function tokenFor(sb: SupabaseClient, workspaceId: string) {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY ausente.");
  const { data, error } = await sb.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: "meta",
    _key: key,
  });
  if (error) throw new Error(error.message);
  const token = (data as { access_token?: string } | null)?.access_token;
  if (!token) throw new Error("Meta não conectada neste workspace.");
  return token;
}

async function metaGet<T>(path: string, token: string, fields: string): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("fields", fields);
  const response = await fetch(url.toString());
  const text = await response.text();
  if (!response.ok) throw new Error(`Meta GET ${path} ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

async function metaPost(path: string, token: string, body: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  const response = await fetch(url.toString(), {
    method: "POST",
    body: new URLSearchParams({ ...body, access_token: token }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Meta POST ${path} ${response.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return {}; }
}

async function verifyObject(sb: SupabaseClient, workspaceId: string, objectId: string, token: string) {
  const object = await metaGet<MetaObject>(objectId, token, "id,name,account_id,status,effective_status,daily_budget,lifetime_budget");
  if (!object.account_id) throw new Error("A Meta não devolveu a conta proprietária do objeto.");
  const accountId = object.account_id.startsWith("act_") ? object.account_id : `act_${object.account_id}`;
  const { data } = await sb.from("meta_ad_accounts")
    .select("account_id")
    .eq("workspace_id", workspaceId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!data) throw new Error("O alvo não pertence a uma conta Meta deste workspace.");
  return { object, accountId };
}

async function logOperation(ctx: Ctx, input: Record<string, unknown>, response: Record<string, unknown>, operation: string, accountId: string, targetId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("meta_campaign_operations").insert({
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      ad_account_id: accountId,
      operation,
      target_id: targetId,
      request_payload: input as never,
      response_payload: response as never,
      status: "success",
      error_message: null,
    });
  } catch { /* execução no provider já ocorreu; log é best-effort */ }
}

export function buildGuardedGestorActionTools(ctx: Ctx) {
  return {
    set_meta_object_status_safely: tool({
      description: "Pausa ou ativa campanha/conjunto/anúncio Meta após validar que o objeto pertence ao workspace. Use somente quando o usuário pedir explicitamente a mudança de status.",
      inputSchema: z.object({
        objectId: z.string().min(1),
        status: z.enum(["ACTIVE", "PAUSED"]),
        reason: z.string().min(3).max(500),
      }),
      execute: async (input) => {
        const token = await tokenFor(ctx.supabase, ctx.workspaceId);
        const { object, accountId } = await verifyObject(ctx.supabase, ctx.workspaceId, input.objectId, token);
        const previousStatus = object.status ?? object.effective_status ?? null;
        if (previousStatus === input.status) {
          return { ok: true, changed: false, objectId: input.objectId, status: input.status, message: "Nenhuma ação necessária: o objeto já está neste status." };
        }
        await metaPost(input.objectId, token, { status: input.status });
        const evidence = { objectId: input.objectId, name: object.name ?? null, previousStatus, status: input.status, reason: input.reason };
        await logOperation(ctx, input, evidence, "guarded_set_status", accountId, input.objectId);
        return { ok: true, changed: true, ...evidence };
      },
    }),

    adjust_meta_budget_safely: tool({
      description: "Ajusta o orçamento próprio de campanha ou conjunto Meta por percentual, limitado a ±20% por execução. Valida ownership e nunca aceita valor absoluto arbitrário.",
      inputSchema: z.object({
        objectId: z.string().min(1),
        percentDelta: z.number().min(-20).max(20).refine((value) => value !== 0, "A variação precisa ser diferente de zero."),
        reason: z.string().min(3).max(500),
      }),
      execute: async (input) => {
        const token = await tokenFor(ctx.supabase, ctx.workspaceId);
        const { object, accountId } = await verifyObject(ctx.supabase, ctx.workspaceId, input.objectId, token);
        const field = object.daily_budget ? "daily_budget" : object.lifetime_budget ? "lifetime_budget" : null;
        if (!field) throw new Error("O objeto não possui orçamento próprio neste nível.");
        const current = Number(object[field]) || 0;
        if (current <= 0) throw new Error("Orçamento atual inválido para ajuste seguro.");
        const next = Math.max(100, Math.round(current * (1 + input.percentDelta / 100)));
        await metaPost(input.objectId, token, { [field]: String(next) });
        const evidence = { objectId: input.objectId, name: object.name ?? null, field, from: current, to: next, percentDelta: input.percentDelta, reason: input.reason };
        await logOperation(ctx, input, evidence, "guarded_adjust_budget", accountId, input.objectId);
        return { ok: true, changed: true, ...evidence };
      },
    }),
  };
}
