// Lista as ORIGENS REAIS de lead cadastradas no workspace ativo
// (números de WhatsApp, contas de Instagram, páginas do Messenger,
// formulários e CRMs externos). Nada de "fonte de CRM" genérica:
// aqui é de onde o lead realmente chegou.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnySb = { from: (t: string) => any };

export type LeadOrigin = { value: string; label: string; group: string };

async function loadActiveWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  const wsId = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (wsId) return wsId;
  const { data: m } = await sb.from("workspace_members").select("workspace_id").eq("user_id", userId).limit(1).maybeSingle();
  const fallback = (m as { workspace_id?: string } | null)?.workspace_id;
  if (!fallback) throw new Error("workspace não encontrado");
  return fallback;
}

export const listLeadOrigins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const origins: LeadOrigin[] = [];

    // WhatsApp — um item por número/instância cadastrada
    const { data: sessions } = await sb
      .from("whatsapp_web_sessions")
      .select("id, instance_id, phone_number, status, metadata")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: true });
    for (const s of ((sessions ?? []) as Array<{
      id: string; instance_id: string | null; phone_number: string | null;
      status: string | null; metadata: Record<string, unknown> | null;
    }>)) {
      if (s.metadata && (s.metadata as { deleted?: boolean }).deleted === true) continue;
      const nick = typeof s.metadata?.["label"] === "string" ? String(s.metadata["label"]) : null;
      const pretty = s.phone_number ? `+${String(s.phone_number).replace(/\D/g, "")}` : null;
      const fromInstance = (s.instance_id ?? "").split("_").slice(2, -1).join("_") || s.instance_id || "instância";
      origins.push({
        value: `whatsapp:${s.id}`,
        label: `${pretty ?? nick ?? fromInstance}${s.status && s.status !== "conectado" ? ` (${s.status})` : ""}`,
        group: "WhatsApp",
      });
    }

    // Instagram Direct — uma conta por perfil conectado
    const { data: igs } = await sb
      .from("meta_instagram_accounts")
      .select("instagram_id, username")
      .eq("workspace_id", wsId);
    for (const ig of ((igs ?? []) as Array<{ instagram_id: string; username: string | null }>)) {
      origins.push({
        value: `instagram:${ig.instagram_id}`,
        label: ig.username ? `@${ig.username}` : ig.instagram_id,
        group: "Instagram Direct",
      });
    }

    // Messenger — páginas do Facebook conectadas
    const { data: pages } = await sb
      .from("meta_pages")
      .select("page_id, page_name")
      .eq("workspace_id", wsId);
    for (const p of ((pages ?? []) as Array<{ page_id: string; page_name: string | null }>)) {
      origins.push({
        value: `messenger:${p.page_id}`,
        label: p.page_name ?? p.page_id,
        group: "Messenger",
      });
    }

    // Formulários próprios
    const { data: forms } = await sb
      .from("crm_forms")
      .select("id, nome, slug")
      .eq("workspace_id", wsId);
    for (const f of ((forms ?? []) as Array<{ id: string; nome: string | null; slug: string | null }>)) {
      origins.push({ value: `form:${f.id}`, label: f.nome ?? f.slug ?? "Formulário", group: "Formulários" });
    }

    // CRMs externos conectados (não o CRM interno)
    const { data: srcs } = await sb
      .from("crm_sources")
      .select("id, provider, display_name")
      .eq("workspace_id", wsId);
    for (const s of ((srcs ?? []) as Array<{ id: string; provider: string; display_name: string | null }>)) {
      if (s.provider === "mkton") continue;
      if (["instagram_dm", "messenger", "instagram_comment", "facebook_comment", "instagram_mention", "facebook_mention"].includes(s.provider)) continue;
      origins.push({ value: `crm:${s.id}`, label: s.display_name ?? s.provider, group: "CRM externo" });
    }

    // Meta Lead Ads (só se houver conta de anúncios conectada)
    const { data: adAccounts } = await sb
      .from("meta_ad_accounts")
      .select("id")
      .eq("workspace_id", wsId)
      .limit(1);
    if (((adAccounts ?? []) as unknown[]).length > 0) {
      origins.push({ value: "channel:meta-lead-ads", label: "Formulário de anúncio (Lead Ads)", group: "Meta Ads" });
    }

    return { workspaceId: wsId, origins };
  });
