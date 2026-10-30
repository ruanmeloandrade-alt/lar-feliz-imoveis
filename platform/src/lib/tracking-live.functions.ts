// Tracking, leituras/gravações para a UI do módulo Tracking.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WorkspaceOnly = z.object({ workspaceId: z.string().uuid() });

async function assertMember(supabase: unknown, workspaceId: string, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const { data, error } = await s
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a este workspace");
}

// ============ OVERVIEW ============
export const getTrackingOverview = createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((d:unknown)=>WorkspaceOnly.parse(d))
 .handler(async({data,context})=>{
   await assertMember(context.supabase,data.workspaceId,context.userId);
   const {loadSlimTrackingOverview}=await import("@/lib/slim-tracking-overview.server");
   return loadSlimTrackingOverview(context.supabase as never,data.workspaceId);
 });

// ============ EVENTS LIST ============
const ListEventsSchema = z.object({
  workspaceId: z.string().uuid(),
  q: z.string().optional().default(""),
  limit: z.number().int().min(1).max(500).optional().default(100),
});
export const listTrackingEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListEventsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (supabase as any).from("tracking_events")
      .select("id, event_name, page_path, page_url, utm_source, utm_medium, utm_campaign, value, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.q) q = q.or(`event_name.ilike.%${data.q}%,page_path.ilike.%${data.q}%,utm_campaign.ilike.%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ============ UTM RANKING ============
export const listUtmRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = supabase;
    const [eventResult, conversionResult] = await Promise.all([
      s.from("tracking_events")
        .select("id, utm_source, utm_medium, utm_campaign, event_name, session_id")
        .eq("workspace_id", data.workspaceId)
        .gte("created_at", since)
        .limit(20000),
      s.from("tracking_conversion_events")
        .select("event_row_id, utm_source, utm_campaign, value, currency")
        .eq("workspace_id", data.workspaceId)
        .gte("created_at", since)
        .limit(20000),
    ]);
    if (eventResult.error) throw new Error(eventResult.error.message);
    if (conversionResult.error) throw new Error(conversionResult.error.message);

    type EventRow = {
      id: number;
      utm_source: string | null;
      utm_medium: string | null;
      utm_campaign: string | null;
      event_name: string;
      session_id: string | null;
    };
    type ConversionRow = {
      event_row_id: number | null;
      utm_source: string | null;
      utm_campaign: string | null;
      value: number | null;
      currency: string | null;
    };
    type Rank = {
      source: string;
      medium: string;
      campaign: string;
      sessions: Set<string>;
      leads: number;
      conversions: number;
      value: number;
    };

    const map = new Map<string, Rank>();
    const eventKeyById = new Map<number, string>();
    const ensure = (source: string | null, medium: string | null, campaign: string | null) => {
      const key = `${source ?? "-"}|${medium ?? "-"}|${campaign ?? "-"}`;
      if (!map.has(key)) {
        map.set(key, {
          source: source ?? "-",
          medium: medium ?? "-",
          campaign: campaign ?? "-",
          sessions: new Set<string>(),
          leads: 0,
          conversions: 0,
          value: 0,
        });
      }
      return { key, row: map.get(key)! };
    };

    for (const r of (eventResult.data ?? []) as EventRow[]) {
      if (!r.utm_source && !r.utm_campaign) continue;
      const { key, row } = ensure(r.utm_source, r.utm_medium, r.utm_campaign);
      eventKeyById.set(r.id, key);
      if (r.session_id) row.sessions.add(r.session_id);
      if (r.event_name === "lead" || r.event_name === "form_submit" || r.event_name === "cadastro") row.leads += 1;
    }

    for (const conversion of (conversionResult.data ?? []) as ConversionRow[]) {
      let row: Rank | undefined;
      if (conversion.event_row_id != null) {
        const eventKey = eventKeyById.get(conversion.event_row_id);
        if (eventKey) row = map.get(eventKey);
      }
      if (!row) row = ensure(conversion.utm_source, null, conversion.utm_campaign).row;
      row.conversions += 1;
      if (String(conversion.currency ?? "BRL").toUpperCase() === "BRL") {
        row.value += Number(conversion.value ?? 0);
      }
    }

    return [...map.values()]
      .map((v) => ({
        source: v.source,
        medium: v.medium,
        campaign: v.campaign,
        sessions: v.sessions.size,
        leads: v.leads,
        conversions: v.conversions,
        value: v.value,
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 50);
  });

// ============ CONVERSIONS CRUD ============
export const listConversions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    const { data: rows, error } = await supabase.from("tracking_conversions").select("*")
      .eq("workspace_id", data.workspaceId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const UpsertConv = z.object({
  workspaceId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  eventName: z.string().min(1).max(60),
  defaultValue: z.number().optional().nullable(),
  currency: z.string().length(3).optional().default("BRL"),
  active: z.boolean().optional().default(true),
});
export const upsertConversion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertConv.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    const payload = {
      workspace_id: data.workspaceId,
      name: data.name,
      event_name: data.eventName,
      default_value: data.defaultValue ?? null,
      currency: data.currency ?? "BRL",
      active: data.active ?? true,
      created_by: userId,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = supabase;
    if (data.id) {
      const { data: row, error } = await client.from("tracking_conversions").update(payload).eq("id", data.id).eq("workspace_id", data.workspaceId).select("*").single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await client.from("tracking_conversions").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteConversion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    const { error } = await supabase.from("tracking_conversions").delete().eq("id", data.id).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ EVENT NAMES DISTINCT (para o seletor de conversão) ============
export const listDistinctEventNames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any).from("tracking_events")
      .select("event_name").eq("workspace_id", data.workspaceId).gte("created_at", since).limit(5000);
    if (error) throw new Error(error.message);
    const set = new Set<string>(["page_view","click","whatsapp_click","phone_click","lead","form_submit","purchase","checkout","conversion"]);
    for (const r of (rows ?? []) as Array<{ event_name: string }>) set.add(r.event_name);
    return [...set].sort();
  });

// ============ WHATSAPP CALLS ============
export const listWhatsappCalls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    const { data: rows, error } = await supabase.from("whatsapp_call_events").select("*")
      .eq("workspace_id", data.workspaceId).order("started_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// SLIM_TRACKING_OVERVIEW_V1
