import { createHmac } from "crypto";

export type SalesbotWebhookMethod = "POST" | "PUT" | "PATCH";

export interface SalesbotWebhookRequest {
  url: string;
  method?: SalesbotWebhookMethod;
  secret?: string | null;
  headers?: Record<string, string>;
  body: Record<string, unknown>;
  timeoutMs?: number;
  retries?: number;
}

export interface SalesbotWebhookResult {
  ok: boolean;
  status: number | null;
  responseText: string;
  responseJson: unknown | null;
  error: string | null;
  attempts: number;
}

export function validateSalesbotWebhookUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL inválida. Use o endereço completo com https://");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("A URL precisa começar com https://");
  }

  const host = parsed.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  if (isPrivate) throw new Error("Endereços internos não são permitidos.");
  return parsed;
}

export function parseSalesbotWebhookResponse(text: string): unknown | null {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function executeSalesbotWebhook(input: SalesbotWebhookRequest): Promise<SalesbotWebhookResult> {
  const url = validateSalesbotWebhookUrl(input.url);
  const method = input.method ?? "POST";
  const timeoutMs = Math.max(1_000, Math.min(30_000, input.timeoutMs ?? 15_000));
  const retries = Math.max(0, Math.min(3, input.retries ?? 0));
  const body = JSON.stringify(input.body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(input.headers ?? {}),
  };

  if (input.secret) {
    const signature = "sha256=" + createHmac("sha256", input.secret).update(body).digest("hex");
    // Mantém o header legado para não quebrar cenários já configurados.
    headers["X-MKTOn-Signature"] = signature;
    // Header com a grafia atual da marca para novas integrações.
    headers["X-MktOn-Signature"] = signature;
  }

  let status: number | null = null;
  let responseText = "";
  let error: string | null = null;
  let attempts = 0;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    attempts = attempt + 1;
    status = null;
    responseText = "";
    error = null;

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      responseText = (await response.text().catch(() => "")).slice(0, 20_000);

      if (response.ok) {
        return {
          ok: true,
          status,
          responseText,
          responseJson: parseSalesbotWebhookResponse(responseText),
          error: null,
          attempts,
        };
      }

      error = `HTTP ${response.status}`;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) break;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }

    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  return {
    ok: false,
    status,
    responseText,
    responseJson: parseSalesbotWebhookResponse(responseText),
    error,
    attempts,
  };
}
