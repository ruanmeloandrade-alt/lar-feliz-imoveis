/**
 * Dados reais do sistema entregues ao Agente IA (leitura) e execução de ações
 * que tocam outros módulos (escrita).
 *
 * Multi-tenant: tudo é filtrado por workspace_id. Nada é inventado — se a
 * integração não existir, o bloco diz que não há dado disponível.
 */

type AnySb = {
  from: (t: string) => any;
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const GRAPH = "v21.0";

function periodToPreset(period?: string): { preset: string; days: number; label: string } {
  switch (period) {
    case "hoje": return { preset: "today", days: 1, label: "hoje" };
    case "ontem": return { preset: "yesterday", days: 1, label: "ontem" };
    case "30d": return { preset: "last_30d", days: 30, label: "últimos 30 dias" };
    default: return { preset: "last_7d", days: 7, label: "últimos 7 dias" };
  }
}

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function loadMetaToken(sb: AnySb, workspaceId: string): Promise<string | null> {
  const encKey = process.env["INTEGRATION_ENCRYPTION_KEY"];
  if (!encKey) return null;
  try {
    const { data } = await sb.rpc("get_integration_secret_service", {
      _workspace_id: workspaceId, _provider: "meta", _key: encKey,
    });
    const token = (data as { access_token?: string } | null)?.access_token;
    return token ?? null;
  } catch {
    return null;
  }
}

/** KPIs reais de tráfego (Meta Ads) da conta escolhida. */
export async function loadTrafficSummary(
  sb: AnySb,
  workspaceId: string,
  cfg: { accountId?: string; period?: string },
): Promise<string> {
  const token = await loadMetaToken(sb, workspaceId);
  if (!token) return "TRÁFEGO (Meta Ads): a conta de anúncios não está conectada neste workspace — não afirme números de tráfego.";

  let accountId = cfg.accountId?.trim();
  if (!accountId) {
    const { data } = await sb.from("meta_ad_accounts").select("account_id").eq("workspace_id", workspaceId).limit(1);
    accountId = (data as Array<{ account_id: string }> | null)?.[0]?.account_id;
  }
  if (!accountId) return "TRÁFEGO (Meta Ads): nenhuma conta de anúncio sincronizada.";

  const { preset, label } = periodToPreset(cfg.period);
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH}/${accountId}/insights`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("date_preset", preset);
    url.searchParams.set("fields", "spend,impressions,clicks,ctr,cpc,actions,action_values");
    const r = await fetch(url.toString());
    if (!r.ok) return `TRÁFEGO (Meta Ads): não consegui ler os dados agora (${r.status}). Não invente números.`;
    const j = (await r.json()) as { data?: Array<Record<string, unknown>> };
    const row = j.data?.[0];
    if (!row) return `TRÁFEGO (Meta Ads, ${label}): sem veiculação registrada no período.`;

    const spend = Number(row["spend"] ?? 0);
    const clicks = Number(row["clicks"] ?? 0);
    const impressions = Number(row["impressions"] ?? 0);
    const ctr = Number(row["ctr"] ?? 0);
    const actions = (row["actions"] as Array<{ action_type: string; value: string }> | undefined) ?? [];
    const values = (row["action_values"] as Array<{ action_type: string; value: string }> | undefined) ?? [];
    const leads = Number(actions.find((a) => a.action_type === "lead")?.value ?? 0);
    const compras = Number(actions.find((a) => a.action_type.includes("purchase"))?.value ?? 0);
    const receita = Number(values.find((a) => a.action_type.includes("purchase"))?.value ?? 0);
    const cpl = leads > 0 ? spend / leads : 0;
    const roas = spend > 0 ? receita / spend : 0;

    return [
      `TRÁFEGO REAL (Meta Ads, conta ${accountId}, ${label}):`,
      `- Investimento: ${brl(spend)}`,
      `- Impressões: ${impressions} | Cliques: ${clicks} | CTR: ${ctr.toFixed(2)}%`,
      `- Leads: ${leads}${leads > 0 ? ` | CPL: ${brl(cpl)}` : ""}`,
      `- Compras: ${compras} | Receita: ${brl(receita)} | ROAS: ${roas.toFixed(2)}`,
    ].join("\n");
  } catch (e) {
    return `TRÁFEGO (Meta Ads): falha ao consultar (${(e as Error).message}). Não invente números.`;
  }
}

/** Agenda e produção reais do Social Media. */
export async function loadSocialSummary(
  sb: AnySb,
  workspaceId: string,
  cfg: { escopo?: string; campaignId?: string; dias?: number },
): Promise<string> {
  const dias = cfg.dias ?? 14;
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const ate = new Date(Date.now() + dias * 86_400_000).toISOString();

  let q = sb.from("social_posts")
    .select("title,status,scheduled_at,published_at,campaign_id")
    .eq("workspace_id", workspaceId)
    .order("scheduled_at", { ascending: true })
    .limit(40);
  if (cfg.campaignId) q = q.eq("campaign_id", cfg.campaignId);
  if (cfg.escopo === "publicados") q = q.eq("status", "published").gte("published_at", desde);
  else q = q.in("status", ["scheduled", "approved", "publishing"]).lte("scheduled_at", ate);

  const { data } = await q;
  const rows = (data ?? []) as Array<{ title: string | null; status: string; scheduled_at: string | null; published_at: string | null }>;
  if (!rows.length) return `SOCIAL MEDIA: nenhum post ${cfg.escopo === "publicados" ? "publicado" : "agendado"} nesse intervalo.`;

  const linhas = rows.slice(0, 12).map((p) => {
    const quando = p.published_at ?? p.scheduled_at;
    const data = quando ? new Date(quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "sem data";
    return `- ${p.title?.trim() || "Post sem título"} — ${p.status} — ${data}`;
  });
  return `SOCIAL MEDIA REAL (${rows.length} post(s)):\n${linhas.join("\n")}`;
}

/** Eventos reais do Tracking (pixel MKTOn, CAPI, CRM e Ads) para o lead ou para o site. */
export async function loadTrackingSummary(
  sb: AnySb,
  workspaceId: string,
  leadId: string | null,
  cfg: { siteId?: string; event?: string; dias?: number },
): Promise<string> {
  const dias = cfg.dias ?? 30;
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  
  // 1. Eventos de Site/Pixel (tracking_events)
  const qTracking = sb.from("tracking_events")
    .select("event_name,created_at,page_url,site_id,lead_id")
    .eq("workspace_id", workspaceId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(20);
  if (cfg.siteId && !cfg.siteId.startsWith("crm-") && !cfg.siteId.startsWith("meta-")) {
    qTracking.eq("site_id", cfg.siteId);
  }
  if (cfg.event && !cfg.event.startsWith("meta-")) qTracking.eq("event_name", cfg.event);
  if (leadId) qTracking.eq("lead_id", leadId);

  // 2. Eventos de Conversão CAPI / Offline (lead_tracking_events)
  const qCapi = sb.from("lead_tracking_events")
    .select("event_name,created_at,value,currency")
    .eq("workspace_id", workspaceId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(20);
  if (leadId) qCapi.eq("lead_id", leadId);
  if (cfg.event && !cfg.event.startsWith("meta-")) qCapi.eq("event_name", cfg.event);

  const [resTracking, resCapi] = await Promise.all([qTracking, qCapi]);
  
  const rowsTracking = (resTracking.data ?? []) as Array<{ event_name: string; created_at: string; page_url: string | null }>;
  const rowsCapi = (resCapi.data ?? []) as Array<{ event_name: string; created_at: string; value: number | null; currency: string | null }>;

  const linhas: string[] = [];
  
  // 3. Métricas de Tráfego (Meta Ads) - Integração com Módulo Tracking
  if (!leadId || (cfg.siteId && cfg.siteId.startsWith("meta-"))) {
    const accId = cfg.siteId?.startsWith("meta-") ? cfg.siteId.replace("meta-", "") : undefined;
    const traffic = await loadTrafficSummary(sb, workspaceId, { accountId: accId, period: `${dias}d` });
    if (!traffic.includes("não está conectada") && !traffic.includes("nenhuma conta")) {
      linhas.push("MÉTRICAS DE PERFORMANCE (ADS) DO MÓDULO:");
      linhas.push(traffic);
      linhas.push("");
    }
  }

  if (rowsTracking.length) {
    linhas.push("EVENTOS DE SITE / PIXEL:");
    rowsTracking.slice(0, 10).forEach(e => 
      linhas.push(`- ${e.event_name} em ${new Date(e.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}${e.page_url ? ` (${e.page_url})` : ""}`)
    );
  }

  if (rowsCapi.length) {
    if (linhas.length) linhas.push("");
    linhas.push("EVENTOS DE CONVERSÃO / CRM / CAPI:");
    rowsCapi.slice(0, 10).forEach(e => 
      linhas.push(`- ${e.event_name} em ${new Date(e.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}${e.value ? ` (Valor: ${e.value} ${e.currency ?? "BRL"})` : ""}`)
    );
  }

  if (!linhas.length) {
    return `MÓDULO DE TRACKING: nenhum evento (site, CRM ou tráfego) registrado nos últimos ${dias} dias.`;
  }

  return `MÓDULO DE TRACKING CONSOLIDADO (${rowsTracking.length + rowsCapi.length} eventos + métricas Ads):\n${linhas.join("\n")}`;
}

/** Tarefas reais do Fluxo de Trabalho ligadas a este lead. */
export async function loadWorkflowSummary(
  sb: AnySb,
  workspaceId: string,
  leadId: string | null,
): Promise<string> {
  void leadId;
  const { data } = await sb.from("workflow_tasks")
    .select("title,status,priority,due_at")
    .eq("workspace_id", workspaceId)
    .neq("status", "concluida")
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = (data ?? []) as Array<{ title: string | null; status: string | null; priority: string | null; due_at: string | null }>;
  if (!rows.length) return "FLUXO DE TRABALHO: nenhuma tarefa aberta no momento.";
  const linhas = rows.slice(0, 10).map((t) =>
    `- ${t.title?.trim() || "Tarefa"} — ${t.status ?? "aberta"}${t.priority ? ` (${t.priority})` : ""}${t.due_at ? ` — prazo ${new Date(t.due_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}`,
  );
  return `FLUXO DE TRABALHO REAL (${rows.length} tarefa(s)):\n${linhas.join("\n")}`;
}

function parseJsonTarget(target: unknown): Record<string, unknown> {
  if (typeof target !== "string") return {};
  const raw = target.trim();
  if (!raw.startsWith("{")) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

/**
 * Monta o bloco de contexto do sistema conforme as ações/condições que o
 * agente realmente usa (não carrega o que não foi pedido).
 */
export async function buildAgentSystemDataBlock(
  sb: AnySb,
  workspaceId: string,
  leadId: string | null,
  meta: unknown,
): Promise<string> {
  let serialized = "";
  try { serialized = JSON.stringify(meta ?? {}); } catch { serialized = ""; }
  if (!serialized) return "";

  const wantsTrafego = serialized.includes("consultar-trafego") || serialized.includes("trafego-");
  const wantsSocial = serialized.includes("consultar-social") || serialized.includes("social-");
  const wantsTracking = serialized.includes("consultar-tracking") || serialized.includes("tracking-evento") || serialized.includes('"kind":"tracking"');
  const wantsWorkflow = serialized.includes("criar-tarefa-workflow") || serialized.includes("consultar-workflow") || serialized.includes("workflow-");
  if (!wantsTrafego && !wantsSocial && !wantsTracking && !wantsWorkflow) return "";

  // Extrai a primeira configuração de cada tipo para respeitar conta/período escolhidos.
  const cfgs: Record<string, Record<string, unknown>> = {};
  const scan = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const action = (obj["action"] ?? (obj["do"] as Record<string, unknown> | undefined)?.["action"]) as string | undefined;
    if (action && /^consultar-(trafego|social|tracking|workflow)$/.test(action)) {
      const target = obj["target"] ?? (obj["do"] as Record<string, unknown> | undefined)?.["target"];
      cfgs[action] = { ...parseJsonTarget(target), ...(cfgs[action] ?? {}) };
    }
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) v.forEach(scan);
      else if (v && typeof v === "object") scan(v);
    }
  };
  scan(meta);

  const parts: string[] = [];
  const jobs: Array<Promise<string>> = [];
  if (wantsTrafego) jobs.push(loadTrafficSummary(sb, workspaceId, cfgs["consultar-trafego"] ?? {}));
  if (wantsSocial) jobs.push(loadSocialSummary(sb, workspaceId, cfgs["consultar-social"] ?? {}));
  if (wantsTracking) jobs.push(loadTrackingSummary(sb, workspaceId, leadId, cfgs["consultar-tracking"] ?? {}));
  if (wantsWorkflow) jobs.push(loadWorkflowSummary(sb, workspaceId, leadId));

  for (const r of await Promise.allSettled(jobs)) {
    if (r.status === "fulfilled" && r.value) parts.push(r.value);
  }
  if (!parts.length) return "";
  return [
    "DADOS REAIS DO SISTEMA MKTOn (medidos agora; use estes números nas condições e nunca invente outros):",
    ...parts,
  ].join("\n\n");
}

