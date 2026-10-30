import { describe, expect, it } from "vitest";
import { matchesDeterministicAdAttribution } from "./meta-creative-attribution.functions";

describe("matchesDeterministicAdAttribution", () => {
  it("aceita somente ad_id exato em utm_content", () => {
    expect(matchesDeterministicAdAttribution("120999001", "120999001")).toBe(true);
    expect(matchesDeterministicAdAttribution(" 120999001 ", "120999001")).toBe(true);
  });

  it("rejeita nomes parecidos e chaves incompletas", () => {
    expect(matchesDeterministicAdAttribution("campanha-verao", "120999001")).toBe(false);
    expect(matchesDeterministicAdAttribution("120999", "120999001")).toBe(false);
    expect(matchesDeterministicAdAttribution("120999001-extra", "120999001")).toBe(false);
  });

  it("rejeita atribuição quando falta uma das chaves", () => {
    expect(matchesDeterministicAdAttribution(null, "120999001")).toBe(false);
    expect(matchesDeterministicAdAttribution("120999001", null)).toBe(false);
    expect(matchesDeterministicAdAttribution("", "120999001")).toBe(false);
  });
});
