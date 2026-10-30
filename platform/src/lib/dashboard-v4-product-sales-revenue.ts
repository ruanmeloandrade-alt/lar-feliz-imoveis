export type DashboardProductRevenueLine = {
  productId: string;
  quantity: number;
  unitPrice: number | null;
};

export type DashboardProductRevenueAllocation = DashboardProductRevenueLine & {
  revenue: number;
  revenueKnown: boolean;
};

/**
 * O valor final do negócio é a fonte canônica de receita.
 *
 * Para negócios multiproduto, o total é rateado sem duplicação:
 * - por subtotal quantity × unitPrice quando todas as linhas têm snapshot;
 * - por quantidade quando o snapshot está incompleto.
 *
 * Sem valor final conhecido, preservamos apenas snapshots históricos existentes.
 */
export function allocateDashboardDealRevenue(
  finalDealValue: number | null,
  lines: DashboardProductRevenueLine[],
): DashboardProductRevenueAllocation[] {
  if (!lines.length) return [];

  const normalized = lines.map((line) => ({
    ...line,
    quantity: Math.max(0, Number.isFinite(line.quantity) ? line.quantity : 0),
    unitPrice: line.unitPrice != null && Number.isFinite(line.unitPrice) ? Math.max(0, line.unitPrice) : null,
  }));

  if (finalDealValue != null && Number.isFinite(finalDealValue)) {
    const dealValue = Math.max(0, finalDealValue);
    const allSnapshotPriced = normalized.every((line) => line.unitPrice != null);
    const snapshotWeights = normalized.map((line) => line.quantity * (line.unitPrice ?? 0));
    const snapshotTotal = snapshotWeights.reduce((sum, value) => sum + value, 0);
    const quantityTotal = normalized.reduce((sum, line) => sum + line.quantity, 0);
    const useSnapshotWeights = allSnapshotPriced && snapshotTotal > 0;
    const weights = useSnapshotWeights
      ? snapshotWeights
      : normalized.map((line) => (quantityTotal > 0 ? line.quantity : 1));
    const weightTotal = weights.reduce((sum, value) => sum + value, 0) || normalized.length;

    let allocated = 0;
    return normalized.map((line, index) => {
      const isLast = index === normalized.length - 1;
      const revenue = isLast
        ? Math.max(0, dealValue - allocated)
        : dealValue * (weights[index] / weightTotal);
      allocated += revenue;
      return { ...line, revenue, revenueKnown: true };
    });
  }

  return normalized.map((line) => ({
    ...line,
    revenue: line.unitPrice == null ? 0 : line.quantity * line.unitPrice,
    revenueKnown: line.unitPrice != null,
  }));
}