/**
 * Métricas numéricas reais usadas pelas regras condicionais
 * (Se "Tráfego: CPL" > 30 → faça X). Só consulta o que as regras pedem.
 */
export async function loadSystemMetrics(
  sb: AnySb,
  workspaceId: string,
  leadId: string | null,
  fields: string[],
): Promise<Record<string, number>> {
  const wanted = new Set(fields.filter((f) => /^(trafego|social|workflow|tracking)-/.test(f)));
  if (!wanted.size) return {};
  const out: Record<string, number> = {};

  const precisaTrafego = [...wanted].some((f) => f.startsWith("trafego-"));
  if (precisaTrafego) {
    const token = await loadMetaToken(sb, workspaceId);
    const { data } = await sb.from("meta_ad_accounts").select("account_id").eq("workspace_id", workspaceId).limit(1);
    const accountId = (data as Array<{ account_id: string }> | null)?.[0]?.account_id;
    if (token && accountId) {
      try {
        const url = new URL(`https://graph.facebook.com/${GRAPH}/${accountId}/insights`);
        url.searchParams.set("access_token", token);
        url.searchParams.set("date_preset", "last_7d");
        url.searchParams.set("fields", "spend,actions,action_values");
        const r = await fetch(url.toString());
        if (r.ok) {
          const j = (await r.json()) as { data?: Array<Record<string, unknown>> };
          const row = j.data?.[0] ?? {};
          const spend = Number(row["spend"] ?? 0);
          const actions = (row["actions"] as Array<{ action_type: string; value: string }> | undefined) ?? [];
          const values = (row["action_values"] as Array<{ action_type: string; value: string }> | undefined) ?? [];
          const leads = Number(actions.find((a) => a.action_type === "lead")?.value ?? 0);
          const receita = Number(values.find((a) => a.action_type.includes("purchase"))?.value ?? 0);
          out["trafego-investimento"] = spend;
          out["trafego-leads"] = leads;
          out["trafego-cpl"] = leads > 0 ? spend / leads : 0;
          out["trafego-roas"] = spend > 0 ? receita / spend : 0;
        }
      } catch { /* sem número é melhor que número inventado */ }
    }
  }

  if (wanted.has("social-agendados") || wanted.has("social-publicados")) {
    const [ag, pub] = await Promise.all([
      sb.from("social_posts").select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId).in("status", ["scheduled", "approved"]),
      sb.from("social_posts").select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId).eq("status", "published"),
    ]);
    out["social-agendados"] = Number((ag as { count?: number }).count ?? 0);
    out["social-publicados"] = Number((pub as { count?: number }).count ?? 0);
  }

  if (wanted.has("workflow-tarefas-abertas")) {
    const res = await sb.from("workflow_tasks").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).neq("status", "concluida");
    out["workflow-tarefas-abertas"] = Number((res as { count?: number }).count ?? 0);
  }

  if (wanted.has("tracking-eventos")) {
    let q = sb.from("tracking_events").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
    if (leadId) q = q.eq("lead_id", leadId);
    const res = await q;
    out["tracking-eventos"] = Number((res as { count?: number }).count ?? 0);
  }

  return out;
}
