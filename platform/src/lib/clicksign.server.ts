// Clicksign API v3 (Envelope) — server-only.
// Credenciais BYOK ficam criptografadas no integration vault por workspace.

export type SbRpc = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export const CLICKSIGN_PROVIDER = "clicksign";
export const CLICKSIGN_PROD_BASE = "https://app.clicksign.com/api/v3";
export const CLICKSIGN_SANDBOX_BASE = "https://sandbox.clicksign.com/api/v3";

export interface ClicksignSecret {
  access_token: string;
  environment?: "production" | "sandbox";
  webhook_secret?: string;
}

export interface JsonApiResource<T = Record<string, unknown>> {
  id: string;
  type: string;
  attributes?: T;
  links?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
}

function encKey(): string {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY não configurado.");
  return key;
}

export function clicksignBaseUrl(secret: ClicksignSecret): string {
  return secret.environment === "sandbox" ? CLICKSIGN_SANDBOX_BASE : CLICKSIGN_PROD_BASE;
}

export async function readClicksignSecret(sb: SbRpc, workspaceId: string): Promise<ClicksignSecret> {
  const { data, error } = await sb.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: CLICKSIGN_PROVIDER,
    _key: encKey(),
  });
  if (error) throw new Error(error.message ?? "Falha ao ler credenciais Clicksign.");
  const secret = data as ClicksignSecret | null;
  if (!secret?.access_token) throw new Error("Clicksign não conectada neste workspace.");
  return secret;
}

export async function readClicksignSecretSafe(sb: SbRpc, workspaceId: string) {
  try { return await readClicksignSecret(sb, workspaceId); } catch { return null; }
}

async function request<T>(secret: ClicksignSecret, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${clicksignBaseUrl(secret)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret.access_token.replace(/^Bearer\s+/i, "")}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Clicksign recusou a operação (${response.status}): ${text.slice(0, 500)}`);
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function testClicksign(secret: ClicksignSecret): Promise<void> {
  await request(secret, "/envelopes?page[size]=1");
}

export async function createEnvelope(secret: ClicksignSecret, name: string) {
  return request<{ data: JsonApiResource }>(secret, "/envelopes", {
    method: "POST",
    body: JSON.stringify({ data: { type: "envelopes", attributes: { name } } }),
  });
}

export async function uploadDocument(secret: ClicksignSecret, envelopeId: string, args: { filename: string; mime: string; bytes: Uint8Array }) {
  const content = Buffer.from(args.bytes).toString("base64");
  return request<{ data: JsonApiResource }>(secret, `/envelopes/${encodeURIComponent(envelopeId)}/documents`, {
    method: "POST",
    body: JSON.stringify({ data: { type: "documents", attributes: { filename: args.filename, content_base64: `data:${args.mime};base64,${content}` } } }),
  });
}

export async function createSigner(secret: ClicksignSecret, envelopeId: string, signer: { name: string; email: string }) {
  return request<{ data: JsonApiResource }>(secret, `/envelopes/${encodeURIComponent(envelopeId)}/signers`, {
    method: "POST",
    body: JSON.stringify({ data: { type: "signers", attributes: { name: signer.name, email: signer.email, communicate_events: { document_signed: "email", signature_request: "email", signature_reminder: "email" } } } }),
  });
}

async function createRequirement(secret: ClicksignSecret, envelopeId: string, documentId: string, signerId: string, attributes: Record<string, string>) {
  return request<{ data: JsonApiResource }>(secret, `/envelopes/${encodeURIComponent(envelopeId)}/requirements`, {
    method: "POST",
    body: JSON.stringify({ data: { type: "requirements", attributes, relationships: { document: { data: { type: "documents", id: documentId } }, signer: { data: { type: "signers", id: signerId } } } } }),
  });
}

export async function createEmailSigningRequirements(secret: ClicksignSecret, envelopeId: string, documentId: string, signerId: string) {
  await createRequirement(secret, envelopeId, documentId, signerId, { action: "agree", role: "sign" });
  await createRequirement(secret, envelopeId, documentId, signerId, { action: "provide_evidence", auth: "email" });
}

export async function activateEnvelope(secret: ClicksignSecret, envelopeId: string) {
  return request<{ data: JsonApiResource }>(secret, `/envelopes/${encodeURIComponent(envelopeId)}`, {
    method: "PATCH",
    body: JSON.stringify({ data: { id: envelopeId, type: "envelopes", attributes: { status: "running" } } }),
  });
}

export async function notifyEnvelope(secret: ClicksignSecret, envelopeId: string): Promise<void> {
  await request(secret, `/envelopes/${encodeURIComponent(envelopeId)}/notifications`, {
    method: "POST",
    body: JSON.stringify({ data: { type: "notifications", attributes: {} } }),
  });
}

export async function getEnvelope(secret: ClicksignSecret, envelopeId: string) {
  return request<{ data: JsonApiResource<Record<string, unknown>> }>(secret, `/envelopes/${encodeURIComponent(envelopeId)}`);
}

export async function getDocument(secret: ClicksignSecret, envelopeId: string, documentId: string) {
  return request<{ data: JsonApiResource<Record<string, unknown>> }>(secret, `/envelopes/${encodeURIComponent(envelopeId)}/documents/${encodeURIComponent(documentId)}`);
}

export function findSignedFileUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const stack: unknown[] = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if ((key === "signed_file_url" || key === "signed_url" || key === "download_url") && typeof child === "string" && /^https?:\/\//.test(child)) return child;
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return null;
}
