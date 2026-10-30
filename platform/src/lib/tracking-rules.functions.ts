// Tracking, regras de evento do pixel (cliques, formulários, scroll, tempo, URL).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export const listEventRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any)
      .from("tracking_event_rules")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const UpsertRule = z.object({
  workspaceId: z.string().uuid(),
  id: z.string().uuid().optional(),
  siteId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
  eventName: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/i, "Use letras, números e _"),
  triggerType: z.enum(["click", "form", "url", "scroll", "time"]),
  selector: z.string().max(300).nullable().optional(),
  matchText: z.string().max(200).nullable().optional(),
  urlContains: z.string().max(300).nullable().optional(),
  threshold: z.number().int().min(1).max(3600).nullable().optional(),
  value: z.number().nullable().optional(),
  oncePerSession: z.boolean().optional().default(false),
  active: z.boolean().optional().default(true),
});

export const upsertEventRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertRule.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    const payload = {
      workspace_id: data.workspaceId,
      site_id: data.siteId ?? null,
      name: data.name,
      event_name: data.eventName,
      trigger_type: data.triggerType,
      selector: data.selector || null,
      match_text: data.matchText || null,
      url_contains: data.urlContains || null,
      threshold: data.threshold ?? null,
      value: data.value ?? null,
      once_per_session: data.oncePerSession ?? false,
      active: data.active ?? true,
      created_by: userId,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = supabase;
    if (data.id) {
      const { data: row, error } = await client
        .from("tracking_event_rules")
        .update(payload)
        .eq("id", data.id)
        .eq("workspace_id", data.workspaceId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await client.from("tracking_event_rules").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteEventRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("tracking_event_rules")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Verifica a instalação do pixel num domínio: busca o HTML da página e confere
 * se o script px.js com o workspace certo está presente, e cruza com os
 * eventos já recebidos. Roda no servidor (sem CORS).
 */
export const verifyPixelInstall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), siteId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, data.workspaceId, userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = supabase;
    const { data: site, error } = await client
      .from("tracking_sites")
      .select("*")
      .eq("id", data.siteId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!site) throw new Error("Site não encontrado");

    let snippetFound = false;
    let httpOk = false;
    let httpError: string | null = null;
    try {
      const res = await fetch(`https://${site.domain}/`, {
        redirect: "follow",
        headers: { "user-agent": "MKTOnPixelVerifier/1.0" },
      });
      httpOk = res.ok;
      const html = await res.text();
      snippetFound = html.includes("track/px.js") && html.includes(data.workspaceId);
    } catch (e) {
      httpError = e instanceof Error ? e.message : String(e);
    }

    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { count } = await client
      .from("tracking_events")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId)
      .eq("site_id", data.siteId)
      .gte("created_at", since);

    const eventsCount = count ?? 0;

    if (snippetFound && !site.verified && eventsCount === 0) {
      // Snippet presente mas sem evento ainda, mantém pendente, sem marcar verificado.
    }

    return {
      domain: site.domain as string,
      httpOk,
      httpError,
      snippetFound,
      eventsCount,
      verified: Boolean(site.verified),
      lastEventAt: (site.last_event_at as string | null) ?? null,
    };
  });
