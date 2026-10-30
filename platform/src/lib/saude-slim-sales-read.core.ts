export type PageResult<T> = { data: T[] | null; error: { message?: string } | null };

/** Read every page without assuming the server's configured maximum row count. */
export async function readAllSalesRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 500,
  maxPages = 2000,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error("Configuração de paginação inválida.");
  }
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const response = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (response.error) throw new Error(response.error.message || "Não foi possível carregar o histórico completo.");
    if (!Array.isArray(response.data)) throw new Error("Resposta inválida ao carregar o histórico.");
    if (response.data.length === 0) return rows;
    rows.push(...response.data);
  }
  throw new Error("A consulta atingiu o limite de segurança. Nenhum histórico parcial foi apresentado.");
}

export function salesStatus(status: string, stageName = ""): "open" | "won" | "lost" {
  // An explicit recorded outcome must never be reversed by the stage label.
  if (status === "won") return "won";
  if (status === "lost") return "lost";
  if (/perdid|cancel/i.test(stageName)) return "lost";
  if (/ganh|vendid|conclu/i.test(stageName)) return "won";
  return "open";
}
