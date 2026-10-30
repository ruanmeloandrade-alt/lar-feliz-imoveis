import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as google from "@/lib/google.server";
import { driveListFilesPage, googleScopeGranted } from "@/lib/google-workspace.server";
import * as microsoft from "@/lib/microsoft.server";
import type { ArquivoKind, ArquivoOrigem, ArquivoRow } from "@/lib/crm-arquivos.functions";
import { resolveActiveWorkspace } from "@/lib/workspace-resolver.server";

type AnySb = { from: (t: string) => any; storage: { from: (bucket: string) => any } };

export type ArquivoSource =
  | "platform"
  | "whatsapp"
  | "channels"
  | "google_drive"
  | "microsoft_onedrive"
  | "microsoft_sharepoint";

export interface ArquivoPage {
  rows: ArquivoRow[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor?: string | null;
  truncated?: boolean;
  truncationReason?: string | null;
}

const ListSchema = z.object({
  source: z.enum([
    "platform",
    "whatsapp",
    "channels",
    "google_drive",
    "microsoft_onedrive",
    "microsoft_sharepoint",
  ]).default("platform"),
  page: z.number().int().min(0).max(100).default(0),
  pageSize: z.number().int().min(10).max(100).default(50),
  cursor: z.string().trim().min(1).max(2048).nullable().optional(),
});

const ResolveUrlSchema = z.object({ storageFileId: z.string().uuid() });

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
  const wsId = await resolveActiveWorkspace(supabase, userId, { createIfMissing: false });
  if (!wsId) throw new Error("Workspace ativo não encontrado.");
  return wsId;
}

function mapWaKind(t: string): ArquivoKind {
  if (t === "image" || t === "sticker") return "image";
  if (t === "audio") return "audio";
  if (t === "video") return "video";
  if (t === "document") return "doc";
  return "other";
}

function mapMimeKind(mime: string | undefined, name: string): ArquivoKind {
  const m = (mime || "").toLowerCase();
  const n = name.toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|bmp)$/.test(n)) return "image";
  if (m.startsWith("audio/") || /\.(mp3|ogg|opus|wav|m4a)$/.test(n)) return "audio";
  if (m.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/.test(n)) return "video";
  if (m === "application/pdf" || /\.pdf$/.test(n)) return "pdf";
  if (/\.(docx?|xlsx?|pptx?|txt|csv|rtf|odt)$/.test(n)) return "doc";
  return "other";
}

function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function nameFromUrl(url: string, fallback: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch {
    // URL externa inválida: mantém nome seguro de fallback.
  }
  return fallback;
}

function mapManagedOrigin(source: string): ArquivoOrigem {
  if (source === "social_media") return "social_media";
  if (source === "gestor_trafego") return "gestor_trafego";
  if (source === "workflow") return "workflow";
  return "upload";
}

type LeadLite = {
  id: string;
  name: string | null;
  phone: string | null;
  phone_normalized: string | null;
  company_id: string | null;
};

type CompanyLite = { id: string; name: string; logo_url: string | null };

type GraphDriveChild = {
  id?: string;
  name?: string;
  size?: number;
  webUrl?: string;
  folder?: unknown;
  lastModifiedDateTime?: string;
};

type GraphDrivePage = {
  value?: GraphDriveChild[];
  "@odata.nextLink"?: string;
};

type GraphFlatFile = {
  id: string;
  name: string;
  webUrl: string;
  lastModified: string;
};

async function collectGraphFiles(
  token: string,
  initialPath: string,
  maxFiles: number,
  label: string,
): Promise<{ files: GraphFlatFile[]; hasMore: boolean }> {
  const files: GraphFlatFile[] = [];
  let next: string | null = initialPath;
  let requests = 0;

  while (next && files.length < maxFiles) {
    if (requests >= 100) throw new Error(`${label} excedeu o limite seguro de paginação.`);
    const response = await microsoft.graphFetch<GraphDrivePage>(next, token, { label });
    requests += 1;
    for (const item of response.value ?? []) {
      if (item.folder || !item.id || !item.name) continue;
      files.push({
        id: item.id,
        name: item.name,
        webUrl: safeExternalUrl(item.webUrl) ?? "",
        lastModified: item.lastModifiedDateTime ?? "",
      });
      if (files.length >= maxFiles) break;
    }
    next = response["@odata.nextLink"] ?? null;
  }

  return { files, hasMore: Boolean(next) };
}

async function loadCompanies(sb: AnySb, wsId: string, ids: string[]): Promise<Map<string, CompanyLite>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, CompanyLite>();
  if (!unique.length) return map;
  const { data, error } = await sb
    .from("companies")
    .select("id, name, logo_url")
    .eq("workspace_id", wsId)
    .in("id", unique);
  if (error) throw new Error("Não foi possível carregar as empresas relacionadas aos arquivos.");
  for (const row of (data || []) as CompanyLite[]) map.set(row.id, row);
  return map;
}

