import { describe, expect, it } from "vitest";
import fs from "node:fs";

const migration = fs.readFileSync(
  new URL("../../../supabase/migrations/20260811201000_fix_partner_sandbox_whatsapp_message_trigger.sql", import.meta.url),
  "utf8",
);

describe("WhatsApp reaction persistence trigger", () => {
  it("does not dereference table-specific NEW fields directly", () => {
    expect(migration).toContain("to_jsonb(new)");
    expect(migration).not.toMatch(/new\.direction\s*=/i);
    expect(migration).not.toMatch(/new\.from_me\s*[,=)]/i);
  });

  it("preserves sandbox limits for both shared trigger tables", () => {
    expect(migration).toContain("tg_table_name = 'channel_messages'");
    expect(migration).toContain("tg_table_name = 'whatsapp_web_messages'");
    expect(migration).toContain("PARTNER_SANDBOX_DAILY_MESSAGE_LIMIT_REACHED");
  });

  it("backfills only real WhatsApp ids and avoids duplicates", () => {
    expect(migration).toContain("a.payload ? 'whatsapp_message_id'");
    expect(migration).toContain("length(phone_digits) >= 8");
    expect(migration).toContain("on conflict (workspace_id, message_id) do nothing");
  });
});
