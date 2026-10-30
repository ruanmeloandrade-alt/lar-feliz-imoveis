type SupabaseLike = {
  from: (table: string) => any;
};

export type ObjectiveTrackingOption = {
  siteId: string;
  siteName: string;
  domain: string;
  verified: boolean;
  lastEventAt: string | null;
  events: Array<{
    name: string;
    label: string;
    source: "received" | "rule" | "crm" | "meta";
    lastSeenAt: string | null;
  }>;
};

export async function loadObjectiveTrackingOptions(
  supabase: SupabaseLike,
  workspaceId: string,
  userId: string,
): Promise<ObjectiveTrackingOption[]> {
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if (!membership) throw new Error("Sem acesso a este workspace");

  const [
    { data: sites, error: sitesError },
    { data: rules, error: rulesError },
    { data: siteEvents, error: siteEventsError },
    { data: crmEvents, error: crmEventsError },
    { data: metaAccounts, error: metaAccountsError }
  ] = await Promise.all([
    supabase
      .from("tracking_sites")
      .select("id,name,domain,verified,last_event_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tracking_event_rules")
      .select("site_id,name,event_name,active")
      .eq("workspace_id", workspaceId)
      .eq("active", true),
    supabase
      .from("tracking_events")
      .select("site_id,event_name,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("tracking_conversion_events")
      .select("event_name,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("meta_ad_accounts")
      .select("account_id, name")
      .eq("workspace_id", workspaceId)
  ]);

  if (sitesError) throw new Error(sitesError.message);
  if (rulesError) throw new Error(rulesError.message);
  if (siteEventsError) throw new Error(siteEventsError.message);
  if (crmEventsError) throw new Error(crmEventsError.message);
  if (metaAccountsError) throw new Error(metaAccountsError.message);

  const options: ObjectiveTrackingOption[] = [];

  // 1. Sites de Tracking (Pixel)
  const rulesBySite = new Map<string, Map<string, string>>();
  for (const rule of rules ?? []) {
    if (!rule.site_id || !rule.event_name) continue;
    const map = rulesBySite.get(rule.site_id) ?? new Map<string, string>();
    map.set(rule.event_name, rule.name || rule.event_name);
    rulesBySite.set(rule.site_id, map);
  }

  const receivedBySite = new Map<string, Map<string, string>>();
  for (const event of siteEvents ?? []) {
    if (!event.site_id || !event.event_name) continue;
    const map = receivedBySite.get(event.site_id) ?? new Map<string, string>();
    if (!map.has(event.event_name)) map.set(event.event_name, event.created_at);
    receivedBySite.set(event.site_id, map);
  }

  for (const site of (sites ?? [])) {
    const received = receivedBySite.get(site.id) ?? new Map<string, string>();
    const configured = rulesBySite.get(site.id) ?? new Map<string, string>();
    const names = new Set([...received.keys(), ...configured.keys()]);
    options.push({
      siteId: site.id,
      siteName: `[Pixel] ${site.name}`,
      domain: site.domain,
      verified: Boolean(site.verified),
      lastEventAt: site.last_event_at ?? null,
      events: [...names].map((name) => ({
        name,
        label: configured.get(name) ?? name,
        source: received.has(name) ? ("received" as const) : ("rule" as const),
        lastSeenAt: received.get(name) ?? null,
      })).sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "")),
    });
  }

  // 2. Módulo CRM / CAPI (tracking_conversion_events)
  if (crmEvents && crmEvents.length > 0) {
    const crmReceived = new Map<string, string>();
    for (const e of crmEvents) {
      if (!crmReceived.has(e.event_name)) crmReceived.set(e.event_name, e.created_at);
    }
    options.push({
      siteId: "crm-capi",
      siteName: "Módulo CRM & Conversões (CAPI)",
      domain: "MKTOn Offline Events",
      verified: true,
      lastEventAt: crmEvents[0].created_at,
      events: [...crmReceived.keys()].map(name => ({
        name,
        label: name,
        source: "crm" as const,
        lastSeenAt: crmReceived.get(name) ?? null
      }))
    });
  }

  // 3. Módulo Tráfego / Meta Ads (Métricas do Gerenciador)
  for (const acc of (metaAccounts ?? [])) {
    if (!acc.account_id) continue;
    options.push({
      siteId: `meta-${acc.account_id}`,
      siteName: `[Tráfego] ${acc.name || acc.account_id}`,
      domain: `Meta Ads: ${acc.account_id}`,
      verified: true,
      lastEventAt: null,
      events: [
        { name: "meta-spend", label: "Gasto diário detectado", source: "meta", lastSeenAt: null },
        { name: "meta-leads", label: "Leads detectados (Ads)", source: "meta", lastSeenAt: null },
        { name: "meta-cpl-limit", label: "CPL acima do limite", source: "meta", lastSeenAt: null },
        { name: "meta-roas-limit", label: "ROAS abaixo do limite", source: "meta", lastSeenAt: null }
      ]
    });
  }

  return options;
}
