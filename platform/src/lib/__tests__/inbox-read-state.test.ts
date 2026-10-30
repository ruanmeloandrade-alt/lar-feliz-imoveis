import { describe, expect, it } from "vitest";
import { computeUnreadCountsFromActivities } from "../inbox-read-state";

describe("Inbox unread state", () => {
  it("counts consecutive inbound messages until a read marker", () => {
    const result = computeUnreadCountsFromActivities([
      { lead_id: "lead-a", type: "message_in", occurred_at: "2026-08-09T10:03:00Z" },
      { lead_id: "lead-a", type: "message_in", occurred_at: "2026-08-09T10:02:00Z" },
      { lead_id: "lead-a", type: "conversation_read", occurred_at: "2026-08-09T10:01:00Z" },
      { lead_id: "lead-a", type: "message_in", occurred_at: "2026-08-09T10:00:00Z" },
    ]);
    expect(result.get("lead-a")).toBe(2);
  });

  it("treats an outbound reply as a read barrier", () => {
    const result = computeUnreadCountsFromActivities([
      { lead_id: "lead-a", type: "message_in", occurred_at: "2026-08-09T10:03:00Z" },
      { lead_id: "lead-a", type: "message_out", occurred_at: "2026-08-09T10:02:00Z" },
      { lead_id: "lead-a", type: "message_in", occurred_at: "2026-08-09T10:01:00Z" },
    ]);
    expect(result.get("lead-a")).toBe(1);
  });

  it("keeps read state isolated per lead", () => {
    const result = computeUnreadCountsFromActivities([
      { lead_id: "lead-a", type: "conversation_read", occurred_at: "2026-08-09T10:04:00Z" },
      { lead_id: "lead-b", type: "message_in", occurred_at: "2026-08-09T10:03:00Z" },
      { lead_id: "lead-b", type: "message_in", occurred_at: "2026-08-09T10:02:00Z" },
    ]);
    expect(result.get("lead-a") ?? 0).toBe(0);
    expect(result.get("lead-b")).toBe(2);
  });
});
