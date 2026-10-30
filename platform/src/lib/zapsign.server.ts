// ZapSign API v1 — server-only.
// Credenciais BYOK ficam criptografadas no integration vault por workspace.

export type SbRpc = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export const ZAPSIGN_PROVIDER = "zapsign";
export const ZAPSIGN_BASE_URL = "https://api.zapsign.com.br/api/v1";

export interface ZapSignSecret {
  api_token: string;
  webhook_secret: string;
}

export interface ZapSignSigner {
  token: string;
  status?: string;
  name?: string;
  email?: string;
  sign_url?: string;
}

export interface ZapSignDocument {
  token: string;
  status: string;
  name: string;
  original_file?: string | null;
  signed_file?: string | null;
  signers?: ZapSignSigner[];
}

function encKey(): string {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
  return key;
}

export async function readZapSignSecret(sb: SbRpc, workspaceId: string): Promise<ZapSignSecret> {
  const { data, error } = await sb.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: ZAPSIGN_PROVIDER,
    _key: encKey(),
  });
  if (error) throw new Error(error.message ?? "Falha ao ler credenciais ZapSign.");
  const secret = data as ZapSignSecret | null;
  if (!secret?.api_token) throw new Error("ZapSign não conectada neste workspace.");
  if (!secret?.webhook_secret) throw new Error("Webhook Secret da ZapSign não configurado neste workspace.");
  return secret;
}

async function request<T>(secret: Pick<ZapSignSecret, "api_token">, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${ZAPSIGN_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret.api_token.replace(/^Bearer\s+/i, "")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`ZapSign recusou a operação (${response.status}): ${text.slice(0, 500)}`);
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function testZapSign(secret: Pick<ZapSignSecret, "api_token">): Promise<void> {
  await request(secret, "/docs/?page=1");
}

export async function createZapSignDocument(
  secret: ZapSignSecret,
  args: { name: string; pdfBytes: Uint8Array; signerName: string; signerEmail: string; externalId: string },
): Promise<ZapSignDocument> {
  const base64 = Buffer.from(args.pdfBytes).toString("base64");
  return request<ZapSignDocument>(secret, "/docs/", {
    method: "POST",
    body: JSON.stringify({
      name: args.name.slice(0, 255),
      base64_pdf: base64,
      external_id: args.externalId,
      lang: "pt-br",
      signers: [
        {
          name: args.signerName,
          email: args.signerEmail,
          auth_mode: "assinaturaTela-tokenEmail",
          lock_name: true,
          lock_email: true,
          send_automatic_email: true,
        },
      ],
    }),
  });
}

export async function getZapSignDocument(secret: ZapSignSecret, documentToken: string): Promise<ZapSignDocument> {
  return request<ZapSignDocument>(secret, `/docs/${encodeURIComponent(documentToken)}/`);
}
