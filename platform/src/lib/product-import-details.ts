export interface ProductDetails {
  costPrice?: number | null;
  minStock?: number | null;
  unit?: string;
  stockKnown?: boolean;
  importSnapshot?: Record<string, unknown> | null;
}
export function productDetailsFromRow(row: Record<string, unknown>): ProductDetails {
  return {
    costPrice: row.cost_price == null ? null : Number(row.cost_price),
    minStock: row.minimum_stock == null ? null : Number(row.minimum_stock),
    unit: typeof row.unit === "string" ? row.unit : "",
    stockKnown: row.stock_known !== false,
    importSnapshot:
      row.import_snapshot && typeof row.import_snapshot === "object"
        ? (row.import_snapshot as Record<string, unknown>)
        : null,
  };
}
export function productStockQuantity(value: unknown): number {
  const stock = Number(value);
  if (!Number.isSafeInteger(stock) || stock < -2147483648 || stock > 2147483647)
    throw new Error("Informe uma quantidade inteira de estoque válida.");
  return stock;
}
export function productDetailsPatch(input: ProductDetails): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.costPrice !== undefined) {
    if (input.costPrice !== null && (!Number.isFinite(input.costPrice) || input.costPrice < 0))
      throw new Error("Preço de custo inválido.");
    patch.cost_price = input.costPrice;
  }
  if (input.minStock !== undefined) {
    if (
      input.minStock !== null &&
      (!Number.isSafeInteger(input.minStock) || input.minStock < 0 || input.minStock > 2147483647)
    )
      throw new Error("Estoque mínimo inválido.");
    patch.minimum_stock = input.minStock;
  }
  if (input.unit !== undefined) patch.unit = input.unit.trim();
  if (input.stockKnown !== undefined) {
    if (typeof input.stockKnown !== "boolean") throw new Error("Estado do estoque inválido.");
    patch.stock_known = input.stockKnown;
  }
  return patch;
}
