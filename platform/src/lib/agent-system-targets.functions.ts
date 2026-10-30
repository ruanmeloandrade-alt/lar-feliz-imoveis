/**
 * Alvos "de sistema" usados pelos seletores de ações/condições do Agente IA.
 *
 * Tudo aqui é dado REAL do workspace ativo (contas de anúncio Meta, campanhas
 * e posts do Social Media, sites/eventos do Tracking, fluxos de trabalho).
 * A UI só mostra o que existe — nada de digitar nome à mão.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = { from: (t: string) => any };

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  const wsId = (prof as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!wsId) throw new Error("Workspace ativo não encontrado.");
  return wsId;
}

export type AgentSystemTargets = {
  adAccounts: Array<{ id: string; name: string }>;
  socialCampaigns: Array<{ id: string; name: string }>;
  trackingSites: Array<{ id: string; name: string; events: string[] }>;
};

export const listAgentSystemTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgentSystemTargets> => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    const [accounts, campaigns, sites, events] = await Promise.all([
      sb.from("meta_ad_accounts").select("account_id,name").eq("workspace_id", wsId).order("name", { ascending: true }),
      sb.from("social_campaigns").select("id,name").eq("workspace_id", wsId).order("created_at", { ascending: false }).limit(100),
      sb.from("tracking_sites").select("id,name,domain").eq("workspace_id", wsId).order("created_at", { ascending: false }),
      sb.from("tracking_events").select("site_id,event_name").eq("workspace_id", wsId).order("created_at", { ascending: false }).limit(800),
    ]);

    const evBySite = new Map<string, Set<string>>();
    for (const e of ((events as { data?: Array<{ site_id: string | null; event_name: string }> }).data ?? [])) {
      const key = e.site_id ?? "";
      if (!key) continue;
      const set = evBySite.get(key) ?? new Set<string>();
      set.add(e.event_name);
      evBySite.set(key, set);
    }

    return {
      adAccounts: (((accounts as { data?: Array<{ account_id: string; name: string | null }> }).data ?? [])).map((a) => ({
        id: a.account_id,
        name: a.name?.trim() || a.account_id,
      })),
      socialCampaigns: (((campaigns as { data?: Array<{ id: string; name: string | null }> }).data ?? [])).map((c) => ({
        id: c.id,
        name: c.name?.trim() || "Campanha sem nome",
      })),
      trackingSites: (((sites as { data?: Array<{ id: string; name: string | null; domain: string | null }> }).data ?? [])).map((s) => ({
        id: s.id,
        name: s.name?.trim() || s.domain || "Site",
        events: Array.from(evBySite.get(s.id) ?? []).sort(),
      })),
    };
  });
