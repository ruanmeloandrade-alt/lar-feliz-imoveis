// Fachada da Central Google.
// Preserva a implementação existente, fixa Google Ads numa versão suportada
// e usa a Merchant API atual. OAuth volta a usar o backend web server da MKTOn
// diretamente, sem a ponte app -> Edge Function.
export * from "./google.server.base";
import type { GoogleSecret } from "./google.server.base";

export const GOOGLE_ADS_API = "https://googleads.googleapis.com/v25";
export const GOOGLE_MERCHANT_ACCOUNTS_API = "https://merchantapi.googleapis.com/accounts/v1";
export const GOOGLE_MERCHANT_PRODUCTS_API = "https://merchantapi.googleapis.com/products/v1";

export function adsDeveloperToken(_secret: GoogleSecret): string {
  const token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!token) {
    throw new Error(
      "Google Ads ainda não foi habilitado pelo administrador da Vanessa Simoni: configure GOOGLE_ADS_DEVELOPER_TOKEN no servidor. O cliente final não deve informar Developer Token.",
    );
  }
  return token;
}

export function cleanCustomerId(id?: string | null): string {
  return (id ?? "").replace(/\D/g, "");
}

export async function adsListAccessibleCustomers(
  token: string,
  developerToken: string,
): Promise<string[]> {
  const r = await fetch(`${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, {
    headers: { Authorization: `Bearer ${token}`, "developer-token": developerToken },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Google Ads ${r.status}: ${txt.slice(0, 400)}`);
  const j = JSON.parse(txt) as { resourceNames?: string[] };
  return (j.resourceNames ?? []).map((n) => n.split("/")[1]).filter(Boolean);
}

export async function adsSearch<T = Record<string, unknown>>(args: {
  token: string;
  developerToken: string;
  customerId: string;
  loginCustomerId?: string;
  query: string;
}): Promise<T[]> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.token}`,
    "developer-token": args.developerToken,
    "Content-Type": "application/json",
  };
  const login = cleanCustomerId(args.loginCustomerId);
  if (login) headers["login-customer-id"] = login;

  const r = await fetch(
    `${GOOGLE_ADS_API}/customers/${cleanCustomerId(args.customerId)}/googleAds:search`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query: args.query, pageSize: 500 }),
    },
  );
  const txt = await r.text();
  if (!r.ok) throw new Error(`Google Ads ${r.status}: ${txt.slice(0, 500)}`);
  const j = JSON.parse(txt) as { results?: T[] };
  return j.results ?? [];
}

export function adsCampaignQuery(days: number) {
  const d = Math.max(1, Math.min(365, days));
  return `
    SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr,
           metrics.average_cpc, metrics.conversions, metrics.cost_per_conversion
    FROM campaign
    WHERE segments.date DURING LAST_${d === 7 ? "7" : d === 14 ? "14" : "30"}_DAYS
    ORDER BY metrics.cost_micros DESC
  `.trim();
}

export const ADS_ACCOUNT_QUERY =
  "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1";

// ============================================================
// Merchant Center — Merchant API v1
// ============================================================

interface MerchantAccountApi {
  name?: string;
  accountId?: string;
  accountName?: string;
  testAccount?: boolean;
}

interface MerchantPriceApi {
  amountMicros?: string;
  currencyCode?: string;
}

interface MerchantProductApi {
  name?: string;
  offerId?: string;
  productAttributes?: {
    title?: string;
    availability?: string;
    price?: MerchantPriceApi;
    salePrice?: MerchantPriceApi;
  };
}

function merchantPriceLabel(price?: MerchantPriceApi): string {
  if (!price?.amountMicros) return "";
  const amount = Number(price.amountMicros) / 1_000_000;
  if (!Number.isFinite(amount)) return "";
  const currency = price.currencyCode || "";
  try {
    return currency
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount)
      : String(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`.trim();
  }
}

async function merchantFetch<T>(url: string, token: string, label: string): Promise<T> {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const txt = await r.text();
  if (!r.ok) {
    const registrationHint =
      r.status === 403
        ? " Se o OAuth estiver correto, confirme também o registro de desenvolvedor do projeto Google Cloud na Merchant API."
        : "";
    throw new Error(`Merchant API ${label} ${r.status}: ${txt.slice(0, 400)}${registrationHint}`);
  }
  return (txt ? JSON.parse(txt) : {}) as T;
}

/** Lista as contas Merchant Center acessíveis pelo usuário OAuth. */
export async function merchantListAccounts(
  token: string,
): Promise<Array<{ id: string; name: string; resourceName: string; testAccount: boolean }>> {
  const out: Array<{ id: string; name: string; resourceName: string; testAccount: boolean }> = [];
  let pageToken = "";

  do {
    const url = new URL(`${GOOGLE_MERCHANT_ACCOUNTS_API}/accounts`);
    url.searchParams.set("pageSize", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const j = await merchantFetch<{ accounts?: MerchantAccountApi[]; nextPageToken?: string }>(
      url.toString(),
      token,
      "accounts.list",
    );
    for (const account of j.accounts ?? []) {
      const id = String(account.accountId ?? account.name?.split("/")[1] ?? "").trim();
      if (!id) continue;
      out.push({
        id,
        name: account.accountName || `Merchant ${id}`,
        resourceName: account.name || `accounts/${id}`,
        testAccount: Boolean(account.testAccount),
      });
    }
    pageToken = j.nextPageToken ?? "";
  } while (pageToken);

  return out;
}

/** Lista produtos processados pela Merchant API v1. */
export async function merchantListProducts(
  token: string,
  merchantId: string,
): Promise<Array<{ id: string; title: string; price: string; availability: string }>> {
  const id = String(merchantId).replace(/\D/g, "");
  if (!id) throw new Error("Merchant ID inválido.");

  const out: Array<{ id: string; title: string; price: string; availability: string }> = [];
  let pageToken = "";

  do {
    const url = new URL(`${GOOGLE_MERCHANT_PRODUCTS_API}/accounts/${id}/products`);
    url.searchParams.set("pageSize", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const j = await merchantFetch<{ products?: MerchantProductApi[]; nextPageToken?: string }>(
      url.toString(),
      token,
      "products.list",
    );
    for (const product of j.products ?? []) {
      const attrs = product.productAttributes ?? {};
      out.push({
        id: product.offerId || product.name || "produto",
        title: attrs.title || product.offerId || product.name || "Produto sem título",
        price: merchantPriceLabel(attrs.salePrice ?? attrs.price),
        availability: attrs.availability || "",
      });
    }
    pageToken = j.nextPageToken ?? "";
  } while (pageToken);

  return out;
}
