import { describe, expect, it } from "vitest";
import { allocateDashboardDealRevenue } from "./dashboard-v4-product-sales-revenue";

describe("Dashboard product sales revenue allocation", () => {
  it("uses the final negotiated deal value instead of the catalog snapshot", () => {
    const [line] = allocateDashboardDealRevenue(800, [
      { productId: "produto-a", quantity: 1, unitPrice: 1000 },
    ]);

    expect(line.revenue).toBe(800);
    expect(line.revenueKnown).toBe(true);
  });

  it("rates a multi-product final value by the recorded line subtotals", () => {
    const lines = allocateDashboardDealRevenue(900, [
      { productId: "produto-a", quantity: 2, unitPrice: 300 },
      { productId: "produto-b", quantity: 1, unitPrice: 600 },
    ]);

    expect(lines.map((line) => line.revenue)).toEqual([450, 450]);
    expect(lines.reduce((sum, line) => sum + line.revenue, 0)).toBe(900);
  });

  it("falls back to quantity when a multi-product snapshot is incomplete", () => {
    const lines = allocateDashboardDealRevenue(900, [
      { productId: "produto-a", quantity: 2, unitPrice: 300 },
      { productId: "produto-b", quantity: 1, unitPrice: null },
    ]);

    expect(lines.map((line) => line.revenue)).toEqual([600, 300]);
    expect(lines.reduce((sum, line) => sum + line.revenue, 0)).toBe(900);
  });

  it("keeps historical snapshot revenue when the deal has no final value", () => {
    const lines = allocateDashboardDealRevenue(null, [
      { productId: "produto-a", quantity: 2, unitPrice: 125 },
      { productId: "produto-b", quantity: 1, unitPrice: null },
    ]);

    expect(lines[0]).toMatchObject({ revenue: 250, revenueKnown: true });
    expect(lines[1]).toMatchObject({ revenue: 0, revenueKnown: false });
  });
});