async function listPlatform(sb: AnySb, wsId: string, page: number, pageSize: number): Promise<ArquivoPage> {
  const offset = page * pageSize;
  const { data, error } = await sb
    .from("workspace_storage_files")
    .select("id, file_name, mime, source, created_at")
    .eq("workspace_id", wsId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize);
  if (error) throw new Error("Não foi possível carregar os arquivos da plataforma.");

  const raw = (data || []) as Array<{
    id: string;
    file_name: string;
    mime: string | null;
    source: string;
    created_at: string;
  }>;
  const hasMore = raw.length > pageSize;
  const rows = raw.slice(0, pageSize).map<ArquivoRow>((f) => ({
    id: `storage:${f.id}`,
    storage_file_id: f.id,
    nome: f.file_name,
    kind: mapMimeKind(f.mime ?? undefined, f.file_name),
    url: null,
    origem: mapManagedOrigin(f.source),
    received_at: f.created_at,
    lead: { id: null, nome: "Arquivos da plataforma", phone: null, keep_files: true },
    company: null,
  }));
  return { rows, page, pageSize, hasMore };
}

async function listWhatsApp(sb: AnySb, wsId: string, page: number, pageSize: number): Promise<ArquivoPage> {
  const offset = page * pageSize;
  const { data, error } = await sb
    .from("whatsapp_web_messages")
    .select("id, remote_jid, message_type, media_url, sender_name, sender_phone, received_at, raw")
    .eq("workspace_id", wsId)
    .in("message_type", ["image", "audio", "video", "document", "sticker"])
    .not("media_url", "is", null)
    .order("received_at", { ascending: false })
    .range(offset, offset + pageSize);
  if (error) throw new Error("Não foi possível carregar as mídias do WhatsApp.");

  const raw = (data || []) as Array<{
    id: string;
    remote_jid: string;
    message_type: string;
    media_url: string;
    sender_name: string | null;
    sender_phone: string | null;
    received_at: string;
    raw: Record<string, unknown> | null;
  }>;
  const pageRows = raw.slice(0, pageSize);
  const phones = Array.from(new Set(pageRows.map((m) => (m.sender_phone || m.remote_jid || "").replace(/\D/g, "")).filter(Boolean)));
  const leadByPhone = new Map<string, LeadLite>();
  if (phones.length) {
    const { data: leads, error: leadsError } = await sb
      .from("leads")
      .select("id, name, phone, phone_normalized, company_id")
      .eq("workspace_id", wsId)
      .in("phone_normalized", phones);
    if (leadsError) throw new Error("Não foi possível relacionar as mídias aos leads.");
    for (const lead of (leads || []) as LeadLite[]) if (lead.phone_normalized) leadByPhone.set(lead.phone_normalized, lead);
  }
  const companyMap = await loadCompanies(sb, wsId, Array.from(leadByPhone.values()).map((lead) => lead.company_id || ""));

  const rows = pageRows.map<ArquivoRow>((m) => {
    const digits = (m.sender_phone || m.remote_jid || "").replace(/\D/g, "");
    const lead = digits ? leadByPhone.get(digits) : undefined;
    const rawPayload = m.raw as { fileName?: string; filename?: string } | null;
    const fallback = rawPayload?.fileName || rawPayload?.filename || `${m.message_type}-${m.id.slice(0, 6)}`;
    const nome = nameFromUrl(m.media_url, fallback);
    return {
      id: `wa:${m.id}`,
      nome,
      kind: m.message_type === "document" ? mapMimeKind(undefined, nome) : mapWaKind(m.message_type),
      url: safeExternalUrl(m.media_url),
      origem: "whatsapp",
      received_at: m.received_at,
      lead: {
        id: lead?.id || null,
        nome: lead?.name || m.sender_name || m.sender_phone || m.remote_jid,
        phone: m.sender_phone || digits || null,
        keep_files: true,
      },
      company: lead?.company_id ? companyMap.get(lead.company_id) || null : null,
    };
  });
  return { rows, page, pageSize, hasMore: raw.length > pageSize };
}

