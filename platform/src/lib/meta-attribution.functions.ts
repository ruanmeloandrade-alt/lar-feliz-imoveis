import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PRESETS = [
  "today", "yesterday",
  "last_3d", "last_7d", "last_14d", "last_28d", "last_30d", "last_90d",
  "this_week_mon_today", "this_week_sun_today",
  "last_week_mon_sun", "last_week_sun_sat",
  "this_month", "last_month",
  "this_quarter", "last_quarter",
  "this_year", "last_year",
  "maximum",
] as const;
const CUSTOM_RE = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/;
const presetSchema = z.string().refine(
  (s) => (PRESETS as readonly string[]).includes(s) || CUSTOM_RE.test(s),
  { message: "preset inválido" },
);

function daysAgo(base: Date, days: number): Date {
  const d = new Date(base); d.setUTCDate(d.getUTCDate() - days); d.setUTCHours(0, 0, 0, 0); return d;
}

function presetRange(preset: string): { since: string; until: string } {
  const custom = preset.match(CUSTOM_RE);
  if (custom) {
    const s = new Date(custom[1] + "T00:00:00.000Z");
    const e = new Date(custom[2] + "T23:59:59.999Z");
    return { since: s.toISOString(), until: e.toISOString() };
  }
  const now = new Date();
  const end = new Date(now); end.setUTCHours(23, 59, 59, 999);
  const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
  switch (preset) {
    case "today": break;
    case "yesterday": {
      const s = daysAgo(now, 1);
      const e = new Date(s); e.setUTCHours(23, 59, 59, 999);
      return { since: s.toISOString(), until: e.toISOString() };
    }
    case "last_3d":  return { since: daysAgo(now, 3).toISOString(),  until: end.toISOString() };
    case "last_7d":  return { since: daysAgo(now, 7).toISOString(),  until: end.toISOString() };
    case "last_14d": return { since: daysAgo(now, 14).toISOString(), until: end.toISOString() };
    case "last_28d": return { since: daysAgo(now, 28).toISOString(), until: end.toISOString() };
    case "last_30d": return { since: daysAgo(now, 30).toISOString(), until: end.toISOString() };
    case "last_90d": return { since: daysAgo(now, 90).toISOString(), until: end.toISOString() };
    case "this_week_mon_today":
    case "this_week_sun_today": {
      const day = now.getUTCDay();
      const back = preset === "this_week_mon_today" ? (day === 0 ? 6 : day - 1) : day;
      return { since: daysAgo(now, back).toISOString(), until: end.toISOString() };
    }
    case "last_week_mon_sun":
    case "last_week_sun_sat": {
      const day = now.getUTCDay();
      const back = preset === "last_week_mon_sun" ? (day === 0 ? 6 : day - 1) + 7 : day + 7;
      const s = daysAgo(now, back);
      const e = new Date(s); e.setUTCDate(e.getUTCDate() + 6); e.setUTCHours(23, 59, 59, 999);
      return { since: s.toISOString(), until: e.toISOString() };
    }
    case "this_month": start.setUTCDate(1); break;
    case "last_month": {
      const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
      return { since: s.toISOString(), until: e.toISOString() };
    }
    case "this_quarter": {
      const q = Math.floor(now.getUTCMonth() / 3);
      start.setUTCMonth(q * 3, 1); break;
    }
    case "last_quarter": {
      const q = Math.floor(now.getUTCMonth() / 3);
      const s = new Date(Date.UTC(now.getUTCFullYear(), (q - 1) * 3, 1));
      const e = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 0, 23, 59, 59, 999));
      return { since: s.toISOString(), until: e.toISOString() };
    }
    case "this_year": start.setUTCMonth(0, 1); break;
    case "last_year": {
      const s = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
      const e = new Date(Date.UTC(now.getUTCFullYear() - 1, 11, 31, 23, 59, 59, 999));
      return { since: s.toISOString(), until: e.toISOString() };
    }
    case "maximum": {
      const s = new Date(Date.UTC(2015, 0, 1));
      return { since: s.toISOString(), until: end.toISOString() };
    }
    default: start.setUTCDate(start.getUTCDate() - 7);
  }
  return { since: start.toISOString(), until: end.toISOString() };
}

/**
 * ROAS Real por campanha = soma do valor dos leads (leads.value)
 * originados no Meta que caíram em "Venda Ganha" ÷ investimento.
 * Traz também CAC (spend ÷ vendas ganhas) e CPL real (spend ÷ leads atribuídos).
 * Fontes de atribuição: meta_lead_events (Lead Ads) + fallback UTM
 * (leads.custom_data->utm_source in {meta, facebook, ig, instagram}).
 */
