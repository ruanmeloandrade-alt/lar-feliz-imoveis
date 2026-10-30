import { describe, expect, it } from "vitest";

function norm(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function matches(mode: "any" | "contains" | "equals", keywords: string[], text: string) {
  if (mode === "any") return true;
  const incoming = norm(text);
  const keys = keywords.map(norm).filter(Boolean);
  if (!incoming || !keys.length) return false;
  if (mode === "equals") return keys.some((key) => incoming === key);
  return keys.some((key) => incoming.includes(key));
}

describe("social post comment automation matching", () => {
  it("matches any comment", () => {
    expect(matches("any", [], "qualquer coisa")).toBe(true);
  });

  it("matches contains ignoring case and accents", () => {
    expect(matches("contains", ["preço"], "QUAL O PRECO desse produto?")).toBe(true);
  });

  it("requires the full normalized comment for equals", () => {
    expect(matches("equals", ["quero"], "Quero")).toBe(true);
    expect(matches("equals", ["quero"], "eu quero")).toBe(false);
  });

  it("does not trigger keyword mode without keywords", () => {
    expect(matches("contains", [], "quero")).toBe(false);
  });
});
