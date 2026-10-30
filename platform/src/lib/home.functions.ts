import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";

export type HomeHealthState = "ok" | "attention" | "off" | "unavailable";
export type HomeHealthItem = {
  id: "crm" | "whatsapp" | "meta" | "facebook" | "instagram" | "messenger" | "instagram-dm" | "automations" | "tracking";
  label: string;
  detail: string;
  state: HomeHealthState;
};
export type HomeAttentionItem = {
  id: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "info";
  to: "/integracoes" | "/crm/leads" | "/crm/funis-de-venda" | "/crm/automacoes" | "/modulos/tracking";
};
export type HomeOnboardingStep = {
  id: "whatsapp" | "meta" | "social" | "funil";
  state: "complete" | "pending" | "unavailable";
  detail: string;
};
export type HomeOverview = {
  readAt: string;
  workspaceId: string;
  summary: { leadsLast24h: number; openLeads: number; staleOpenLeads48h: number };
  attention: HomeAttentionItem[];
  health: HomeHealthItem[];
  onboarding: { steps: HomeOnboardingStep[] };
};

type AnySb = { from: (table: string) => any };
type DbLead = { id: string; stage_id: string | null; created_at: string; updated_at: string };
type DbStage = { id: string; name: string };

function catalogState(value?: string | null): HomeHealthState {
  if (["connected", "conectado"].includes(String(value ?? ""))) return "ok";
  if (["needs_reconnect", "pending", "em_preparacao"].includes(String(value ?? ""))) return "attention";
  return "off";
}

function stageState(name?: string | null): "won" | "lost" | "open" {
  const normalized = String(name ?? "").toLowerCase();
  if (/ganh|venda\s*realiz|won|success/.test(normalized)) return "won";
  if (/perdid|lost|loss|descart/.test(normalized)) return "lost";
  return "open";
}

