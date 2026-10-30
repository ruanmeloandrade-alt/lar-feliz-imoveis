import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const types = readFileSync(resolve(process.cwd(), "src/lib/salesbot-types.ts"), "utf8");
const runtime = readFileSync(resolve(process.cwd(), "src/lib/salesbot-runtime.server.ts"), "utf8");
const builder = readFileSync(resolve(process.cwd(), "src/components/automations/SalesbotBuilder.tsx"), "utf8");

describe("Salesbot external automation branching contract", () => {
  it("stores connected provider, response variable and error destination", () => {
    expect(types).toContain("webhookAutomationId?: string");
    expect(types).toContain('webhookProvider?: "n8n" | "make" | "zapier" | "custom"');
    expect(types).toContain("webhookResponseVariable?: string");
    expect(types).toContain("webhookErrorNextBlockId?: string");
  });

  it("persists webhook response and execution status into Salesbot variables", () => {
    expect(runtime).toContain("webhook_ok: result.ok");
    expect(runtime).toContain("webhook_status: result.status ?? 0");
    expect(runtime).toContain('webhook_error: result.error ?? ""');
    expect(runtime).toContain("[responseKey]: responseValue");
    expect(runtime).toContain('from("salesbot_runs")');
    expect(runtime).toContain(".update({ variables: nextVariables })");
  });

  it("supports an explicit error branch while preserving direct URL fallback", () => {
    expect(runtime).toContain('String(b.config.acaoTipo ?? "") === "webhook"');
    expect(runtime).toContain("b.config.webhookErrorNextBlockId");
    expect(runtime).toContain("webhookErrorNext || b.next_block_id");
    expect(runtime).toContain("cfg.webhookUrl");
    expect(runtime).toContain("executeSalesbotWebhook");
  });

  it("wires the connected automation editor into the existing Salesbot builder", () => {
    expect(builder).toContain('import { SalesbotWebhookEditor } from "./SalesbotWebhookEditor"');
    expect(builder).toContain("<SalesbotWebhookEditor block={block} allBlocks={allBlocks} onChange={onChange} />");
  });
});