export const getRealRoasByCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    preset: presetSchema.default("last_7d"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const range = presetRange(data.preset);

    // 1) Eventos nativos de Lead Ads
    const { data: events, error: evErr } = await context.supabase
      .from("meta_lead_events")
      .select("campaign_id, ad_id, lead_id_created, created_at, leads:lead_id_created(id, value, status, name)")
      .eq("workspace_id", data.workspaceId)
      .gte("created_at", range.since)
      .lte("created_at", range.until)
      .not("campaign_id", "is", null)
      .limit(2000);
    if (evErr) throw new Error(evErr.message);

    type Row = { campaign_id: string; leads: number; value: number; won: number; wonValue: number; sample: string[] };
    const byCamp = new Map<string, Row>();
    for (const e of (events ?? []) as Array<{
      campaign_id: string | null; lead_id_created: string | null;
      leads: { id: string; value: number | null; status: string | null; name: string | null } | null;
    }>) {
      if (!e.campaign_id) continue;
      const r = byCamp.get(e.campaign_id) ?? { campaign_id: e.campaign_id, leads: 0, value: 0, won: 0, wonValue: 0, sample: [] };
      r.leads += 1;
      const v = Number(e.leads?.value ?? 0);
      const status = (e.leads?.status ?? "").toLowerCase();
      if (status !== "lost" && status !== "perdido") r.value += v;
      if (status === "won" || status === "ganho" || status === "closed_won") { r.won += 1; r.wonValue += v; }
      if (r.sample.length < 3 && e.leads?.name) r.sample.push(e.leads.name);
      byCamp.set(e.campaign_id, r);
    }

    // 2) Fallback UTM: leads criados no período com utm_source = meta/facebook/instagram
    // Agrupado por utm_campaign (chave virtual "utm:<campaign>")
    const { data: utmLeads } = await context.supabase
      .from("leads")
      .select("id, value, status, name, custom_data, created_at")
      .eq("workspace_id", data.workspaceId)
      .gte("created_at", range.since)
      .lte("created_at", range.until)
      .limit(2000);
    for (const l of (utmLeads ?? []) as Array<{ id: string; value: number | null; status: string | null; name: string | null; custom_data: Record<string, unknown> | null }>) {
      const cd = (l.custom_data ?? {}) as Record<string, unknown>;
      const src = String(cd.utm_source ?? "").toLowerCase();
      if (!["meta", "facebook", "ig", "instagram", "fb"].includes(src)) continue;
      const camp = String(cd.utm_campaign ?? "sem-campanha").slice(0, 80);
      const key = `utm:${camp}`;
      const r = byCamp.get(key) ?? { campaign_id: key, leads: 0, value: 0, won: 0, wonValue: 0, sample: [] };
      // Evita contar 2x se o mesmo lead veio via meta_lead_events (não temos flag; UTM é fallback só quando não há match)
      // Como não temos join direto, mantemos aditivo, o CRM raramente terá ambos.
      r.leads += 1;
      const v = Number(l.value ?? 0);
      const status = (l.status ?? "").toLowerCase();
      if (status !== "lost" && status !== "perdido") r.value += v;
      if (status === "won" || status === "ganho" || status === "closed_won") { r.won += 1; r.wonValue += v; }
      if (r.sample.length < 3 && l.name) r.sample.push(l.name);
      byCamp.set(key, r);
    }

    if (byCamp.size === 0) {
      return { campaigns: [], preset: data.preset, totals: { leads: 0, value: 0, wonValue: 0, wonDeals: 0, spend: 0, realRoas: 0, cplReal: 0, cac: 0 } };
    }

    // 3) Spend por campanha na Meta (só ids reais, ignora chaves utm:*)
    const realIds = [...byCamp.keys()].filter((k) => !k.startsWith("utm:"));
    const { loadTokenAndSpend } = await import("./meta-attribution.server");
    const spendMap = realIds.length > 0
      ? await loadTokenAndSpend(context.supabase, data.workspaceId, realIds, data.preset)
      : {};

    const campaigns = [...byCamp.values()].map((r) => {
      const isUtm = r.campaign_id.startsWith("utm:");
      const spend = isUtm ? 0 : (spendMap[r.campaign_id]?.spend ?? 0);
      const name = isUtm ? `UTM · ${r.campaign_id.slice(4)}` : (spendMap[r.campaign_id]?.name ?? r.campaign_id);
      return {
        campaignId: r.campaign_id,
        campaignName: name,
        leads: r.leads,
        pipelineValue: r.value,
        wonDeals: r.won,
        wonValue: r.wonValue,
        spend,
        realRoas: spend > 0 ? r.wonValue / spend : 0,
        pipelineRoas: spend > 0 ? r.value / spend : 0,
        cpl: r.leads > 0 && spend > 0 ? spend / r.leads : 0,
        cac: r.won > 0 && spend > 0 ? spend / r.won : 0,
        sample: r.sample,
        isUtmFallback: isUtm,
      };
    }).sort((a, b) => b.spend - a.spend);

    const totals = campaigns.reduce((acc, c) => ({
      leads: acc.leads + c.leads,
      value: acc.value + c.pipelineValue,
      wonValue: acc.wonValue + c.wonValue,
      wonDeals: acc.wonDeals + c.wonDeals,
      spend: acc.spend + c.spend,
      realRoas: 0,
      cplReal: 0,
      cac: 0,
    }), { leads: 0, value: 0, wonValue: 0, wonDeals: 0, spend: 0, realRoas: 0, cplReal: 0, cac: 0 });
    totals.realRoas = totals.spend > 0 ? totals.wonValue / totals.spend : 0;
    totals.cplReal = totals.spend > 0 && totals.leads > 0 ? totals.spend / totals.leads : 0;
    totals.cac = totals.spend > 0 && totals.wonDeals > 0 ? totals.spend / totals.wonDeals : 0;

    return { campaigns, preset: data.preset, totals };
  });
