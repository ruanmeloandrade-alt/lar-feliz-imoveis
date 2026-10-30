import { describe, expect, it } from "vitest";
import {
  conversationKey,
  directWhatsappJidFromCanonicalDigits,
  normalizeInternationalPhone,
  whatsappIdentityFromEvolutionJids,
  whatsappIdentityFromJid,
} from "./whatsapp-identity";

describe("normalizeInternationalPhone", () => {
  it("preserves explicit international DDIs in E.164", () => {
    expect(normalizeInternationalPhone("+55 21 99999-1234")).toMatchObject({
      ok: true,
      digits: "5521999991234",
      e164: "+5521999991234",
    });
    expect(normalizeInternationalPhone("+351 912 345 678")).toMatchObject({
      ok: true,
      digits: "351912345678",
      e164: "+351912345678",
    });
    expect(normalizeInternationalPhone("+44 7700 900123")).toMatchObject({
      ok: true,
      digits: "447700900123",
      e164: "+447700900123",
    });
    expect(normalizeInternationalPhone("+32 470 12 34 56")).toMatchObject({
      ok: true,
      digits: "32470123456",
      e164: "+32470123456",
    });
  });

  it("converts the international 00 prefix without assuming +55", () => {
    expect(normalizeInternationalPhone("00351912345678")).toEqual({
      ok: true,
      digits: "351912345678",
      e164: "+351912345678",
      source: "international_00",
    });
  });

  it("rejects bare digits as ambiguous unless they came from trusted canonical context", () => {
    expect(normalizeInternationalPhone("351912345678")).toEqual({
      ok: false,
      reason: "ambiguous",
    });
    expect(normalizeInternationalPhone("351912345678", { allowTrustedBare: true })).toEqual({
      ok: true,
      digits: "351912345678",
      e164: "+351912345678",
      source: "trusted_bare",
    });
    expect(normalizeInternationalPhone("21999991234")).toEqual({
      ok: false,
      reason: "ambiguous",
    });
  });

  it("keeps countries with the same last 8 digits as distinct identities", () => {
    const suffix = "12345678";
    const values = [
      `+55${suffix}`,
      `+351${suffix}`,
      `+44${suffix}`,
      `+32${suffix}`,
    ];
    const digits = values.map((value) => {
      const result = normalizeInternationalPhone(value);
      if (result.ok === false) throw new Error("expected canonical number");
      return result.digits;
    });
    expect(new Set(digits).size).toBe(4);
    expect(digits.map((value) => value.slice(-8))).toEqual([
      suffix,
      suffix,
      suffix,
      suffix,
    ]);
  });
});

describe("whatsappIdentityFromJid", () => {
  it("uses the full direct JID as authoritative identity", () => {
    expect(whatsappIdentityFromJid("351912345678@s.whatsapp.net")).toEqual({
      kind: "direct",
      remoteJid: "351912345678@s.whatsapp.net",
      number: "351912345678",
      digits: "351912345678",
      e164: "+351912345678",
    });
  });

  it("preserves group JIDs and never turns them into a direct phone", () => {
    const jid = "120363012345678901@g.us";
    expect(whatsappIdentityFromJid(jid)).toEqual({
      kind: "group",
      remoteJid: jid,
      number: jid,
      digits: null,
      e164: null,
    });
  });

  it("does not reinterpret LID or broadcast identities as phones", () => {
    expect(whatsappIdentityFromJid("123456789@lid")).toBeNull();
    expect(whatsappIdentityFromJid("status@broadcast")).toBeNull();
  });

  it("uses Evolution remoteJidAlt for LID without treating LID digits as a phone", () => {
    expect(
      whatsappIdentityFromEvolutionJids(
        "123456789012345@lid",
        "351912345678@s.whatsapp.net",
      ),
    ).toEqual({
      kind: "direct",
      remoteJid: "351912345678@s.whatsapp.net",
      number: "351912345678",
      digits: "351912345678",
      e164: "+351912345678",
    });
    expect(whatsappIdentityFromEvolutionJids("123456789012345@lid")).toBeNull();
  });

  it("builds stable conversation keys with session + real JID", () => {
    expect(conversationKey("session-a", "351912345678@s.whatsapp.net")).not.toBe(
      conversationKey("session-b", "351912345678@s.whatsapp.net"),
    );
    expect(directWhatsappJidFromCanonicalDigits("351912345678")).toBe(
      "351912345678@s.whatsapp.net",
    );
  });
});
