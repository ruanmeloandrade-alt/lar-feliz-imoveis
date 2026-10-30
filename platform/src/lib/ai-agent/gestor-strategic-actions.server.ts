import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const GRAPH = "v23.0";

type Ctx = {
  supabase: SupabaseClient;
  userId: string;
  workspaceId: string;
};

type MetaObjectInfo = {
  id?: string;
  name?: string;
  account_id?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  tracking_specs?: unknown;
  creative?: { id?: string };
};

async function loadToken(sb: SupabaseClient, workspaceId: string) {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) throw new Error("INTEGRATION_ENCRYPTION_KEY ausente.");
  const { data, error } = await sb.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: "meta",
    _key: encKey,
  });
  if (error) throw new Error(error.message);
  const token = (data as { access_token?: string } | null)?.access_token;
  if (!token) throw new Error("Meta não conectada neste workspace.");
  return token;
}

async function metaGet<T>(path: string, token: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url.toString());
  const text = await response.text();
  if (!response.ok) throw new Error(`Meta GET ${path} ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

async function metaPost<T>(path: string, token: string, body: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  const form = new URLSearchParams({ ...body, access_token: token });
  const response = await fetch(url.toString(), { method: "POST", body: form });
  const text = await response.text();
  if (!response.ok) throw new Error(`Meta POST ${path} ${response.status}: ${text.slice(0, 400)}`);
  try { return JSON.parse(text) as T; } catch { return {} as T; }
}

async function assertAccountBelongsToWorkspace(sb: SupabaseClient, workspaceId: string, accountId: string) {
  const normalized = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const { data } = await sb.from("meta_ad_accounts")
    .select("account_id")
    .eq("workspace_id", workspaceId)
    .eq("account_id", normalized)
    .maybeSingle();
  if (!data) throw new Error("O objeto selecionado não pertence a uma conta Meta deste workspace.");
  return normalized;
}

function copiedId(level: "campaign" | "adset" | "ad", response: Record<string, unknown>) {
  const direct = level === "campaign"
    ? response.copied_campaign_id
    : level === "adset"
      ? response.copied_adset_id
      : response.copied_ad_id;
  if (typeof direct === "string" && direct) return direct;
  if (typeof response.id === "string" && response.id) return response.id;
  const list = response.ad_object_ids;
  if (Array.isArray(list)) {
    const first = list[0] as { copied_id?: string } | undefined;
    if (first?.copied_id) return first.copied_id;
  }
  return null;
}

async function changeBudgetOnCopy(
  objectId: string,
  percentDelta: number,
  token: string,
) {
  if (percentDelta === 0) return null;
  if (Math.abs(percentDelta) > 20) throw new Error("Guardrail: alteração de orçamento acima de 20% por execução não é permitida.");
  const info = await metaGet<{ daily_budget?: string; lifetime_budget?: string }>(objectId, token, {
    fields: "daily_budget,lifetime_budget",
  });
  const field = info.daily_budget ? "daily_budget" : info.lifetime_budget ? "lifetime_budget" : null;
  if (!field) throw new Error("A cópia não possui orçamento próprio neste nível; ajuste no nível que controla o orçamento.");
  const current = Number(info[field]) || 0;
  if (current <= 0) throw new Error("Orçamento atual inválido para ajuste seguro.");
  const next = Math.max(100, Math.round(current * (1 + percentDelta / 100)));
  await metaPost(objectId, token, { [field]: String(next) });
  return { field, from: current, to: next, percentDelta };
}

export function buildStrategicActionTools(ctx: Ctx) {
  const { supabase, workspaceId, userId } = ctx;

  return {
    duplicate_meta_object_safely: tool({
      description: "Duplica campanha, conjunto ou anúncio Meta preservando a configuração de origem. A cópia nasce PAUSED por padrão. Só altere orçamento, status, criativo ou tracking quando o usuário pedir explicitamente. Mudança percentual de orçamento é limitada a 20% por execução.",
      inputSchema: z.object({
        level: z.enum(["campaign", "adset", "ad"]),
        objectId: z.string().min(1),
        nameSuffix: z.string().max(80).default(" - cópia MKTOn"),
        finalStatus: z.enum(["PAUSED", "ACTIVE"]).default("PAUSED"),
        budgetPercentDelta: z.number().min(-20).max(20).default(0),
        creativeId: z.string().optional().describe("Somente para anúncio; omita para preservar o criativo original."),
        trackingSpecs: z.array(z.record(z.string(), z.unknown())).optional().describe("Somente para anúncio. Omita para preservar tracking original. Use apenas especificação explícita/revisada."),
      }),
      execute: async (input) => {
        if (input.level !== "ad" && (input.creativeId || input.trackingSpecs)) {
          throw new Error("Troca de criativo/tracking só é suportada no nível anúncio.");
        }

        const token = await loadToken(supabase, workspaceId);
        const source = await metaGet<MetaObjectInfo>(input.objectId, token, {
          fields: "id,name,account_id,status,effective_status,daily_budget,lifetime_budget,tracking_specs,creative{id}",
        });
        if (!source.account_id) throw new Error("A Meta não devolveu a conta proprietária do objeto.");
        const adAccountId = await assertAccountBelongsToWorkspace(supabase, workspaceId, source.account_id);

        const copyResponse = await metaPost<Record<string, unknown>>(`${input.objectId}/copies`, token, {
          ...(input.level !== "ad" ? { deep_copy: "true" } : {}),
          status_option: "PAUSED",
        });
        const newId = copiedId(input.level, copyResponse);
        if (!newId) throw new Error("A Meta confirmou a cópia, mas não devolveu o ID do novo objeto.");

        const changes: Record<string, unknown> = {};
        const sourceName = source.name ?? input.objectId;
        if (input.nameSuffix.trim()) {
          const name = `${sourceName}${input.nameSuffix}`.slice(0, 380);
          await metaPost(newId, token, { name });
          changes.name = name;
        }

        if (input.budgetPercentDelta !== 0) {
          changes.budget = await changeBudgetOnCopy(newId, input.budgetPercentDelta, token);
        }

        if (input.level === "ad" && input.creativeId) {
          const creative = await metaGet<{ account_id?: string }>(input.creativeId, token, { fields: "account_id" });
          if (!creative.account_id || creative.account_id.replace(/^act_/, "") !== source.account_id.replace(/^act_/, "")) {
            throw new Error("O criativo informado não pertence à mesma conta do anúncio de origem.");
          }
          await metaPost(newId, token, { creative: JSON.stringify({ creative_id: input.creativeId }) });
          changes.creativeId = input.creativeId;
        }

        if (input.level === "ad" && input.trackingSpecs) {
          await metaPost(newId, token, { tracking_specs: JSON.stringify(input.trackingSpecs) });
          changes.trackingSpecs = "explicitly_replaced";
        } else if (input.level === "ad") {
          changes.trackingSpecs = "preserved_from_source";
        }

        if (input.finalStatus === "ACTIVE") {
          await metaPost(newId, token, { status: "ACTIVE" });
          changes.status = "ACTIVE";
        } else {
          changes.status = "PAUSED";
        }

        const evidence = {
          sourceId: input.objectId,
          sourceName: source.name ?? null,
          sourceStatus: source.status ?? source.effective_status ?? null,
          sourceCreativeId: source.creative?.id ?? null,
          sourceTrackingPresent: Array.isArray(source.tracking_specs) ? source.tracking_specs.length > 0 : Boolean(source.tracking_specs),
          newId,
          adAccountId,
          changes,
          preservedByCopyEndpoint: true,
        };

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("meta_campaign_operations").insert({
            workspace_id: workspaceId,
            user_id: userId,
            ad_account_id: adAccountId,
            operation: `strategic_duplicate_${input.level}`,
            target_id: newId,
            request_payload: input as never,
            response_payload: evidence as never,
            status: "success",
            error_message: null,
          });
        } catch { /* a operação Meta já ocorreu; log é melhor esforço */ }

        return {
          ok: true,
          sourceId: input.objectId,
          newId,
          finalStatus: input.finalStatus,
          evidence,
          message: `Cópia criada ${input.finalStatus === "ACTIVE" ? "e ativada após os ajustes" : "em PAUSED para revisão"}.`,
        };
      },
    }),
  };
}
