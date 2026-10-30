// Monta um resumo compacto do estado atual do Gestor de Tráfego para incluir
// no system prompt do agente IA. Fase 8.1: só leitura de KPIs (sem tools).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type MetaAction = { action_type: string; value: string };
type MetaInsightRow = {
  spend?: string; impressions?: string; clicks?: string; ctr?: string;
  actions?: MetaAction[]; purchase_roas?: MetaAction[];
};

const GRAPH = "v20.0";

function sumAction(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  let n = 0;
  for (const a of actions) if (types.includes(a.action_type)) n += Number(a.value) || 0;
  return n;
}

async function metaGet<T>(path: string, token: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Meta ${path} ${r.status}`);
  return r.json() as Promise<T>;
}

/** Retorna um string enxuto com KPIs Meta do workspace nos últimos 7 dias. */
export async function buildGestorContext(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<string> {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) return "Contexto Meta indisponível (chave de criptografia ausente).";

  const { data: sec } = await supabase.rpc("get_integration_secret", {
    _workspace_id: workspaceId, _provider: "meta", _key: encKey,
  });
  const token = (sec as { access_token?: string } | null)?.access_token;
  if (!token) return "Contexto: Meta Ads NÃO conectado neste workspace.";

  const { data: accts } = await supabase.from("meta_ad_accounts")
    .select("account_id,name,currency").eq("workspace_id", workspaceId).limit(10);
  const accounts = (accts ?? []) as { account_id: string; name: string | null; currency: string | null }[];
  if (accounts.length === 0) return "Contexto: nenhuma conta de anúncios sincronizada.";

  let spend = 0, leads = 0, clicks = 0, impressions = 0;
  const perAccount: string[] = [];
  await Promise.all(accounts.map(async (a) => {
    try {
      const j = await metaGet<{ data: MetaInsightRow[] }>(`${a.account_id}/insights`, token, {
        date_preset: "last_7d", level: "account",
        fields: "spend,impressions,clicks,ctr,actions,purchase_roas",
      });
      const row = j.data?.[0];
      if (!row) return;
      const s = Number(row.spend) || 0;
      const imp = Number(row.impressions) || 0;
      const clk = Number(row.clicks) || 0;
      const lds = sumAction(row.actions, ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);
      spend += s; leads += lds; clicks += clk; impressions += imp;
      perAccount.push(`- ${a.name ?? a.account_id}: R$${s.toFixed(2)} / ${lds} leads / CPL R$${lds ? (s / lds).toFixed(2) : "-"}`);
    } catch { /* silencioso */ }
  }));

  // Top 3 campanhas por gasto
  const camps: string[] = [];
  try {
    const firstAcc = accounts[0].account_id;
    const cj = await metaGet<{ data: Array<{ id: string; name?: string; status?: string; effective_status?: string; insights?: { data?: MetaInsightRow[] } }> }>(
      `${firstAcc}/campaigns`, token,
      { fields: "id,name,status,effective_status,insights.date_preset(last_7d){spend,actions,purchase_roas}", limit: "10" },
    );
    for (const c of cj.data ?? []) {
      const ins = c.insights?.data?.[0];
      const s = Number(ins?.spend ?? 0) || 0;
      const lds = sumAction(ins?.actions, ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);
      camps.push(`  · ${c.name} [${c.effective_status ?? c.status}], R$${s.toFixed(2)} / ${lds} leads`);
    }
    camps.sort((a, b) => (Number(b.split("R$")[1]) || 0) - (Number(a.split("R$")[1]) || 0));
  } catch { /* ignore */ }

  return [
    `## Contexto atual, Meta Ads (últimos 7 dias)`,
    `Total: R$${spend.toFixed(2)} investidos · ${leads} leads · CPL médio R$${leads ? (spend / leads).toFixed(2) : "-"} · CTR ${impressions ? ((clicks / impressions) * 100).toFixed(2) : "0"}%`,
    `Por conta:`, ...perAccount,
    camps.length ? `\nCampanhas da conta ${accounts[0].name ?? accounts[0].account_id}:` : "",
    ...camps.slice(0, 5),
  ].filter(Boolean).join("\n");
}
