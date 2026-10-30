/**
 * Categorias de catálogo: mesmo nome escrito de formas diferentes
 * (acento, caixa, espaço, plural com espaço extra) precisa cair na MESMA
 * categoria — para as métricas de estoque/venda por categoria baterem.
 */

/** Chave canônica usada para comparar duas categorias escritas à mão. */
export function categoryKey(raw: string): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Limpa espaços duplicados e bordas, preservando a escrita do usuário. */
export function cleanCategoryLabel(raw: string): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Devolve a grafia oficial da categoria: se já existe uma categoria
 * equivalente no workspace, reaproveita a grafia existente (linkando os
 * produtos); caso contrário, usa a grafia nova já limpa.
 */
export function canonicalCategory(input: string, existing: readonly string[]): string {
  const label = cleanCategoryLabel(input);
  if (!label) return "";
  const key = categoryKey(label);
  const match = existing.find((e) => categoryKey(e) === key && cleanCategoryLabel(e));
  return match ? cleanCategoryLabel(match) : label;
}

export interface CategoryStats {
  /** Grafia oficial exibida na interface. */
  label: string;
  /** Chave de agrupamento (comparação sem acento/caixa). */
  key: string;
  products: number;
  active: number;
  inactive: number;
  /** Soma das unidades em estoque. */
  stock: number;
  /** Produtos sem estoque (serviços contam como 0 e aparecem aqui). */
  outOfStock: number;
  /** Valor potencial: preço efetivo × estoque. */
  stockValue: number;
  /** Ticket médio da categoria (preço efetivo). */
  avgPrice: number;
  catalogs: string[];
}

type ProductLike = {
  category: string;
  price: number;
  promoPrice?: number | null;
  stock: number;
  active: boolean;
  catalogName?: string;
};

/** Agrupa produtos por categoria canônica e calcula as métricas de estoque. */
export function buildCategoryStats(products: readonly ProductLike[]): CategoryStats[] {
  const map = new Map<string, CategoryStats & { _priceSum: number }>();
  for (const p of products) {
    const label = cleanCategoryLabel(p.category) || "Sem categoria";
    const key = categoryKey(label) || "__sem_categoria";
    let row = map.get(key);
    if (!row) {
      row = {
        label,
        key,
        products: 0,
        active: 0,
        inactive: 0,
        stock: 0,
        outOfStock: 0,
        stockValue: 0,
        avgPrice: 0,
        catalogs: [],
        _priceSum: 0,
      };
      map.set(key, row);
    }
    const price = p.promoPrice && p.promoPrice > 0 && p.promoPrice < p.price ? p.promoPrice : p.price;
    row.products += 1;
    if (p.active) row.active += 1;
    else row.inactive += 1;
    row.stock += p.stock || 0;
    if (!p.stock) row.outOfStock += 1;
    row.stockValue += price * (p.stock || 0);
    row._priceSum += price;
    if (p.catalogName && !row.catalogs.includes(p.catalogName)) row.catalogs.push(p.catalogName);
  }
  return [...map.values()]
    .map(({ _priceSum, ...r }) => ({ ...r, avgPrice: r.products ? _priceSum / r.products : 0 }))
    .sort((a, b) => b.products - a.products || a.label.localeCompare(b.label));
}
