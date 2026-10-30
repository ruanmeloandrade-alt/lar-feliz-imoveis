import { describe, expect, it } from "vitest";
import { emailChangeErrorMessage, normalizeLoginEmail, sameLoginEmail } from "@/lib/account-email.core";

describe("account email helpers", () => {
  it("normaliza o e-mail usado no login", () => {
    expect(normalizeLoginEmail("  Cliente@Example.COM  ")).toBe("cliente@example.com");
  });

  it("compara e-mails ignorando caixa e espaços externos", () => {
    expect(sameLoginEmail("Cliente@Example.com", " cliente@example.COM ")).toBe(true);
    expect(sameLoginEmail("um@example.com", "outro@example.com")).toBe(false);
  });

  it("não vaza erro técnico quando o e-mail já pertence a outra conta", () => {
    expect(emailChangeErrorMessage(new Error("A user with this email address has already been registered"))).toBe(
      "Este e-mail já está em uso por outra conta.",
    );
  });

  it("mapeia erros de e-mail inválido", () => {
    expect(emailChangeErrorMessage(new Error("Invalid email address"))).toBe("Informe um e-mail válido.");
  });
});
