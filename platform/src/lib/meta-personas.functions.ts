import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertWorkspaceMember(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, workspaceId: string, userId: string,
) {
  const { data, error } = await supabase.from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso ao workspace.");
}

async function assertAdAccountInWorkspace(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, workspaceId: string, adAccountId: string,
) {
  const { data, error } = await supabase.from("meta_ad_accounts")
    .select("account_id")
    .eq("workspace_id", workspaceId)
    .eq("account_id", adAccountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Conta de anúncio não pertence a este workspace.");
}

const DetailedItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  path: z.array(z.string()).optional(),
});

const LocationItemSchema = z.object({
  key: z.string(),
  name: z.string(),
  type: z.string().optional(),
  country_code: z.string().optional(),
});

const DemographicsSchema = z.object({
  age_min: z.number().min(13).max(65).optional(),
  age_max: z.number().min(13).max(65).optional(),
  genders: z.array(z.number()).optional(), // 1=male, 2=female
});

const MapPinSchema = z.object({
  id: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  radius: z.number().min(1).max(80),
  mode: z.enum(["include", "exclude"]),
  name: z.string().optional(),
  address: z.string().optional(),
});

const CopyTemplateSchema = z.object({
  id: z.string(),
  label: z.string().max(120).optional().default(""),
  headline: z.string().max(255).optional().default(""),
  primary_text: z.string().max(4000).optional().default(""),
  description: z.string().max(500).optional().default(""),
  cta: z.string().max(60).optional().default(""),
});

const PersonaSchema = z.object({
  workspaceId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(4000).min(1, "Contexto é obrigatório"),
  adAccountId: z.string().min(1),
  linkedPageIds: z.array(z.string()).default([]),
  linkedIgIds: z.array(z.string()).default([]),
  linkedWaIds: z.array(z.string()).default([]),
  detailedTargeting: z.array(DetailedItemSchema).default([]),
  demographics: DemographicsSchema.default({}),
  locations: z.array(LocationItemSchema).default([]),
  mapPins: z.array(MapPinSchema).default([]),
  copyTemplates: z.array(CopyTemplateSchema).default([]),
  defaultObjective: z.string().max(60).optional().nullable(),
});


export const listPersonas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWorkspaceMember(context.supabase, data.workspaceId, context.userId);
    const { data: rows, error } = await context.supabase
      .from("meta_personas")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertPersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof PersonaSchema>) => PersonaSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertWorkspaceMember(context.supabase, data.workspaceId, context.userId);
    await assertAdAccountInWorkspace(context.supabase, data.workspaceId, data.adAccountId);
    const row = {
      workspace_id: data.workspaceId,
      name: data.name,
      description: data.description ?? null,
      ad_account_id: data.adAccountId,
      linked_page_ids: data.linkedPageIds,
      linked_ig_ids: data.linkedIgIds,
      linked_wa_ids: data.linkedWaIds,
      detailed_targeting: data.detailedTargeting,
      demographics: data.demographics,
      locations: data.locations,
      map_pins: data.mapPins,
      copy_templates: data.copyTemplates,
      default_objective: data.defaultObjective ?? null,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("meta_personas").update(row).eq("id", data.id).eq("workspace_id", data.workspaceId).select().maybeSingle();
      if (error) throw new Error(error.message);
      return updated;
    }
    const { data: inserted, error } = await context.supabase
      .from("meta_personas").insert({ ...row, created_by: context.userId }).select().maybeSingle();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const deletePersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWorkspaceMember(context.supabase, data.workspaceId, context.userId);
    const { error } = await context.supabase
      .from("meta_personas").delete().eq("id", data.id).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function loadMetaToken(supabase: unknown, workspaceId: string): Promise<string> {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) throw new Error("INTEGRATION_ENCRYPTION_KEY ausente.");
  const sb = supabase as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await sb.rpc("get_integration_secret", {
    _workspace_id: workspaceId, _provider: "meta", _key: encKey,
  });
  if (error) throw new Error(error.message);
  const token = (data as { access_token?: string } | null)?.access_token;
  if (!token) throw new Error("Meta não conectada neste workspace.");
  return token;
}

export const searchMetaDetailedTargeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid(), q: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWorkspaceMember(context.supabase, data.workspaceId, context.userId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    const url = new URL("https://graph.facebook.com/v23.0/search");
    url.searchParams.set("type", "adinterest");
    url.searchParams.set("q", data.q);
    url.searchParams.set("limit", "20");
    url.searchParams.set("access_token", token);
    const r = await fetch(url.toString());
    const txt = await r.text();
    if (!r.ok) throw new Error(`Meta: ${txt.slice(0, 300)}`);
    const j = JSON.parse(txt) as { data?: Array<{ id: string; name: string; path?: string[] }> };
    return { items: (j.data ?? []).map((it) => ({ id: it.id, name: it.name, type: "interests", path: it.path ?? [] })) };
  });

export const searchMetaGeoLocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid(), q: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWorkspaceMember(context.supabase, data.workspaceId, context.userId);
    const token = await loadMetaToken(context.supabase, data.workspaceId);
    const url = new URL("https://graph.facebook.com/v23.0/search");
    url.searchParams.set("type", "adgeolocation");
    url.searchParams.set("q", data.q);
    url.searchParams.set("limit", "15");
    url.searchParams.set("location_types", JSON.stringify(["country", "region", "city"]));
    url.searchParams.set("access_token", token);
    const r = await fetch(url.toString());
    const txt = await r.text();
    if (!r.ok) throw new Error(`Meta: ${txt.slice(0, 300)}`);
    const j = JSON.parse(txt) as { data?: Array<{ key: string; name: string; type: string; country_code?: string; region?: string }> };
    return { items: (j.data ?? []).map((it) => ({ key: it.key, name: `${it.name}${it.region ? `, ${it.region}` : ""}${it.country_code ? ` (${it.country_code})` : ""}`, type: it.type, country_code: it.country_code })) };
  });

export const listPersonaAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWorkspaceMember(context.supabase, data.workspaceId, context.userId);
    const [{ data: adAccounts }, { data: pages }, { data: igs }, { data: was }] = await Promise.all([
      context.supabase.from("meta_ad_accounts").select("account_id,name").eq("workspace_id", data.workspaceId).order("name"),
      context.supabase.from("meta_pages").select("page_id,page_name").eq("workspace_id", data.workspaceId).order("page_name"),
      context.supabase.from("meta_instagram_accounts").select("instagram_id,username").eq("workspace_id", data.workspaceId).order("username"),
      context.supabase.from("whatsapp_web_sessions").select("id,push_name,phone_number").eq("workspace_id", data.workspaceId),
    ]);
    return {
      adAccounts: (adAccounts ?? []).map((a: { account_id: string; name: string | null }) => ({ id: a.account_id, name: a.name ?? a.account_id })),
      pages: (pages ?? []).map((p: { page_id: string; page_name: string | null }) => ({ id: p.page_id, name: p.page_name ?? p.page_id })),
      instagrams: (igs ?? []).map((i: { instagram_id: string; username: string | null }) => ({ id: i.instagram_id, name: i.username ?? i.instagram_id })),
      whatsapps: (was ?? []).map((w: { id: string; push_name: string | null; phone_number: string | null }) => ({ id: w.id, name: w.push_name ? `${w.push_name}${w.phone_number ? ` · ${w.phone_number}` : ""}` : (w.phone_number ?? w.id) })),
    };
  });
