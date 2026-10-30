import { describe, expect, it } from "vitest";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../../components/inbox/InboxPage.tsx", import.meta.url), "utf8");

describe("Inbox label persistence", () => {
  it("uses the persisted Inbox label backend", () => {
    expect(source).toContain("listInboxLabels");
    expect(source).toContain("upsertInboxLabel");
    expect(source).toContain("deleteInboxLabel");
    expect(source).toContain("toggleLabelAssignment");
  });

  it("does not persist labels or assignments in localStorage", () => {
    expect(source).not.toContain("mkton:inbox-label-groups");
    expect(source).not.toContain("mkton:inbox-conversation-labels");
  });

  it("never falls back to a mock conversation for real leads", () => {
    expect(source).toContain('channel === "leads" ? undefined : getConversation(channel, selectedId)');
  });
});
