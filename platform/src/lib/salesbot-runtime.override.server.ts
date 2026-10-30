export * from "./salesbot-runtime.server.ts";

import { dispatchSocialInteraction as dispatchLegacy } from "./salesbot-runtime.server.ts";
import { ensurePageToken } from "./social-publisher.server";

type AnySb = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

type SocialInteraction = {
  workspaceId: string;
  leadId: string;
  network: "facebook" | "instagram";
  kind: "comentario" | "mencao";
  text?: string | null;
  commentId?: string | null;
  mediaId?: string | null;
  pageId?: string | null;
  fromId?: string | null;
  fromName?: string | null;
  permalink?: string | null;
};

type AutomationRow = {
  id: string;
  workspace_id: string;
  post_id: string;
  enabled: boolean;
  match_mode: "any" | "contains" | "equals";
  keywords: string[] | null;
  comment_reply_enabled: boolean;
  comment_reply_text: string | null;
  dm_reply_enabled: boolean;
  dm_reply_text: string | null;
};

function norm(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function matchesAutomation(rule: AutomationRow, text: string | null | undefined): boolean {
  if (rule.match_mode === "any") return true;
  const incoming = norm(text);
  const keys = (rule.keywords ?? []).map(norm).filter(Boolean);
  if (!incoming || !keys.length) return false;
  if (rule.match_mode === "equals") return keys.some((key) => incoming === key);
  return keys.some((key) => incoming.includes(key));
}

async function graphPost(url: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({})) as { error?: { message?: string }; id?: string; message_id?: string };
  if (!response.ok || json.error) throw new Error(json.error?.message ?? `Meta HTTP ${response.status}`);
  return json;
}

async function executePostAutomation(supabaseAdmin: AnySb, params: SocialInteraction): Promise<void> {
  if (params.kind !== "comentario" || !params.commentId || !params.mediaId) return;

  const { data: channels } = await supabaseAdmin
    .from("social_post_channels")
    .select("post_id,channel,target_ref,platform_ref")
    .eq("workspace_id", params.workspaceId)
    .eq("platform_ref", params.mediaId)
    .limit(5);
  const channel = (channels ?? []).find((row: any) =>
    params.network === "instagram" ? String(row.channel).startsWith("ig_") : String(row.channel).startsWith("fb_"),
  ) as { post_id: string; channel: string; target_ref: string | null } | undefined;
  if (!channel?.post_id) return;

  const { data: automationData, error: automationError } = await supabaseAdmin
    .from("social_post_automations")
    .select("*")
    .eq("workspace_id", params.workspaceId)
    .eq("post_id", channel.post_id)
    .eq("enabled", true)
    .maybeSingle();
  if (automationError || !automationData) return;
  const automation = automationData as AutomationRow;
  if (!matchesAutomation(automation, params.text)) return;

  // Webhooks da Meta podem ser repetidos. O insert com unique(automation_id, comment_id)
  // funciona como claim idempotente: só a primeira entrega executa as respostas.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("social_post_automation_runs")
    .insert({
      workspace_id: params.workspaceId,
      automation_id: automation.id,
      post_id: channel.post_id,
      comment_id: params.commentId,
      media_id: params.mediaId,
      network: params.network,
      comment_text: params.text ?? null,
      comment_reply_status: automation.comment_reply_enabled ? "pending" : "disabled",
      dm_reply_status: automation.dm_reply_enabled ? "pending" : "disabled",
    })
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) return;
  const runId = (claimed as { id: string }).id;

  let pageId = params.pageId ?? null;
  let igUserId: string | null = null;
  if (params.network === "instagram") {
    igUserId = channel.target_ref ?? null;
    if (igUserId) {
      const { data: ig } = await supabaseAdmin
        .from("meta_instagram_accounts")
        .select("page_id")
        .eq("workspace_id", params.workspaceId)
        .eq("instagram_id", igUserId)
        .maybeSingle();
      pageId = (ig as { page_id?: string | null } | null)?.page_id ?? pageId;
    }
  } else {
    pageId = channel.target_ref ?? pageId;
  }

  // Nunca responda aos comentários publicados pela própria conta/página.
  if (params.fromId && (params.fromId === pageId || params.fromId === igUserId)) {
    await supabaseAdmin.from("social_post_automation_runs").update({
      comment_reply_status: "skipped_owner",
      dm_reply_status: "skipped_owner",
    }).eq("id", runId);
    return;
  }

  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY ?? "";
  if (!encKey || !pageId) {
    await supabaseAdmin.from("social_post_automation_runs").update({
      comment_reply_status: automation.comment_reply_enabled ? "error" : "disabled",
      dm_reply_status: automation.dm_reply_enabled ? "error" : "disabled",
      error_message: !encKey ? "INTEGRATION_ENCRYPTION_KEY ausente" : "Página Meta do post não encontrada",
    }).eq("id", runId);
    return;
  }

  const token = await ensurePageToken(supabaseAdmin as never, params.workspaceId, pageId, encKey);
  if (!token) {
    await supabaseAdmin.from("social_post_automation_runs").update({
      comment_reply_status: automation.comment_reply_enabled ? "error" : "disabled",
      dm_reply_status: automation.dm_reply_enabled ? "error" : "disabled",
      error_message: "Page access token indisponível",
    }).eq("id", runId);
    return;
  }

  let commentStatus = automation.comment_reply_enabled ? "pending" : "disabled";
  let dmStatus = automation.dm_reply_enabled ? "pending" : "disabled";
  const errors: string[] = [];

  if (automation.comment_reply_enabled && automation.comment_reply_text?.trim()) {
    try {
      await graphPost(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(params.commentId)}/replies`,
        token,
        { message: automation.comment_reply_text.trim() },
      );
      commentStatus = "sent";
    } catch (error) {
      commentStatus = "error";
      errors.push(`comentário: ${(error as Error).message}`);
    }
  }

  if (automation.dm_reply_enabled && automation.dm_reply_text?.trim()) {
    try {
      const endpointId = params.network === "instagram" ? igUserId : pageId;
      if (!endpointId) throw new Error("Conta de destino não encontrada");
      const host = params.network === "instagram" ? "graph.facebook.com" : "graph.facebook.com";
      await graphPost(
        `https://${host}/v21.0/${encodeURIComponent(endpointId)}/messages`,
        token,
        {
          recipient: { comment_id: params.commentId },
          message: { text: automation.dm_reply_text.trim() },
        },
      );
      dmStatus = "sent";
    } catch (error) {
      dmStatus = "error";
      errors.push(`privado: ${(error as Error).message}`);
    }
  }

  await supabaseAdmin.from("social_post_automation_runs").update({
    comment_reply_status: commentStatus,
    dm_reply_status: dmStatus,
    error_message: errors.length ? errors.join(" | ") : null,
  }).eq("id", runId);
}

export async function dispatchSocialInteraction(supabaseAdmin: AnySb, params: SocialInteraction): Promise<void> {
  // Mantém todos os Salesbots/gatilhos sociais já existentes.
  await dispatchLegacy(supabaseAdmin as never, params);
  // Em paralelo, aplica a automação específica do post publicado.
  try {
    await executePostAutomation(supabaseAdmin, params);
  } catch (error) {
    console.error("[social post automation]", error);
  }
}
