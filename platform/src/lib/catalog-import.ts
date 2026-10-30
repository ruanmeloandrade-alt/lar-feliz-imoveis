// Importação de catálogo de produtos a partir de arquivo CSV ou JSON.
// Não é integração com terceiros: é upload local, tudo processado no navegador.

export interface ImportedProduct {
  sku: string;
  name: string;
  description: string;
  image: string;
  price: number;
  promoPrice?: number;
  stock: number;
  category: string;
  active: boolean;
}

const ALIASES: Record<keyof ImportedProduct, string[]> = {
  sku: ["sku", "codigo", "código", "id", "ref", "referencia", "referência"],
  name: ["nome", "name", "titulo", "título", "produto", "title"],
  description: ["descricao", "descrição", "description", "detalhes"],
  image: ["imagem", "image", "foto", "image_url", "img"],
  price: ["preco", "preço", "price", "valor"],
  promoPrice: ["preco_promo", "preço_promo", "promo", "preco promocional", "sale_price"],
  stock: ["estoque", "stock", "quantidade", "qtd", "inventory"],
  category: ["categoria", "category", "tipo"],
  active: ["status", "ativo", "active", "situacao", "situação"],
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/^\ufeff/, "");
}

function toNumber(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const s = String(raw ?? "").replace(/[^\d,.-]/g, "").trim();
  if (!s) return 0;
  // 1.234,56 -> 1234.56 | 1234.56 mantém
  const normalized = s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function toActive(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return true;
  return !["inativo", "false", "0", "nao", "não", "off", "draft", "pausado"].includes(s);
}

/** Detecta o separador mais provável de um CSV (; , ou tab). */
function detectDelimiter(headerLine: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ";";
  let bestCount = -1;
  for (const c of candidates) {
    const count = headerLine.split(c).length;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

/** Split de linha CSV respeitando aspas duplas. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function rowToProduct(row: Record<string, unknown>, index: number): ImportedProduct | null {
  const lookup = (keys: string[]): unknown => {
    for (const k of Object.keys(row)) {
      if (keys.includes(norm(k))) return row[k];
    }
    return undefined;
  };

  const name = String(lookup(ALIASES.name) ?? "").trim();
  const sku = String(lookup(ALIASES.sku) ?? "").trim();
  if (!name && !sku) return null;

  const promoRaw = lookup(ALIASES.promoPrice);
  const promo = toNumber(promoRaw);

  return {
    sku: sku || `SKU-${index + 1}`,
    name: name || sku,
    description: String(lookup(ALIASES.description) ?? "").trim(),
    image: String(lookup(ALIASES.image) ?? "").trim(),
    price: toNumber(lookup(ALIASES.price)),
    promoPrice: promo > 0 ? promo : undefined,
    stock: Math.round(toNumber(lookup(ALIASES.stock))),
    category: String(lookup(ALIASES.category) ?? "").trim(),
    active: toActive(lookup(ALIASES.active)),
  };
}

export interface ImportResult {
  products: ImportedProduct[];
  skipped: number;
  format: "csv" | "json";
}

export function parseCatalogFile(fileName: string, content: string): ImportResult {
  const isJson = fileName.toLowerCase().endsWith(".json") || content.trim().startsWith("[") || content.trim().startsWith("{");

  if (isJson) {
    const parsed = JSON.parse(content) as unknown;
    const list: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { products?: unknown[] })?.products)
        ? ((parsed as { products: unknown[] }).products)
        : Array.isArray((parsed as { items?: unknown[] })?.items)
          ? ((parsed as { items: unknown[] }).items)
          : [];
    if (list.length === 0) throw new Error("Nenhum produto encontrado no JSON. Envie uma lista de produtos.");
    const products: ImportedProduct[] = [];
    let skipped = 0;
    list.forEach((item, i) => {
      const p = rowToProduct((item ?? {}) as Record<string, unknown>, i);
      if (p) products.push(p);
      else skipped++;
    });
    return { products, skipped, format: "json" };
  }

  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("O arquivo precisa ter o cabeçalho e pelo menos uma linha de produto.");
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((h) => h.replace(/^"|"$/g, ""));

  const products: ImportedProduct[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").replace(/^"|"$/g, "");
    });
    const p = rowToProduct(row, i - 1);
    if (p) products.push(p);
    else skipped++;
  }
  if (products.length === 0) {
    throw new Error(
      "Não reconheci nenhum produto. O cabeçalho precisa ter pelo menos as colunas nome (ou titulo) e preco.",
    );
  }
  return { products, skipped, format: "csv" };
}

export const CATALOG_TEMPLATE_CSV = [
  "sku;nome;descricao;preco;preco_promo;estoque;categoria;imagem;status",
  "SKU-001;Camiseta branca;Algodao premium;79,90;59,90;25;Vestuario;https://exemplo.com/foto.jpg;ativo",
  "SKU-002;Boné preto;Ajustavel;49,90;;10;Acessorios;;ativo",
].join("\n");
