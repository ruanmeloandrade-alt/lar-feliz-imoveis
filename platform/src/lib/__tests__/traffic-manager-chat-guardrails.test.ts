import { describe, expect, it } from "vitest";
import { applyGestorChatToolPolicy, BLOCKED_GESTOR_CHAT_TOOLS } from "@/lib/ai-agent/gestor-chat-tool-policy";

describe("Gestor Chat tool guardrails", () => {
  it("bloqueia mutações legadas que contornam o motor seguro", () => {
    expect([...BLOCKED_GESTOR_CHAT_TOOLS]).toEqual(expect.arrayContaining([
      "set_object_status",
      "update_campaign_budget",
      "create_full_ad_from_image",
      "apply_strategy_to_campaign",
      "set_google_campaign_status",
      "set_tiktok_campaign_status",
    ]));
  });

  it("preserva leitura e ações seguras enquanto remove atalhos perigosos", () => {
    const tools = {
      list_campaigns: { kind: "read" },
      search_creatives: { kind: "read" },
      duplicate_meta_object_safely: { kind: "safe-mutation" },
      set_meta_object_status_safely: { kind: "safe-mutation" },
      adjust_meta_budget_safely: { kind: "safe-mutation" },
      set_object_status: { kind: "legacy-mutation" },
      update_campaign_budget: { kind: "legacy-mutation" },
      create_full_ad_from_image: { kind: "legacy-create" },
      apply_strategy_to_campaign: { kind: "legacy-rule-materialization" },
      set_google_campaign_status: { kind: "provider-mutation" },
      set_tiktok_campaign_status: { kind: "provider-mutation" },
    };

    const filtered = applyGestorChatToolPolicy(tools);

    expect(filtered).toHaveProperty("list_campaigns");
    expect(filtered).toHaveProperty("search_creatives");
    expect(filtered).toHaveProperty("duplicate_meta_object_safely");
    expect(filtered).toHaveProperty("set_meta_object_status_safely");
    expect(filtered).toHaveProperty("adjust_meta_budget_safely");
    expect(filtered).not.toHaveProperty("set_object_status");
    expect(filtered).not.toHaveProperty("update_campaign_budget");
    expect(filtered).not.toHaveProperty("create_full_ad_from_image");
    expect(filtered).not.toHaveProperty("apply_strategy_to_campaign");
    expect(filtered).not.toHaveProperty("set_google_campaign_status");
    expect(filtered).not.toHaveProperty("set_tiktok_campaign_status");
  });
});
