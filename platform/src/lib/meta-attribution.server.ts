// Helpers server-only para atribuição CRM ↔ Meta Ads.
// Nunca importar de código do cliente.

const GRAPH = "v23.0";

async function metaGet<T>(path: string, token: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Meta ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

export async function loadTokenAndSpend(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workspaceId: string,
  campaignIds: string[],
  preset: string,
): Promise<Record<string, { spend: number; name: string }>> {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) return {};
  const { data: sec } = await supabase.rpc("get_integration_secret", {
    _workspace_id: workspaceId, _provider: "meta", _key: encKey,
  });
  const token = (sec as { access_token?: string } | null)?.access_token;
  if (!token) return {};

  const out: Record<string, { spend: number; name: string }> = {};
  await Promise.all(campaignIds.map(async (id) => {
    try {
      const info = await metaGet<{ name?: string; insights?: { data?: Array<{ spend?: string }> } }>(
        id, token,
        { fields: `name,${(() => { const m = preset.match(/^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/); return m ? `insights.time_range({'since':'${m[1]}','until':'${m[2]}'}){spend}` : `insights.date_preset(${preset}){spend}`; })()}` },
      );
      out[id] = { spend: Number(info.insights?.data?.[0]?.spend) || 0, name: info.name || id };
    } catch {
      out[id] = { spend: 0, name: id };
    }
  }));
  return out;
}
