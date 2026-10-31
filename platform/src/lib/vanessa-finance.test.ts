import { describe, it, expect } from "vitest";
import { commissionCents, summarizeVanessaDeals } from "./vanessa-finance.core";
import { declaredSiteFacts, normalizedSitePhone } from "./vanessa-site-chat.core";
describe("Vanessa financial and declared contact data", () => {
  it("calculates commissions with exact rounding in cents", () => {
    expect(commissionCents(20000000, "percentual", 300, 0)).toBe(600000);
    expect(commissionCents(101, "percentual", 5000, 0)).toBe(51);
    expect(commissionCents(20000000, "fixa", 0, 12345)).toBe(12345);
  });
  it("separates won/open/lost sales and excludes rental from VGV", () => {
    const summary = summarizeVanessaDeals(
      [
        { id: "a", value: 200000, stage_id: "open" },
        { id: "b", value: 300000, stage_id: "won" },
        { id: "c", value: 900000, stage_id: "lost" },
        { id: "d", value: 2000, stage_id: "won" },
      ],
      [
        { id: "open", name: "Visita" },
        { id: "won", name: "Venda ganha" },
        { id: "lost", name: "Perdido" },
      ],
      [
        { lead_id: "b", deal_kind: "venda", commission_cents: 900000, received_cents: 300000 },
        { lead_id: "d", deal_kind: "locacao", commission_cents: 200000, received_cents: 0 },
      ],
    );
    expect(summary.openVgv).toBe(20000000);
    expect(summary.soldVgv).toBe(30000000);
    expect(summary.receivedCommission).toBe(300000);
  });
  it("normalizes WhatsApp without conflating country codes", () => {
    expect(normalizedSitePhone("(19) 99225-0701")).toBe("+5519992250701");
    expect(normalizedSitePhone("+1 555 555 0199")).toBe("+15555550199");
    expect(() => normalizedSitePhone("123")).toThrow();
  });
  it("records only explicitly declared facts and preserves currency grouping", () => {
    expect(
      declaredSiteFacts(
        [
          {
            role: "user",
            content: "Tenho 30 anos, procuro em Campinas com 2 quartos e orçamento de R$ 250.000.",
          },
        ],
        ["Campinas"],
      ).age,
    ).toBe(30);
    expect(declaredSiteFacts([{ role: "user", content: "Orçamento de 250.000" }], []).budget).toBe(
      250000,
    );
    expect(declaredSiteFacts([{ role: "assistant", content: "Você tem 30 anos?" }], [])).toEqual(
      {},
    );
    expect(
      declaredSiteFacts(
        [{ role: "user", content: "Não quero Campinas e não tenho 30 anos." }],
        ["Campinas"],
      ),
    ).toEqual({});
  });
});
