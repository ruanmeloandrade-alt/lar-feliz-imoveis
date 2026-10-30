import { describe, expect, it } from "vitest";
import { buildCampaignSchedule, campaignDateIsInsidePeriod } from "./social-campaign-rules";

const weekly = {
  kind: "weekly" as const,
  perWeek: 3,
  days: [1, 3, 5],
  hour: 9,
  minute: 0,
};

describe("social campaign date rules", () => {
  it("nunca cria slots depois do fim da campanha", () => {
    const result = buildCampaignSchedule(3, "2026-08-10", "2026-08-16", weekly);
    expect(result).toHaveLength(3);
    expect(result.every((date) => date <= new Date("2026-08-16T23:59:59.999Z"))).toBe(true);
  });

  it("falha claramente quando a cadência não comporta a quantidade", () => {
    expect(() => buildCampaignSchedule(4, "2026-08-10", "2026-08-12", weekly)).toThrow(
      /comporta/i,
    );
  });

  it("agenda diariamente dentro do período sem fabricar datas extras", () => {
    const result = buildCampaignSchedule(
      3,
      "2026-08-10",
      "2026-08-12",
      { ...weekly, kind: "daily" },
    );
    expect(result.map((date) => date.toISOString().slice(0, 10))).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
  });

  it("valida data explícita dentro do período", () => {
    expect(campaignDateIsInsidePeriod("2026-08-12T09:00:00.000Z", "2026-08-10", "2026-08-15")).toBe(true);
    expect(campaignDateIsInsidePeriod("2026-08-16T09:00:00.000Z", "2026-08-10", "2026-08-15")).toBe(false);
  });
});