async function listChannels(sb: AnySb, wsId: string, page: number, pageSize: number): Promise<ArquivoPage> {
  const offset = page * pageSize;
  const { data, error } = await sb
    .from("channel_messages")
    .select("id, channel, lead_id, attachments, received_at")
    .eq("workspace_id", wsId)
    .neq("attachments", "[]")
    .order("received_at", { ascending: false })
    .range(offset, offset + pageSize);
  if (error) throw new Error("Não foi possível carregar os anexos dos canais.");

  const raw = (data || []) as Array<{
    id: string;
    channel: string;
    lead_id: string | null;
    attachments: unknown;
    received_at: string;
  }>;
  const pageRows = raw.slice(0, pageSize);
  const leadIds = Array.from(new Set(pageRows.map((m) => m.lead_id).filter(Boolean))) as string[];
  const leadById = new Map<string, LeadLite>();
  if (leadIds.length) {
    const { data: leads, error: leadsError } = await sb
      .from("leads")
      .select("id, name, phone, phone_normalized, company_id")
      .eq("workspace_id", wsId)
      .in("id", leadIds);
    if (leadsError) throw new Error("Não foi possível relacionar os anexos aos leads.");
    for (const lead of (leads || []) as LeadLite[]) leadById.set(lead.id, lead);
  }
  const companyMap = await loadCompanies(sb, wsId, Array.from(leadById.values()).map((lead) => lead.company_id || ""));
  const rows: ArquivoRow[] = [];
  for (const m of pageRows) {
    const lead = m.lead_id ? leadById.get(m.lead_id) : undefined;
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    atts.forEach((a: any, i: number) => {
      const rawUrl = a?.url || a?.payload?.url || null;
      const url = safeExternalUrl(rawUrl);
      if (!url) return;
      const name: string = a?.name || a?.filename || nameFromUrl(url, `arquivo-${m.id.slice(0, 6)}-${i}`);
      rows.push({
        id: `ch:${m.id}:${i}`,
        nome: name,
        kind: mapMimeKind(a?.mime || a?.type, name),
        url,
        origem: (m.channel === "instagram" ? "instagram" : "messenger") as ArquivoOrigem,
        received_at: m.received_at,
        lead: { id: lead?.id || null, nome: lead?.name || "Lead", phone: lead?.phone || null, keep_files: true },
        company: lead?.company_id ? companyMap.get(lead.company_id) || null : null,
      });
    });
  }
  rows.sort((a, b) => (a.received_at < b.received_at ? 1 : -1));
  return { rows, page, pageSize, hasMore: raw.length > pageSize };
}

async function listGoogle(
  sb: AnySb,
  wsId: string,
  page: number,
  pageSize: number,
  cursor?: string | null,
): Promise<ArquivoPage> {
  const secret = await google.readGoogleSecretSafe(sb, wsId);
  const driveScope = "https://www.googleapis.com/auth/drive";
  if (!secret || !googleScopeGranted(secret, driveScope)) {
    return { rows: [], page, pageSize, hasMore: false, nextCursor: null };
  }
  const { token } = await google.getGoogleAccessToken(sb, wsId, secret);

  let result;
  if (cursor || page === 0) {
    result = await driveListFilesPage(token, pageSize, cursor);
  } else {
    let pageToken: string | null = null;
    result = { files: [], nextPageToken: null as string | null };
    for (let currentPage = 0; currentPage <= page; currentPage += 1) {
      result = await driveListFilesPage(token, pageSize, pageToken);
      if (currentPage < page) {
        pageToken = result.nextPageToken;
        if (!pageToken) {
          return { rows: [], page, pageSize, hasMore: false, nextCursor: null };
        }
      }
    }
  }

  return {
    rows: result.files.map((file) => ({
      id: `gdrive:${file.id}`,
      nome: file.name,
      kind: mapMimeKind(file.mimeType, file.name),
      url: safeExternalUrl(file.webViewLink ?? file.webContentLink),
      origem: "google_drive" as const,
      received_at: file.modifiedTime ?? file.createdTime ?? new Date().toISOString(),
      lead: { id: null, nome: "Google Drive", phone: null, keep_files: true },
      company: null,
    })),
    page,
    pageSize,
    hasMore: Boolean(result.nextPageToken),
    nextCursor: result.nextPageToken,
  };
}

async function listOneDrive(sb: AnySb, wsId: string, page: number, pageSize: number): Promise<ArquivoPage> {
  const secret = await microsoft.readMicrosoftSecretSafe(sb, wsId);
  if (!secret || !microsoft.microsoftScopeGranted(secret, "Files.ReadWrite.All")) return { rows: [], page, pageSize, hasMore: false };
  const { token } = await microsoft.getMicrosoftAccessToken(sb, wsId, secret);
  const offset = page * pageSize;
  const target = offset + pageSize + 1;
  const query = `/me/drive/root/children?$top=${Math.min(100, pageSize)}&$select=id,name,size,webUrl,folder,lastModifiedDateTime&$orderby=lastModifiedDateTime desc`;
  const result = await collectGraphFiles(token, query, target, "OneDrive");
  const slice = result.files.slice(offset, offset + pageSize);
  return {
    rows: slice.map((file) => ({
      id: `msdrive:${file.id}`,
      nome: file.name,
      kind: mapMimeKind(undefined, file.name),
      url: safeExternalUrl(file.webUrl),
      origem: "microsoft_onedrive" as const,
      received_at: file.lastModified || new Date().toISOString(),
      lead: { id: null, nome: "Microsoft OneDrive", phone: null, keep_files: true },
      company: null,
    })),
    page,
    pageSize,
    hasMore: result.files.length > offset + pageSize || result.hasMore,
  };
}

