export class SalesbotIncompleteReadError extends Error {
  constructor(message = "salesbot_incomplete_read") {
    super(message);
    this.name = "SalesbotIncompleteReadError";
  }
}

export interface CompletePage<T> {
  rows: T[];
}

/**
 * Collects an exact, finite result set page-by-page.
 *
 * The caller supplies the exact count captured before the first page. A short
 * page is allowed only when it is the final page. Any rejection, empty page
 * before completion, duplicate identity, or final count mismatch fails closed.
 */
export async function collectCompleteSalesbotPages<T>(
  expectedCount: number,
  fetchPage: (from: number, to: number) => Promise<CompletePage<T>>,
  identify: (row: T) => string,
  pageSize = 250,
): Promise<T[]> {
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) {
    throw new SalesbotIncompleteReadError("salesbot_invalid_expected_count");
  }
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new SalesbotIncompleteReadError("salesbot_invalid_page_size");
  }
  if (expectedCount === 0) return [];

  const out: T[] = [];
  const seen = new Set<string>();

  while (out.length < expectedCount) {
    const from = out.length;
    const to = Math.min(expectedCount - 1, from + pageSize - 1);
    const page = await fetchPage(from, to);
    if (!page || !Array.isArray(page.rows) || page.rows.length === 0) {
      throw new SalesbotIncompleteReadError("salesbot_page_ended_before_expected_count");
    }

    for (const row of page.rows) {
      const id = identify(row);
      if (!id || seen.has(id)) {
        throw new SalesbotIncompleteReadError("salesbot_duplicate_or_missing_page_identity");
      }
      seen.add(id);
      out.push(row);
      if (out.length > expectedCount) {
        throw new SalesbotIncompleteReadError("salesbot_page_exceeded_expected_count");
      }
    }
  }

  if (out.length !== expectedCount) {
    throw new SalesbotIncompleteReadError("salesbot_final_count_mismatch");
  }
  return out;
}

export function normalizeSalesbotBaseIds(ids: Iterable<string>): string[] {
  return [...new Set([...ids].filter(Boolean))].sort();
}
