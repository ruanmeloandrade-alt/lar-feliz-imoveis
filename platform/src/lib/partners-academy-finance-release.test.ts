import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const academy = readFileSync(resolve(process.cwd(), "src/routes/partners.faculdade.tsx"), "utf8");
const finance = readFileSync(resolve(process.cwd(), "src/routes/partners.financeiro.tsx"), "utf8");
const paymentApi = readFileSync(resolve(process.cwd(), "src/routes/api/partners/payment-profile.ts"), "utf8");
const affiliate = readFileSync(resolve(process.cwd(), "src/routes/partners.afiliado.tsx"), "utf8");
const partner = readFileSync(resolve(process.cwd(), "src/routes/partners.parceiro.tsx"), "utf8");

describe("Partners release — Faculdade + Financeiro", () => {
  it("Faculdade usa backend real sem conteúdo fictício", () => {
    expect(academy).toContain("partner_program_my_academy_progress");
    expect(academy).toContain("partner_program_complete_academy_lesson");
    expect(academy).toContain("partner_program_academy_courses");
    expect(academy).toContain("0 cursos publicados");
  });

  it("financeiro usa perfil seguro e payout manual", () => {
    expect(finance).toContain("/api/partners/payment-profile");
    expect(finance).toContain("partner_program_request_payout");
    expect(finance).toContain("Pagamentos são processados manualmente nesta fase");
  });

  it("endpoint exige chave server-side e nunca devolve segredo", () => {
    expect(paymentApi).toContain("PARTNER_PROGRAM_ENCRYPTION_KEY");
    expect(paymentApi).toContain("partner_program_set_payment_profile_service");
    expect(paymentApi).toContain("document_last4");
    expect(paymentApi).toContain("pix_key_last4");
    expect(paymentApi).not.toContain("select(\"document_encrypted");
    expect(paymentApi).not.toContain("pix_key_encrypted");
  });

  it("painéis expõem os destinos corretos", () => {
    expect(affiliate).toContain("/partners/financeiro");
    expect(partner).toContain("/partners/faculdade");
    expect(partner).toContain("/partners/financeiro");
  });
});