function cutoffIso(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export const getHomeOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HomeOverview> => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await requireActiveWorkspace(sb, context.userId);

    const [leadsRes, pipelinesRes, stagesRes, whatsappRes, integrationsRes, pagesRes, instagramRes, automationsRes] = await Promise.all([
      sb.from("leads").select("id,stage_id,created_at,updated_at").eq("workspace_id", workspaceId).eq("status", "active").limit(5000),
      sb.from("pipelines").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      sb.from("pipeline_stages").select("id,name").eq("workspace_id", workspaceId),
      sb.from("whatsapp_web_sessions").select("id,phone_number,status,metadata").eq("workspace_id", workspaceId),
      sb.from("integrations").select("provider,status").eq("workspace_id", workspaceId).in("provider", ["meta"]),
      sb.from("meta_pages").select("id,messaging_subscribed_at").eq("workspace_id", workspaceId),
      sb.from("meta_instagram_accounts").select("id,messaging_subscribed_at").eq("workspace_id", workspaceId),
      sb.from("external_automations").select("provider,status,last_success_at,last_error").eq("workspace_id", workspaceId).in("provider", ["n8n", "make"]),
    ]);

    const criticalErrors = [leadsRes.error, pipelinesRes.error, stagesRes.error].filter(Boolean);
    if (criticalErrors.length > 0) throw new Error(criticalErrors[0]?.message ?? "Não foi possível carregar a visão operacional da Home.");

    const stageById = new Map(((stagesRes.data ?? []) as DbStage[]).map((row) => [row.id, row.name]));
    const leads = (leadsRes.data ?? []) as DbLead[];
    const openLeads = leads.filter((lead) => stageState(stageById.get(lead.stage_id ?? "")) === "open");
    const leadsLast24h = leads.filter((lead) => lead.created_at >= cutoffIso(24)).length;
    const staleOpenLeads48h = openLeads.filter((lead) => lead.updated_at < cutoffIso(48)).length;
    const pipelinesCount = pipelinesRes.count ?? 0;
    const health: HomeHealthItem[] = [];
    const attention: HomeAttentionItem[] = [];

    health.push({
      id: "crm",
      label: "CRM",
      state: pipelinesCount > 0 ? "ok" : "attention",
      detail: pipelinesCount > 0 ? (pipelinesCount === 1 ? "1 funil configurado" : `${pipelinesCount} funis configurados`) : "Nenhum funil configurado",
    });
    if (pipelinesCount === 0) attention.push({ id: "crm-no-pipeline", title: "CRM sem funil configurado", detail: "Crie pelo menos um funil para organizar e movimentar os leads.", severity: "high", to: "/crm/funis-de-venda" });
    if (staleOpenLeads48h > 0) attention.push({ id: "crm-stale-leads", title: `${staleOpenLeads48h} lead${staleOpenLeads48h > 1 ? "s" : ""} sem atualização há 48h`, detail: "São leads em etapas abertas cujo registro não recebeu atualização nas últimas 48 horas.", severity: "medium", to: "/crm/leads" });

    let whatsappState: HomeHealthState = "unavailable";
    if (whatsappRes.error) {
      health.push({ id: "whatsapp", label: "WhatsApp", state: "unavailable", detail: "Status indisponível para leitura" });
      attention.push({ id: "whatsapp-read-error", title: "Não foi possível verificar o WhatsApp", detail: "O status do canal está indisponível; a Home não vai assumir que ele está desconectado.", severity: "info", to: "/integracoes" });
    } else {
      const rows = ((whatsappRes.data ?? []) as Array<{ phone_number: string | null; status: string | null; metadata?: { deleted?: boolean } | null }>).filter((row) => {
        const digits = (row.phone_number ?? "").replace(/\D/g, "");
        const state = String(row.status ?? "").toLowerCase();
        return digits.length >= 8 && row.metadata?.deleted !== true && !["desconectado", "disconnected"].includes(state);
      });
      const connected = rows.filter((row) => ["conectado", "connected", "open"].includes(String(row.status ?? "").toLowerCase())).length;
      whatsappState = connected > 0 ? "ok" : rows.length > 0 ? "attention" : "off";
      health.push({ id: "whatsapp", label: "WhatsApp", state: whatsappState, detail: connected > 0 ? `${connected} número${connected > 1 ? "s" : ""} ativo${connected > 1 ? "s" : ""}` : rows.length > 0 ? "Conexão pendente" : "Nenhum número conectado" });
      if (whatsappState !== "ok") attention.push({ id: "whatsapp", title: "WhatsApp precisa de atenção", detail: whatsappState === "attention" ? "Existe uma sessão cadastrada, mas ela ainda não está operando." : "Nenhum número de WhatsApp está conectado.", severity: "high", to: "/integracoes" });
    }

    let metaState: HomeHealthState = "unavailable";
    if (integrationsRes.error) {
      health.push({ id: "meta", label: "Meta", state: "unavailable", detail: "Status indisponível para leitura" });
      attention.push({ id: "meta-read-error", title: "Não foi possível verificar o Meta", detail: "O status da integração está indisponível; tente novamente antes de tomar uma ação.", severity: "info", to: "/integracoes" });
    } else {
      const meta = ((integrationsRes.data ?? []) as Array<{ provider: string; status: string | null }>).find((row) => row.provider === "meta");
      metaState = catalogState(meta?.status);
      health.push({ id: "meta", label: "Meta", state: metaState, detail: metaState === "ok" ? "Conta autorizada" : metaState === "attention" ? "Reconexão ou autorização pendente" : "Conta não conectada" });
      if (metaState !== "ok") attention.push({ id: "meta", title: "Meta precisa de atenção", detail: metaState === "attention" ? "A integração existe, mas precisa ser revisada ou reconectada." : "Conecte a conta Meta para liberar os recursos dependentes dela.", severity: "medium", to: "/integracoes" });
    }

    let pageCount: number | null = null;
    if (pagesRes.error) {
      health.push({ id: "facebook", label: "Facebook", state: "unavailable", detail: "Status indisponível para leitura" });
      health.push({ id: "messenger", label: "Messenger", state: "unavailable", detail: "Status indisponível para leitura" });
    } else {
      const pages = (pagesRes.data ?? []) as Array<{ id: string; messaging_subscribed_at: string | null }>;
      pageCount = pages.length;
      const subscribed = pages.filter((row) => row.messaging_subscribed_at).length;
      health.push({ id: "facebook", label: "Facebook", state: pages.length > 0 ? "ok" : "off", detail: pages.length > 0 ? `${pages.length} página(s)` : "Nenhuma página" });
      health.push({ id: "messenger", label: "Messenger", state: subscribed > 0 ? "ok" : pages.length > 0 ? "attention" : "off", detail: subscribed > 0 ? `${subscribed}/${pages.length} página(s) recebendo mensagens` : "Mensagens não ativas" });
    }

    let instagramCount: number | null = null;
    if (instagramRes.error) {
      health.push({ id: "instagram", label: "Instagram", state: "unavailable", detail: "Status indisponível para leitura" });
      health.push({ id: "instagram-dm", label: "Instagram Direct", state: "unavailable", detail: "Status indisponível para leitura" });
    } else {
      const profiles = (instagramRes.data ?? []) as Array<{ id: string; messaging_subscribed_at: string | null }>;
      instagramCount = profiles.length;
      const subscribed = profiles.filter((row) => row.messaging_subscribed_at).length;
      health.push({ id: "instagram", label: "Instagram", state: profiles.length > 0 ? "ok" : "off", detail: profiles.length > 0 ? `${profiles.length} perfil(is)` : "Nenhum perfil" });
      health.push({ id: "instagram-dm", label: "Instagram Direct", state: subscribed > 0 ? "ok" : profiles.length > 0 ? "attention" : "off", detail: subscribed > 0 ? `${subscribed}/${profiles.length} perfil(is) recebendo mensagens` : "Mensagens não ativas" });
    }

    if (automationsRes.error) {
      health.push({ id: "automations", label: "Automações externas", state: "unavailable", detail: "Status indisponível para leitura" });
      attention.push({ id: "automations-read-error", title: "Não foi possível verificar automações externas", detail: "A leitura de n8n/Make falhou e foi marcada como indisponível, não como desconectada.", severity: "info", to: "/crm/automacoes" });
    } else {
      const automations = (automationsRes.data ?? []) as Array<{ provider: string; status: string | null; last_success_at: string | null; last_error: string | null }>;
      const connected = automations.filter((row) => catalogState(row.status) === "ok");
      const hasError = automations.some((row) => Boolean(row.last_error));
      const state: HomeHealthState = hasError ? "attention" : connected.length > 0 ? "ok" : automations.length > 0 ? "attention" : "off";
      health.push({ id: "automations", label: "Automações externas", state, detail: hasError ? "Existe erro registrado em integração externa" : connected.length > 0 ? `${connected.length} integração(ões) externa(s) conectada(s)` : automations.length > 0 ? "Configuração externa requer atenção" : "Nenhuma integração externa configurada" });
      if (hasError) attention.push({ id: "automation-error", title: "Automação externa com erro registrado", detail: "Revise a integração n8n/Make que reportou erro na última execução conhecida.", severity: "high", to: "/crm/automacoes" });
    }

    health.push({ id: "tracking", label: "Tracking", state: "unavailable", detail: "Ainda sem telemetria de saúde confiável para a Home" });

    const socialHasProof = (pageCount ?? 0) > 0 || (instagramCount ?? 0) > 0;
    const socialState: HomeOnboardingStep["state"] = socialHasProof ? "complete" : pageCount === null || instagramCount === null ? "unavailable" : "pending";
    const onboardingSteps: HomeOnboardingStep[] = [
      { id: "whatsapp", state: whatsappState === "ok" ? "complete" : whatsappState === "unavailable" ? "unavailable" : "pending", detail: whatsappState === "ok" ? "Número conectado e operando" : whatsappState === "unavailable" ? "Não foi possível verificar o canal" : "Conecte um número para receber e responder leads" },
      { id: "meta", state: metaState === "ok" ? "complete" : metaState === "unavailable" ? "unavailable" : "pending", detail: metaState === "ok" ? "Conta Meta autorizada" : metaState === "unavailable" ? "Não foi possível verificar a integração" : "Autorize a conta Meta do workspace" },
      { id: "social", state: socialState, detail: socialState === "complete" ? "Página ou perfil social disponível" : socialState === "unavailable" ? "Não foi possível verificar todas as contas sociais" : "Conecte ao menos uma página ou perfil social" },
      { id: "funil", state: pipelinesCount > 0 ? "complete" : "pending", detail: pipelinesCount > 0 ? (pipelinesCount === 1 ? "1 funil disponível" : `${pipelinesCount} funis disponíveis`) : "Crie o primeiro funil de vendas" },
    ];

    return {
      readAt: new Date().toISOString(),
      workspaceId,
      summary: { leadsLast24h, openLeads: openLeads.length, staleOpenLeads48h },
      attention,
      health,
      onboarding: { steps: onboardingSteps },
    };
  });