async function listSharePoint(sb: AnySb, wsId: string, page: number, pageSize: number): Promise<ArquivoPage> {
  const secret = await microsoft.readMicrosoftSecretSafe(sb, wsId);
  if (!secret || !microsoft.microsoftScopeGranted(secret, "Files.ReadWrite.All") || !microsoft.microsoftScopeGranted(secret, "Sites.Read.All")) {
    return { rows: [], page, pageSize, hasMore: false };
  }
  const { token } = await microsoft.getMicrosoftAccessToken(sb, wsId, secret);
  const offset = page * pageSize;
  const target = offset + pageSize + 1;
  const collected: ArquivoRow[] = [];
  const sites = await microsoft.listFollowedSharePointSites(token);
  let catalogTruncated = sites.length > 20;
  outer: for (const site of sites.slice(0, 20)) {
    const drives = await microsoft.listSharePointDrives(token, site.id);
    if (drives.length > 10) catalogTruncated = true;
    for (const drive of drives.slice(0, 10)) {
      const remaining = target - collected.length;
      if (remaining <= 0) break outer;
      const query = `/drives/${encodeURIComponent(drive.id)}/root/children?$top=${Math.min(100, Math.max(pageSize, remaining))}&$select=id,name,size,webUrl,folder,lastModifiedDateTime&$orderby=lastModifiedDateTime desc`;
      const result = await collectGraphFiles(token, query, remaining, "SharePoint arquivos");
      for (const file of result.files) {
        collected.push({
          id: `mssp:${drive.id}:${file.id}`,
          nome: file.name,
          kind: mapMimeKind(undefined, file.name),
          url: safeExternalUrl(file.webUrl),
          origem: "microsoft_sharepoint",
          received_at: file.lastModified || new Date().toISOString(),
          lead: { id: null, nome: site.displayName || "Microsoft SharePoint", phone: null, keep_files: true },
          company: null,
        });
        if (collected.length >= target) break outer;
      }
    }
  }
  const slice = collected.slice(offset, offset + pageSize);
  return {
    rows: slice,
    page,
    pageSize,
    hasMore: collected.length > offset + pageSize,
    truncated: catalogTruncated,
    truncationReason: catalogTruncated
      ? "O catálogo SharePoint ultrapassa o limite defensivo desta consulta. Os arquivos exibidos pertencem ao recorte auditado de até 20 sites e 10 bibliotecas por site."
      : null,
  };
}

export const listCrmArquivosPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListSchema.parse(data))
  .handler(async ({ data, context }): Promise<ArquivoPage> => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    try {
      if (data.source === "platform") return await listPlatform(sb, wsId, data.page, data.pageSize);
      if (data.source === "whatsapp") return await listWhatsApp(sb, wsId, data.page, data.pageSize);
      if (data.source === "channels") return await listChannels(sb, wsId, data.page, data.pageSize);
      if (data.source === "google_drive") return await listGoogle(sb, wsId, data.page, data.pageSize, data.cursor);
      if (data.source === "microsoft_onedrive") return await listOneDrive(sb, wsId, data.page, data.pageSize);
      return await listSharePoint(sb, wsId, data.page, data.pageSize);
    } catch (error) {
      if (data.source === "google_drive" || data.source.startsWith("microsoft_")) {
        throw new Error("A integração externa não respondeu. Os arquivos da Vanessa Simoni continuam disponíveis nas outras origens.");
      }
      throw error;
    }
  });

export const resolveCrmArquivoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ResolveUrlSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: file, error } = await sb
      .from("workspace_storage_files")
      .select("id, bucket, storage_path")
      .eq("id", data.storageFileId)
      .eq("workspace_id", wsId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !file) throw new Error("Arquivo não encontrado neste workspace.");
    const { data: signed, error: signedError } = await sb.storage
      .from(file.bucket)
      .createSignedUrl(file.storage_path, 300);
    if (signedError || !signed?.signedUrl) throw new Error("Não foi possível gerar o link seguro do arquivo.");
    return { url: signed.signedUrl };
  });
