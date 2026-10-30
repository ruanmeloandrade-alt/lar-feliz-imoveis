import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  fs.readFileSync(new URL(relative, import.meta.url), "utf8");

const inbox = read("../../components/inbox/InboxPage.legacy.tsx");
const leads = read("../leads.functions.legacy.ts");
const groups = read("../whatsapp-groups.functions.legacy.ts");
const routing = read("../whatsapp-session-routing.server.ts");
const identity = read("../whatsapp-identity.ts");
const webhook = read("../../routes/api/public/evolution/webhook.$secret.ts");
const salesbot = read("../salesbot-runtime.server.ts");
const groupActions = read("../salesbot-group-actions.server.ts");
const migration = read(
  "../../../supabase/migrations/20260918142000_inbox_f2_performance_loading.sql",
);
const repair = read(
  "../../../supabase/migrations/20260918153000_inbox_qa_repair_proven_last8_activity_collisions.sql",
);
const leadOrderMigration = read(
  "../../../supabase/migrations/20260919161000_inbox_lead_order_by_message.sql",
);

describe("Inbox WhatsApp final QA integrated contracts", () => {
  it("keeps real conversation JID authoritative and removes legacy last-8 identity matching", () => {
    expect(routing).toContain("findLatestLeadWhatsappIdentity");
    expect(routing).toContain("resolveLeadWhatsappRoutingTarget");
    expect(leads).toContain("resolveLeadWhatsappRoutingTarget");
    expect(leads).toContain("whatsapp_remote_jid");
    expect(leads).toContain("whatsapp_conversation_key");
    expect(leads).not.toContain("tailToPhone");
    expect(webhook).not.toContain("tailToPhone");
    expect(identity).toContain("whatsappIdentityFromEvolutionJids");
    expect(webhook).toContain("remoteJidAlt");
  });

  it("does not silently turn ambiguous local input into Brazil +55", () => {
    expect(identity).toContain("normalizeInternationalPhone");
    expect(identity).toContain("allowTrustedBare");
    expect(routing).toContain("Número de WhatsApp ambíguo");
    expect(identity).not.toContain("DEFAULT_COUNTRY_CODE");
  });

  it("keeps F2 keyset pagination and F3 delta semantics together", () => {
    expect(leads).toContain("LeadActivityCursorSchema");
    expect(leads).toContain("after: z.string().datetime({ offset: true }).optional()");
    expect(leads).toContain("const isDelta = Boolean(data.after)");
    expect(groups).toContain("InboxGroupMessageCursorSchema");
    expect(groups).toContain("after: z.string().datetime({ offset: true }).optional()");
    expect(groups).toContain("const isDelta = Boolean(data.after)");
    expect(inbox).toContain("useInfiniteQuery");
    expect(inbox).toContain("deltaCursorWithOverlap(checkpoint)");
    expect(inbox).toContain("INBOX_HOT_RETENTION_MS");
  });

  it("keeps Realtime and cache scoped to the authenticated workspace/user", () => {
    expect(inbox).toContain("cacheScope?.userId");
    expect(inbox).toContain("cacheScope?.workspaceId");
    expect(inbox).toContain("workspace_id=eq.");
    expect(inbox).toContain('event: "INSERT"');
    expect(inbox).toContain('event: "UPDATE"');
    expect(inbox).toContain("activityQueryKey");
    expect(inbox).toContain("groupQueryKey");
  });

  it("keeps direct lead conversations live even if Realtime or the groups query fails", () => {
    expect(inbox).toContain('refetchOnWindowFocus: "always"');
    expect(inbox).toContain('refetchOnReconnect: "always"');
    expect(inbox).toContain("window.setInterval(refreshLeadHead, 30_000)");
    expect(inbox).toContain('status === "CHANNEL_ERROR"');
    expect(inbox).toContain('status === "TIMED_OUT"');
    expect(inbox).toContain("const leadNetworkReady");
    expect(inbox).toContain("if (!leadNetworkReady) return cachedConversations");
    expect(inbox).toContain("return { pages: [fresh], pageParams: [null] };");
    expect(inbox).toContain("Falha na consulta de grupos não pode congelar todos os leads");
  });

  it("distinguishes loading and transport failure from a real empty Inbox", () => {
    expect(inbox).toContain("workspaceResolutionError");
    expect(inbox).toContain("leadConvsQuery.isError");
    expect(inbox).toContain("groupConvsQuery.isError");
    expect(inbox).toContain("conversationLoadError");
    expect(inbox).toContain("conversationsLoading");
    expect(inbox).toContain("Não foi possível atualizar as conversas. Exibindo o último estado salvo.");
    expect(inbox).toContain("Não foi possível carregar as conversas.");
    expect(inbox).toContain("Carregando conversas...");
    expect(inbox).toContain("Tentar novamente");
    expect(inbox).toContain("isLoading && conversations.length === 0");
    expect(inbox).toContain("loadError && conversations.length === 0");
    expect(inbox).toContain("Nenhuma conversa nesta visão.");
  });

  it("boots the Inbox through one authenticated server operation and seeds the first lead page", () => {
    expect(leads).toContain("async function loadLeadConversationPage");
    expect(leads).toContain("export const getInboxBootstrap");
    expect(leads).toContain('from("whatsapp_web_sessions")');
    expect(leads).toContain("userId: context.userId");
    expect(leads).toContain("workspaceId: wsId");
    expect(leads).toContain("leadPage");
    expect(leads).toContain("hasConnectedSession");
    expect(inbox).toContain("getInboxBootstrap");
    expect(inbox).toContain('queryKey: ["inbox", "bootstrap"]');
    expect(inbox).toContain("bootstrap.leadPage");
    expect(inbox).toContain("bootstrap.userId");
    expect(inbox).toContain("bootstrap.workspaceId");
    expect(inbox).toContain('event === "TOKEN_REFRESHED"');
    expect(inbox).not.toContain('.from("profiles")');
  });

  it("detects data versus empty-list inconsistencies and self-recovers only the active cache scope", () => {
    expect(leads).toContain("export const checkInboxHealth");
    expect(leads).toContain('"lead-page-empty-with-existing-leads"');
    expect(leads).toContain('from("security_events").insert');
    expect(leads).toContain('type: "inbox_health"');
    expect(leads).toContain("needsRecovery");
    expect(inbox).toContain("checkInboxHealth");
    expect(inbox).toContain("loadInboxHealth");
    expect(inbox).toContain("inboxHealthQuery");
    expect(inbox).toContain("clearInboxCacheScope(cacheScope)");
    expect(inbox).toContain("autoRecoveryAttemptedRef");
    expect(inbox).toContain("selfRecoveryActive");
    expect(inbox).toContain("Iniciando autorrecuperação");
    expect(inbox).toContain("inboxHealthQuery.isFetching");
  });

  it("keeps the final audit invariants for recovery, pagination and data preservation", () => {
    expect(leads).toContain('.select("id", { count: "exact", head: true })');
    expect(leads).toContain("messageActivityCount");
    expect(leads).toContain("whatsappMessageCount");
    expect(leads).toContain("latestActivityAt");
    expect(leads).toContain("latestWhatsappAt");
    expect(inbox).toContain("clearInboxCacheScope(cacheScope)");
    expect(inbox).toContain("inboxBootstrapQuery.refetch()");
    expect(inbox).toContain("leadConvsQuery.refetch()");
    expect(inbox).toContain("inboxHealthQuery.refetch()");
    expect(leads).not.toContain('.from("leads").delete()');
    expect(leads).not.toContain('.from("lead_activities").delete()');
    expect(leads).not.toContain('.from("whatsapp_web_messages").delete()');
  });

  it("opens a route-selected lead even when it is outside the loaded Inbox page", () => {
    expect(inbox).toContain('"route-selected-lead"');
    expect(inbox).toContain("loadSelectedLeadDetail");
    expect(inbox).toContain("includeActivities: false");
    expect(inbox).toContain("const selectedFromRoute");
    expect(inbox).toContain("const resolvingSelectedLead");
    expect(inbox).toContain("Abrindo conversa…");
  });

  it("orders direct lead conversations by real message activity instead of generic lead updates", () => {
    expect(leads).toContain('"list_inbox_lead_order_page"');
    expect(leads).toContain("conversationAtByLead");
    expect(leadOrderMigration).toContain("a.type in ('message_in', 'message_out')");
    expect(leadOrderMigration).toContain("coalesce(last_message.occurred_at, l.created_at)");
    expect(leadOrderMigration).not.toContain("order by l.updated_at");
  });

  it("preserves SalesBot and group actions on canonical WhatsApp identity helpers", () => {
    expect(salesbot).toContain("normalizeInternationalPhone");
    expect(salesbot).toContain("whatsappIdentityFromJid");
    expect(salesbot).toContain("whatsapp_conversation_key");
    expect(groupActions).toContain("normalizeInternationalPhone");
    expect(groupActions).toContain("whatsappIdentityFromJid");
  });

  it("contains the F2 runtime indexes/RPC and the narrow historical repair", () => {
    expect(migration).toContain("idx_leads_ws_updated_id");
    expect(migration).toContain("idx_lead_activities_ws_lead_occurred_id");
    expect(migration).toContain("idx_whatsapp_web_messages_ws_received_id");
    expect(migration).toContain("list_inbox_group_conversations_page");
    expect(repair).toContain("right(x.old_digits, 8) = right(x.jid_digits, 8)");
    expect(repair).toContain("having count(distinct target.id) = 1");
    expect(repair).toContain("whatsapp_identity_repair");
  });
});
