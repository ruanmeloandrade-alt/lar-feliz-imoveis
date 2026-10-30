import { describe, it, expect } from "vitest";
import { computePausaCronometroMs } from "../salesbot-runtime.server";

describe("Salesbot Timer and Months Calculation", () => {
  const D = 24 * 60 * 60 * 1000;

  it("calculates simple seconds and minutes", () => {
    const ms = computePausaCronometroMs({ seg: 30, min: 2 });
    expect(ms).toBe(30 * 1000 + 2 * 60 * 1000);
  });

  it("calculates 1 calendar month correctly", () => {
    const now = new Date("2026-08-08T12:00:00Z");
    const ms = computePausaCronometroMs({ meses: 1 }, now);
    
    // 08/08 + 1 month = 08/09
    const expectedDate = new Date("2026-09-08T12:00:00Z");
    const expected = expectedDate.getTime() - now.getTime();
    
    expect(ms).toBe(expected);
  });

  it("calculates multiple months", () => {
    const now = new Date("2026-08-08T12:00:00Z");
    const ms = computePausaCronometroMs({ meses: 2 }, now);
    
    // 08/08 + 2 months = 08/10
    const expectedDate = new Date("2026-10-08T12:00:00Z");
    const expected = expectedDate.getTime() - now.getTime();
    
    expect(ms).toBe(expected);
  });

  it("handles end of month overflow (Jan 31 + 1 month = Feb last day)", () => {
    const now = new Date("2026-01-31T12:00:00Z");
    const ms = computePausaCronometroMs({ meses: 1 }, now);
    
    // Jan 31 + 1 month = Feb 28 (2026 is not leap)
    const expectedDate = new Date("2026-02-28T12:00:00Z");
    const expected = expectedDate.getTime() - now.getTime();
    
    expect(ms).toBe(expected);
  });

  it("handles end of month overflow in leap years (Jan 31 2028 + 1 month = Feb 29)", () => {
    const now = new Date("2028-01-31T12:00:00Z");
    const ms = computePausaCronometroMs({ meses: 1 }, now);
    
    // Jan 31 + 1 month in 2028 = Feb 29
    const expectedDate = new Date("2028-02-29T12:00:00Z");
    const expected = expectedDate.getTime() - now.getTime();
    
    expect(ms).toBe(expected);
  });

  it("handles end of month overflow in non-leap years (Jan 31 2027 + 1 month = Feb 28)", () => {
    const now = new Date("2027-01-31T12:00:00Z");
    const ms = computePausaCronometroMs({ meses: 1 }, now);
    
    const expectedDate = new Date("2027-02-28T12:00:00Z");
    const expected = expectedDate.getTime() - now.getTime();
    
    expect(ms).toBe(expected);
  });

  it("caps exactly at 48 months-calendar", () => {
    const now = new Date("2026-08-08T12:00:00Z");
    
    // 48 months exactly
    const ms48 = computePausaCronometroMs({ meses: 48 }, now);
    const target48 = new Date("2030-08-08T12:00:00Z");
    expect(ms48).toBe(target48.getTime() - now.getTime());

    // 60 months -> should cap at 48 months
    const ms60 = computePausaCronometroMs({ meses: 60 }, now);
    expect(ms60).toBe(ms48);

    // 49 months -> should cap at 48 months
    const ms49 = computePausaCronometroMs({ meses: 49 }, now);
    expect(ms49).toBe(ms48);
    
    // 48 months + 1 day -> should cap at 48 months
    const ms48Plus = computePausaCronometroMs({ meses: 48, dias: 1 }, now);
    expect(ms48Plus).toBe(ms48);
  });

  it("handles legacy 'anos' converted to months", () => {
    const now = new Date("2026-08-08T12:00:00Z");
    const msLegacy = computePausaCronometroMs({ anos: 1 }, now); // 1 year -> 12 months
    const msNew = computePausaCronometroMs({ meses: 12 }, now);
    expect(msLegacy).toBe(msNew);
  });

  it("handles legacy 'anos' + 'meses' combined and capped", () => {
    const now = new Date("2026-08-08T12:00:00Z");
    const ms = computePausaCronometroMs({ anos: 4, meses: 12 }, now); // 48 + 12 = 60 -> capped at 48
    const ms48 = computePausaCronometroMs({ meses: 48 }, now);
    expect(ms).toBe(ms48);
  });
});
