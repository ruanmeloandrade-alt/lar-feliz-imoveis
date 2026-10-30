import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const functionsSource = readFileSync(
  resolve(here, "../salesbot-external-automations.functions.ts"),
  "utf8",
);
const runtimeSource = readFileSync(
  resolve(here, "../salesbot-external-automation.server.ts"),
  "utf8",
);

describe("Salesbot external automation contract", () => {
  it("does not expose secrets or auth headers in the browser picker", () => {
    expect(functionsSource).toContain(
      '.select("id, provider, outbound_url, last_success_at, last_error")',
    );
    expect(functionsSource).not.toContain("inbound_secret");
    expect(functionsSource).not.toContain("authHeaderValue");
    expect(functionsSource).not.toContain("extraHeaders");
  });

  it("requires workspace ownership and connected status at execution time", () => {
    expect(runtimeSource).toContain('.eq("workspace_id", args.workspaceId)');
    expect(runtimeSource).toContain('.eq("status", "connected")');
    expect(runtimeSource).toContain('.eq("id", args.automationId)');
  });

  it("uses the shared webhook executor and persists execution logs", () => {
    expect(runtimeSource).toContain("executeSalesbotWebhook");
    expect(runtimeSource).toContain('from("external_automation_logs").insert');
    expect(runtimeSource).toContain("options.retries");
    expect(runtimeSource).toContain("options.authHeaderValue");
  });
});
