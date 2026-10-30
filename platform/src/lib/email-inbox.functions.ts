import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnySb, EmailMode } from "./email-sender.server";

const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export type EmailInboxFolder = "inbox" | "sent";

export interface EmailInboxMessage {
  id: string;
  threadId: string | null;
  provider: "gmail";
  folder: EmailInboxFolder;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  preview: string;
  body: string;
  date: string;
  unread: boolean;
  hasAttachment: boolean;
}

const ListSchema = z.object({
  folder: z.enum(["inbox", "sent"]).default("inbox"),
  search: z.string().trim().max(200).optional(),
});
const SendSchema = z.object({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().min(1).max(200_000),
});
const ReauthSchema = z.object({ redirectOrigin: z.string().url() });

function scopeHas(scope: string | null | undefined, wanted: string): boolean {
  return new Set((scope ?? "").split(/\s+/).filter(Boolean)).has(wanted);
}
function htmlToText(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function parseAddress(value: string | undefined): { name: string; email: string } {
  const raw = (value ?? "").trim();
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (!match) return { name: raw || "Sem remetente", email: raw };
  return { name: match[1].replace(/^"|"$/g, "").trim() || match[2].trim(), email: match[2].trim() };
}
function decodeBase64Url(value: string | undefined): string {
  if (!value) return "";
  try {
    return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[]; filename?: string };
function gmailBody(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const plain = gmailBody(child);
    if (plain) return plain;
  }
  if (part.mimeType === "text/html" && part.body?.data) return htmlToText(decodeBase64Url(part.body.data));
  return "";
}
function gmailHasAttachment(part: GmailPart | undefined): boolean {
  if (!part) return false;
  if ((part.filename ?? "").trim()) return true;
  return (part.parts ?? []).some(gmailHasAttachment);
}
async function gmailJson<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Gmail ${response.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as T;
}

async function listGmail(sb: AnySb, workspaceId: string, folder: EmailInboxFolder, search: string): Promise<EmailInboxMessage[]> {
  const google = await import("./google.server");
  const secret = await google.readGoogleSecret(sb, workspaceId);
  if (!scopeHas(secret.scope, GMAIL_MODIFY_SCOPE)) throw new Error("GMAIL_REAUTH_REQUIRED");
  const { token } = await google.getGoogleAccessToken(sb, workspaceId, secret);
  const params = new URLSearchParams({ maxResults: "40", labelIds: folder === "inbox" ? "INBOX" : "SENT" });
  if (search) params.set("q", search);
  const list = await gmailJson<{ messages?: Array<{ id: string; threadId?: string }> }>(token, `/messages?${params.toString()}`);
  const rows = await Promise.all((list.messages ?? []).map(async (ref) => {
    const msg = await gmailJson<{
      id: string; threadId?: string; labelIds?: string[]; snippet?: string; internalDate?: string;
      payload?: GmailPart & { headers?: Array<{ name?: string; value?: string }> };
    }>(token, `/messages/${encodeURIComponent(ref.id)}?format=full`);
    const headers = new Map((msg.payload?.headers ?? []).map((h) => [String(h.name ?? "").toLowerCase(), h.value ?? ""]));
    const from = parseAddress(headers.get("from"));
    const body = gmailBody(msg.payload) || msg.snippet || "";
    return {
      id: msg.id,
      threadId: msg.threadId ?? null,
      provider: "gmail" as const,
      folder,
      fromName: folder === "sent" ? "Eu" : from.name,
      fromEmail: from.email,
      to: headers.get("to") ?? "",
      subject: headers.get("subject") || "(sem assunto)",
      preview: msg.snippet ?? body.slice(0, 160),
      body,
      date: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString(),
      unread: (msg.labelIds ?? []).includes("UNREAD"),
      hasAttachment: gmailHasAttachment(msg.payload),
    } satisfies EmailInboxMessage;
  }));
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

async function contextEmail(context: { supabase: unknown; userId: string }) {
  const sender = await import("./email-sender.server");
  const sb = context.supabase as unknown as AnySb;
  const workspaceId = await sender.activeWorkspace(sb, context.userId);
  const emailSecret = await sender.readEmailSecret(sb, workspaceId);
  return { sender, sb, workspaceId, emailSecret };
}

export const getEmailInboxStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sender = await import("./email-sender.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await sender.activeWorkspace(sb, context.userId);
    const emailSecret = await sender.readEmailSecret(sb, workspaceId);
    let googleEmail: string | null = null;
    let googleInboxReady = false;
    let googleConnected = false;
    try {
      const google = await import("./google.server");
      const secret = await google.readGoogleSecretSafe(sb, workspaceId);
      googleConnected = Boolean(secret?.refresh_token);
      googleEmail = secret?.email ?? null;
      googleInboxReady = Boolean(secret && scopeHas(secret.scope, GMAIL_MODIFY_SCOPE));
    } catch {
      // Google não conectado.
    }
    const mode = (emailSecret?.mode ?? null) as EmailMode | null;
    return {
      connected: Boolean(emailSecret),
      mode,
      fromEmail: emailSecret?.from_email ?? null,
      inboxCapable: mode === "gmail",
      inboxReady: mode === "gmail" ? googleInboxReady : false,
      google: { connected: googleConnected, email: googleEmail, inboxReady: googleInboxReady },
    };
  });

export const startGmailInboxAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReauthSchema.parse(d))
  .handler(async ({ data, context }) => {
    const google = await import("./google.server");
    const sender = await import("./email-sender.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await sender.activeWorkspace(sb, context.userId);
    const current = await google.readGoogleSecretSafe(sb, workspaceId);
    const products = google.normalizeGoogleProducts([...(current?.products ?? []), "gmail"]);
    const scopes = Array.from(new Set([...google.googleScopesForProducts(products), GMAIL_MODIFY_SCOPE]));
    const state = await google.buildGoogleState(workspaceId, products);
    const { clientId } = google.googleEnv();
    const redirectUri = `${data.redirectOrigin}/api/public/oauth/google/callback`;
    return {
      authorizeUrl: google.buildGoogleAuthUrl({ clientId, redirectUri, state, scopes, forceConsent: !current?.refresh_token }),
    };
  });

export const listEmailInboxMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { sb, workspaceId, emailSecret } = await contextEmail(context);
    if (!emailSecret) throw new Error("Configure um remetente na Central de E-mail em Integrações.");
    const search = data.search?.trim() ?? "";
    if (emailSecret.mode === "gmail") {
      return { messages: await listGmail(sb, workspaceId, data.folder, search), mode: emailSecret.mode };
    }
    return {
      messages: [] as EmailInboxMessage[],
      mode: emailSecret.mode,
      outboundOnly: true,
      reason: `${emailSecret.mode} é um provedor de envio e não representa uma caixa postal de entrada.`,
    };
  });

export const sendEmailInboxMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { sender, sb, workspaceId } = await contextEmail(context);
    const html = `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${data.body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>")}</div>`;
    const sent = await sender.sendWorkspaceEmail(sb, workspaceId, {
      to: data.to,
      subject: data.subject,
      html,
      text: data.body,
    });
    return { ok: true, messageId: sent.id, from: sent.from, mode: sent.mode };
  });
