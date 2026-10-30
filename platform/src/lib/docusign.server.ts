// DocuSign eSignature REST API v2.1 — server-only.

export const DOCUSIGN_PROVIDER = "docusign";

export type DocusignEnvironment = "production" | "demo";
export interface DocusignSecret {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account_id: string;
  base_uri: string;
  environment: DocusignEnvironment;
}

export type SbRpc = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function encKey(): string {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
  return key;
}

function integrationKey(): string {
  const value = process.env.DOCUSIGN_INTEGRATION_KEY;
  if (!value) throw new Error("DOCUSIGN_INTEGRATION_KEY não configurado.");
  return value;
}

function clientSecret(): string {
  const value = process.env.DOCUSIGN_CLIENT_SECRET;
  if (!value) throw new Error("DOCUSIGN_CLIENT_SECRET não configurado.");
  return value;
}

export function oauthBase(environment: DocusignEnvironment): string {
  return environment === "demo" ? "https://account-d.docusign.com" : "https://account.docusign.com";
}

export function authorizationUrl(args: { environment: DocusignEnvironment; redirectUri: string; state: string }): string {
  const url = new URL(`${oauthBase(args.environment)}/oauth/auth`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "signature extended");
  url.searchParams.set("client_id", integrationKey());
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("state", args.state);
  return url.toString();
}

async function tokenRequest(environment: DocusignEnvironment, body: URLSearchParams) {
  const basic = Buffer.from(`${integrationKey()}:${clientSecret()}`).toString("base64");
  const response = await fetch(`${oauthBase(environment)}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`DocuSign OAuth recusou a operação (${response.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text) as { access_token: string; refresh_token?: string; expires_in: number; token_type: string };
}

export async function exchangeCode(args: { environment: DocusignEnvironment; code: string; redirectUri: string }): Promise<DocusignSecret> {
  const token = await tokenRequest(args.environment, new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
  }));
  if (!token.refresh_token) throw new Error("DocuSign não retornou refresh token. Confirme o escopo extended.");

  const userInfoResponse = await fetch(`${oauthBase(args.environment)}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
  });
  const userInfoText = await userInfoResponse.text();
  if (!userInfoResponse.ok) throw new Error(`DocuSign userinfo falhou (${userInfoResponse.status}): ${userInfoText.slice(0, 500)}`);
  const userInfo = JSON.parse(userInfoText) as {
    accounts?: Array<{ account_id: string; base_uri: string; is_default?: boolean }>;
  };
  const account = userInfo.accounts?.find((a) => a.is_default) ?? userInfo.accounts?.[0];
  if (!account?.account_id || !account?.base_uri) throw new Error("Nenhuma conta DocuSign eSignature disponível para este usuário.");
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: new Date(Date.now() + Math.max(60, token.expires_in - 120) * 1000).toISOString(),
    account_id: account.account_id,
    base_uri: account.base_uri.replace(/\/$/, ""),
    environment: args.environment,
  };
}

export async function readDocusignSecret(sb: SbRpc, workspaceId: string): Promise<DocusignSecret> {
  const { data, error } = await sb.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: DOCUSIGN_PROVIDER,
    _key: encKey(),
  });
  if (error) throw new Error(error.message ?? "Falha ao ler credenciais DocuSign.");
  const secret = data as DocusignSecret | null;
  if (!secret?.refresh_token || !secret?.account_id || !secret?.base_uri) throw new Error("DocuSign não conectada neste workspace.");
  return secret;
}

export async function refreshSecret(secret: DocusignSecret): Promise<DocusignSecret> {
  if (Date.parse(secret.expires_at) > Date.now()) return secret;
  const token = await tokenRequest(secret.environment, new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: secret.refresh_token,
  }));
  return {
    ...secret,
    access_token: token.access_token,
    refresh_token: token.refresh_token || secret.refresh_token,
    expires_at: new Date(Date.now() + Math.max(60, token.expires_in - 120) * 1000).toISOString(),
  };
}

async function apiRequest<T>(secret: DocusignSecret, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${secret.base_uri}/restapi/v2.1/accounts/${encodeURIComponent(secret.account_id)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`DocuSign recusou a operação (${response.status}): ${text.slice(0, 500)}`);
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function testDocusign(secret: DocusignSecret): Promise<void> {
  await apiRequest(secret, "/envelopes?count=1&from_date=2020-01-01T00:00:00Z");
}

export async function createEnvelope(secret: DocusignSecret, args: {
  filename: string;
  mime: string;
  bytes: Uint8Array;
  signerName: string;
  signerEmail: string;
  webhookUrl: string;
}): Promise<{ envelopeId: string; status: string }> {
  const fileExtension = args.filename.split(".").pop()?.toLowerCase() || (args.mime === "application/pdf" ? "pdf" : "docx");
  return apiRequest(secret, "/envelopes", {
    method: "POST",
    body: JSON.stringify({
      emailSubject: `Assinatura MKTOn · ${args.filename}`,
      documents: [{
        documentBase64: Buffer.from(args.bytes).toString("base64"),
        name: args.filename,
        fileExtension,
        documentId: "1",
      }],
      recipients: {
        signers: [{
          email: args.signerEmail,
          name: args.signerName,
          recipientId: "1",
          routingOrder: "1",
          tabs: {
            signHereTabs: [{ documentId: "1", pageNumber: "1", xPosition: "100", yPosition: "150" }],
          },
        }],
      },
      eventNotification: {
        url: args.webhookUrl,
        loggingEnabled: "true",
        requireAcknowledgment: "true",
        deliveryMode: "SIM",
        envelopeEvents: [
          { envelopeEventStatusCode: "sent" },
          { envelopeEventStatusCode: "delivered" },
          { envelopeEventStatusCode: "completed" },
          { envelopeEventStatusCode: "declined" },
          { envelopeEventStatusCode: "voided" },
        ],
        eventData: { version: "restv2.1", format: "json", includeData: ["recipients"] },
      },
      status: "sent",
    }),
  });
}

export async function getEnvelope(secret: DocusignSecret, envelopeId: string): Promise<{ envelopeId: string; status: string }> {
  return apiRequest(secret, `/envelopes/${encodeURIComponent(envelopeId)}`);
}

export async function downloadCombinedDocument(secret: DocusignSecret, envelopeId: string): Promise<Uint8Array> {
  const response = await fetch(`${secret.base_uri}/restapi/v2.1/accounts/${encodeURIComponent(secret.account_id)}/envelopes/${encodeURIComponent(envelopeId)}/documents/combined`, {
    headers: { Authorization: `Bearer ${secret.access_token}`, Accept: "application/pdf" },
  });
  if (!response.ok) throw new Error(`DocuSign não liberou o PDF combinado (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

export function connectHmacSecret(): string {
  const value = process.env.DOCUSIGN_CONNECT_HMAC_SECRET;
  if (!value) throw new Error("DOCUSIGN_CONNECT_HMAC_SECRET não configurado.");
  return value;
}
