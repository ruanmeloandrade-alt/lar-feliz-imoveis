import { describe, expect, it } from "vitest";
import {
  SalesbotIncompleteReadError,
  collectCompleteSalesbotPages,
  normalizeSalesbotBaseIds,
} from "@/lib/salesbot-safe-pagination";

describe("SalesBot F3 safe pagination", () => {
  it("loads more than 3,000 rows without relying on one global response", async () => {
    const source = Array.from({ length: 3407 }, (_, i) => ({ id: `blk-${i}` }));
    const rows = await collectCompleteSalesbotPages(
      source.length,
      async (from, to) => ({ rows: source.slice(from, to + 1) }),
      (row) => row.id,
      250,
    );
    expect(rows).toHaveLength(3407);
    expect(rows.at(-1)?.id).toBe("blk-3406");
  });

  it("fails closed when an API page is truncated", async () => {
    const source = Array.from({ length: 700 }, (_, i) => ({ id: `blk-${i}` }));
    await expect(
      collectCompleteSalesbotPages(
        source.length,
        async (from, to) => {
          if (from >= 250) return { rows: [] };
          return { rows: source.slice(from, to + 1) };
        },
        (row) => row.id,
        250,
      ),
    ).rejects.toBeInstanceOf(SalesbotIncompleteReadError);
  });

  it("propagates timeout/error after a partial page instead of returning partial data", async () => {
    const source = Array.from({ length: 600 }, (_, i) => ({ id: `blk-${i}` }));
    await expect(
      collectCompleteSalesbotPages(
        source.length,
        async (from, to) => {
          if (from >= 250) throw new Error("timeout");
          return { rows: source.slice(from, to + 1) };
        },
        (row) => row.id,
        250,
      ),
    ).rejects.toThrow("timeout");
  });

  it("rejects duplicate identities across pages", async () => {
    await expect(
      collectCompleteSalesbotPages(
        3,
        async (from) => ({
          rows: from === 0 ? [{ id: "a" }, { id: "b" }] : [{ id: "b" }],
        }),
        (row) => row.id,
        2,
      ),
    ).rejects.toBeInstanceOf(SalesbotIncompleteReadError);
  });

  it("normalizes the immutable base proof", () => {
    expect(normalizeSalesbotBaseIds(["z", "a", "z", "b"])).toEqual(["a", "b", "z"]);
  });
});
