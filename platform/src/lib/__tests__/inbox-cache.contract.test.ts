import fs from "node:fs";
import { describe, expect, it } from "vitest";

const cache = fs.readFileSync(new URL("../inbox-cache.ts", import.meta.url), "utf8");
const inbox = fs.readFileSync(
  new URL("../../components/inbox/InboxPage.legacy.tsx", import.meta.url),
  "utf8",
);
const leads = fs.readFileSync(new URL("../leads.functions.legacy.ts", import.meta.url), "utf8");
const groups = fs.readFileSync(
  new URL("../whatsapp-groups.functions.legacy.ts", import.meta.url),
  "utf8",
);
const accounts = fs.readFileSync(new URL("../../routes/contas.tsx", import.meta.url), "utf8");

describe("Inbox integrated persistent-cache contract", () => {
  it("uses IndexedDB with explicit schema/version and native compression fallback", () => {
    expect(cache).toContain('const DB_NAME = "mkton-inbox-cache"');
    expect(cache).toContain("INBOX_CACHE_SCHEMA_VERSION = 1");
    expect(cache).toContain("indexedDB.open");
    expect(cache).toContain('new CompressionStream("gzip")');
    expect(cache).toContain('new DecompressionStream("gzip")');
    expect(cache).toContain("navigator.storage.estimate()");
  });

  it("isolates cache by user plus workspace and clears signed-out user data", () => {
    expect(cache).toContain("return `${scope.userId}::${scope.workspaceId}`");
    expect(cache).toContain("export async function clearInboxCacheUser");
    expect(inbox).toContain("bootstrap.userId");
    expect(inbox).toContain("bootstrap.workspaceId");
    expect(inbox).toContain("setCacheScope(nextScope)");
    expect(inbox).toContain("clearInboxCacheUser(previousScope.userId)");
    expect(inbox).toContain('queryClientTop.removeQueries({ queryKey: ["inbox"] })');
    expect(accounts).toContain("queryClient.clear()");
    expect(accounts).toContain('window.location.assign("/home")');
  });

  it("renders cached conversation/thread snapshots before scoped network revalidation", () => {
    expect(inbox).toContain("readInboxConversationSnapshot<ChatConversation>");
    expect(inbox).toContain("conversationCacheReady");
    expect(inbox).toContain("readInboxHotSnapshot<LeadActivityPage");
    expect(inbox).toContain("effectiveActivityPage = activitiesQ.data ?? cachedActivityPage");
    expect(inbox).toContain("effectiveGroupPage = groupMessagesQ.data ?? cachedGroupPage");
    expect(inbox).toContain("cacheScope?.workspaceId");
  });

  it("preserves F2 cursor pagination while adding F3 after-delta queries", () => {
    expect(leads).toContain("LeadActivityCursorSchema");
    expect(leads).toContain("cursor: LeadActivityCursorSchema.optional()");
    expect(leads).toContain("after: z.string().datetime({ offset: true }).optional()");
    expect(leads).toContain('q = q.gt("occurred_at", data.after)');
    expect(leads).toContain("const isDelta = Boolean(data.after)");

    expect(groups).toContain("InboxGroupMessageCursorSchema");
    expect(groups).toContain("cursor: InboxGroupMessageCursorSchema.optional()");
    expect(groups).toContain("after: z.string().datetime({ offset: true }).optional()");
    expect(groups).toContain('q = q.gt("received_at", data.after)');
    expect(groups).toContain("const isDelta = Boolean(data.after)");

    expect(inbox).toContain("useInfiniteQuery");
    expect(inbox).toContain("deltaCursorWithOverlap(checkpoint)");
    expect(inbox).toContain("mergeInboxHotItems(previous?.activities ?? [], delta.activities)");
    expect(inbox).toContain("mergeInboxHotItems(previous?.messages ?? [], delta.messages)");
  });

  it("warms seven days in background without putting history in the first-paint request", () => {
    expect(inbox).toContain("A F2 mantém o primeiro paint paginado");
    expect(inbox).toContain("Date.now() - INBOX_HOT_RETENTION_MS");
    expect(inbox).toContain("limit: 50");
    expect(inbox).toContain("cursor, limit: 200");
    expect(cache).toContain("INBOX_HOT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000");
  });

  it("stores on-demand old history as compressed cold blocks keyed by composite cursor", () => {
    expect(inbox).toContain("readInboxColdPage<LeadActivityPage>");
    expect(inbox).toContain("writeInboxColdPage(cacheScope, activityThreadKey, anchor, result)");
    expect(inbox).toContain("readInboxColdPage<GroupMessagePage>");
    expect(inbox).toContain("writeInboxColdPage(cacheScope, groupThreadKey, anchor, result)");
    expect(inbox).toContain("const anchor = `${cursor.occurredAt}:${cursor.id}`");
    expect(cache).toContain("Corruption is isolated to this block");
    expect(cache).toContain("await deleteColdBlock(key)");
  });

  it("keeps Realtime incremental for INSERT and UPDATE after cache integration", () => {
    expect(inbox).toContain('event: "INSERT"');
    expect(inbox).toContain('event: "UPDATE"');
    expect(inbox).toContain('table: "lead_activities"');
    expect(inbox).toContain('table: "whatsapp_web_messages"');
    expect(inbox).toContain("queryClient.setQueryData(activityQueryKey");
    expect(inbox).toContain("queryClient.setQueryData(groupQueryKey");
  });

  it("keeps media references while refusing heavy binary payloads", () => {
    expect(cache).toContain("isBinaryLike");
    expect(cache).toContain("value instanceof Blob");
    expect(cache).toContain("ArrayBuffer.isView(value)");
    expect(cache).not.toContain("CREATE INDEX");
    expect(cache).not.toContain("ALTER TABLE");
  });
});
