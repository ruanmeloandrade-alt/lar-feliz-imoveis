import { describe, expect, it } from "vitest";
import {
  INBOX_HOT_RETENTION_MS,
  computeInboxColdBudgetBytes,
  decodeInboxColdValue,
  deltaCursorWithOverlap,
  encodeInboxColdValue,
  latestInboxCheckpoint,
  makeInboxCacheScopeKey,
  mergeInboxHotItems,
  planInboxColdEvictions,
  sanitizeInboxCacheValue,
} from "../inbox-cache";

describe("Inbox local cache core", () => {
  it("isolates keys by both user and workspace", () => {
    const a = makeInboxCacheScopeKey({ userId: "user-a", workspaceId: "ws-1" });
    const b = makeInboxCacheScopeKey({ userId: "user-a", workspaceId: "ws-2" });
    const c = makeInboxCacheScopeKey({ userId: "user-b", workspaceId: "ws-1" });

    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe("user-a::ws-1");
  });

  it("deduplicates by stable id, lets server delta win, and prunes beyond seven days", () => {
    const now = Date.parse("2026-09-18T15:00:00.000Z");
    const fresh = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const newer = new Date(now - 60 * 60 * 1000).toISOString();
    const expired = new Date(now - INBOX_HOT_RETENTION_MS - 1).toISOString();

    const merged = mergeInboxHotItems(
      [
        { id: "same", occurredAt: fresh, text: "old" },
        { id: "expired", occurredAt: expired, text: "must leave hot cache" },
      ],
      [
        { id: "same", occurredAt: newer, text: "server edit" },
        { id: "new", occurredAt: fresh, text: "delta" },
      ],
      now,
    );

    expect(merged.map((item) => item.id)).toEqual(["new", "same"]);
    expect(merged.find((item) => item.id === "same")?.text).toBe("server edit");
    expect(merged.some((item) => item.id === "expired")).toBe(false);
    expect(latestInboxCheckpoint(merged)).toBe(newer);
  });

  it("backs the delta cursor up to overlap edits and duplicate delivery safely", () => {
    const checkpoint = "2026-09-18T14:30:00.000Z";
    expect(deltaCursorWithOverlap(checkpoint, 5 * 60 * 1000)).toBe("2026-09-18T14:25:00.000Z");
    expect(deltaCursorWithOverlap(null)).toBeNull();
    expect(deltaCursorWithOverlap("not-a-date")).toBeNull();
  });

  it("uses an adaptive bounded cold-cache budget", () => {
    const normal = computeInboxColdBudgetBytes({
      quota: 1024 * 1024 * 1024,
      usage: 100 * 1024 * 1024,
    });
    const pressured = computeInboxColdBudgetBytes({
      quota: 1024 * 1024 * 1024,
      usage: 900 * 1024 * 1024,
    });
    const tinyQuota = computeInboxColdBudgetBytes({ quota: 1024, usage: 0 });

    expect(normal).toBeGreaterThanOrEqual(8 * 1024 * 1024);
    expect(normal).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(pressured).toBeLessThan(normal);
    expect(tinyQuota).toBe(8 * 1024 * 1024);
  });

  it("evicts expired blocks first and then the least recently used block", () => {
    const now = Date.parse("2026-09-18T15:00:00.000Z");
    const megabyte = 1024 * 1024;
    const evictions = planInboxColdEvictions(
      [
        {
          key: "expired",
          bytes: 1 * megabyte,
          lastAccessedAt: "2026-07-01T00:00:00.000Z",
        },
        {
          key: "oldest-active",
          bytes: 6 * megabyte,
          lastAccessedAt: "2026-09-10T00:00:00.000Z",
        },
        {
          key: "newest-active",
          bytes: 6 * megabyte,
          lastAccessedAt: "2026-09-18T14:00:00.000Z",
        },
      ],
      8 * megabyte,
      now,
    );

    expect(evictions).toEqual(["expired", "oldest-active"]);
  });

  it("keeps media references but strips binary payloads from snapshots", () => {
    const sanitized = sanitizeInboxCacheValue({
      id: "msg-1",
      occurredAt: "2026-09-18T14:30:00.000Z",
      mediaUrl: "https://storage.example/file.pdf",
      blob: new Blob(["heavy"]),
      bytes: new Uint8Array([1, 2, 3]),
      buffer: new ArrayBuffer(4),
    }) as Record<string, unknown>;

    expect(sanitized.mediaUrl).toBe("https://storage.example/file.pdf");
    expect(sanitized).not.toHaveProperty("blob");
    expect(sanitized).not.toHaveProperty("bytes");
    expect(sanitized).not.toHaveProperty("buffer");
  });

  it("rejects a corrupt cold payload so the caller can fall back to the network", async () => {
    const invalid = new TextEncoder().encode("{not-json");
    await expect(
      decodeInboxColdValue({
        encoding: "plain",
        payload: invalid.buffer.slice(
          invalid.byteOffset,
          invalid.byteOffset + invalid.byteLength,
        ) as ArrayBuffer,
      }),
    ).rejects.toThrow();
  });

  it("round-trips compacted cold history with gzip when supported and plain fallback otherwise", async () => {
    const page = {
      activities: Array.from({ length: 40 }, (_, index) => ({
        id: `message-${index}`,
        occurredAt: "2026-08-01T12:00:00.000Z",
        text: "mensagem repetida para validar compactação ".repeat(8),
        mediaUrl: "https://storage.example/reference-only",
      })),
      hasMore: true,
      earliestAt: "2026-08-01T12:00:00.000Z",
    };

    const encoded = await encodeInboxColdValue(page);
    const decoded = await decodeInboxColdValue<typeof page>(encoded);

    expect(["gzip", "plain"]).toContain(encoded.encoding);
    expect(encoded.payload).toBeInstanceOf(ArrayBuffer);
    expect(encoded.originalBytes).toBeGreaterThan(0);
    expect(decoded).toEqual(page);
    if (encoded.encoding === "gzip") {
      expect(encoded.payload.byteLength).toBeLessThan(encoded.originalBytes);
    }
  });
});
