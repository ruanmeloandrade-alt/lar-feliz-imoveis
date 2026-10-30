import { describe, expect, it } from "vitest";
import {
  parseSalesbotWebhookResponse,
  validateSalesbotWebhookUrl,
} from "@/lib/salesbot-webhook.server";

describe("salesbot webhook executor", () => {
  it("aceita endpoints HTTP(S) públicos", () => {
    expect(validateSalesbotWebhookUrl("https://example.com/hook").hostname).toBe("example.com");
    expect(validateSalesbotWebhookUrl("http://example.com/hook").protocol).toBe("http:");
  });

  it("bloqueia destinos locais e redes privadas", () => {
    const blocked = [
      "http://localhost:3000/hook",
      "http://127.0.0.1/hook",
      "http://10.0.0.8/hook",
      "http://172.16.0.1/hook",
      "http://192.168.1.10/hook",
      "http://169.254.169.254/latest/meta-data",
    ];

    for (const url of blocked) {
      expect(() => validateSalesbotWebhookUrl(url)).toThrow(/internos não são permitidos/i);
    }
  });

  it("rejeita protocolos que não são HTTP(S)", () => {
    expect(() => validateSalesbotWebhookUrl("file:///etc/passwd")).toThrow(/https:\/\//i);
  });

  it("interpreta JSON sem destruir respostas de texto", () => {
    expect(parseSalesbotWebhookResponse('{"ok":true,"id":123}')).toEqual({ ok: true, id: 123 });
    expect(parseSalesbotWebhookResponse("resposta simples")).toBeNull();
    expect(parseSalesbotWebhookResponse("   ")).toBeNull();
  });
});
