import { describe, expect, it } from "vitest";
import { parseSalesbotWebhookResponse } from "../salesbot-webhook.server";

describe("Salesbot external automation response", () => {
  it("preserves JSON response so runtime can map it into variables", () => {
    expect(parseSalesbotWebhookResponse('{"customer_id":"erp-123","approved":true}')).toEqual({
      customer_id: "erp-123",
      approved: true,
    });
  });

  it("keeps non-JSON response available as text", () => {
    expect(parseSalesbotWebhookResponse("accepted")).toBeNull();
  });
});
