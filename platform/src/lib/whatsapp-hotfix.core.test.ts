import { describe, expect, it } from "vitest";
import {
  extractEvolutionProviderMessage,
  isEvolutionConnectionClosedMessage,
  isExplicitEvolutionDisconnectedState,
  normalizeWhatsAppGroupParticipant,
} from "./whatsapp-groups.functions";
import {
  isEvolutionConnectionClosedMessage as isInboxMediaConnectionClosedMessage,
  normalizeEvolutionDeliveryStatus,
} from "./leads.functions";

describe("WhatsApp hotfix contracts", () => {
  it("sends group participants to Evolution as DDI digits, not WhatsApp JIDs", () => {
    expect(normalizeWhatsAppGroupParticipant("+55 (22) 99999-9999")).toBe("5522999999999");
    expect(normalizeWhatsAppGroupParticipant("5522999999999@s.whatsapp.net")).toBe("5522999999999");
    expect(() => normalizeWhatsAppGroupParticipant("1234")).toThrow(/participante inválido/i);
  });

  it("detects Evolution states that should trigger connection recovery", () => {
    expect(isExplicitEvolutionDisconnectedState("close")).toBe(true);
    expect(isExplicitEvolutionDisconnectedState("CLOSED")).toBe(true);
    expect(isExplicitEvolutionDisconnectedState("disconnected")).toBe(true);
    expect(isExplicitEvolutionDisconnectedState("logout")).toBe(true);
    expect(isExplicitEvolutionDisconnectedState("open")).toBe(false);
    expect(isExplicitEvolutionDisconnectedState("connecting")).toBe(false);
    expect(isExplicitEvolutionDisconnectedState("unknown-provider-state")).toBe(false);
    expect(isExplicitEvolutionDisconnectedState(null)).toBe(false);
  });

  it("recognizes the provider Connection Closed error for one safe restart and retry", () => {
    expect(isEvolutionConnectionClosedMessage("Connection Closed")).toBe(true);
    expect(isEvolutionConnectionClosedMessage("Error: connection close")).toBe(true);
    expect(isEvolutionConnectionClosedMessage("invalid participant")).toBe(false);
    expect(isEvolutionConnectionClosedMessage(null)).toBe(false);
  });

  it("recognizes Connection Closed on Inbox media without treating unrelated errors as retryable", () => {
    expect(isInboxMediaConnectionClosedMessage("Error: Connection Closed")).toBe(true);
    expect(isInboxMediaConnectionClosedMessage("connection close")).toBe(true);
    expect(isInboxMediaConnectionClosedMessage("timeout while uploading media")).toBe(false);
    expect(isInboxMediaConnectionClosedMessage(undefined)).toBe(false);
  });

  it("preserves useful Evolution errors instead of a generic internal server error", () => {
    expect(
      extractEvolutionProviderMessage(
        { response: { message: ["Connection Closed", "retry later"] } },
        "fallback",
      ),
    ).toBe("Connection Closed, retry later");
    expect(extractEvolutionProviderMessage({ message: "invalid participant" }, "fallback")).toBe(
      "invalid participant",
    );
    expect(extractEvolutionProviderMessage({ raw: "upstream unavailable" }, "fallback")).toBe(
      "upstream unavailable",
    );
    expect(extractEvolutionProviderMessage(null, "fallback")).toBe("fallback");
  });

  it("does not promote an accepted Evolution media request to delivered", () => {
    expect(normalizeEvolutionDeliveryStatus({ status: "PENDING" })).toBe("pending");
    expect(normalizeEvolutionDeliveryStatus({ key: { id: "abc" } })).toBe("pending");
    expect(normalizeEvolutionDeliveryStatus({ status: "SERVER_ACK" })).toBe("sent");
    expect(normalizeEvolutionDeliveryStatus({ status: "DELIVERY_ACK" })).toBe("delivered");
    expect(normalizeEvolutionDeliveryStatus({ status: "READ" })).toBe("read");
    expect(normalizeEvolutionDeliveryStatus({ status: "PLAYED" })).toBe("played");
    expect(normalizeEvolutionDeliveryStatus({ status: "FAILED" })).toBe("failed");
  });
});
