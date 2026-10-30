import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as google from "@/lib/google.server";
import { driveListFiles, googleScopeGranted } from "@/lib/google-workspace.server";

type AnySb = { from: (t: string) => any; storage: { from: (bucket: string) => any } };

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  const wsId = (prof as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!wsId) throw new Error("Workspace ativo não encontrado.");
  return wsId;
}

export type ArquivoKind = "image" | "audio" | "video" | "pdf" | "doc" | "other";
export type ArquivoOrigem =
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "upload"
  | "email"
  | "social_media"
  | "gestor_trafego"
  | "workflow"
  | "google_drive"
  | "microsoft_onedrive"
  | "microsoft_sharepoint";

export interface ArquivoRow {
  id: string;
  storage_file_id?: string | null;
  nome: string;
  kind: ArquivoKind;
  url: string | null;
  origem: ArquivoOrigem;
  received_at: string;
  lead: { id: string | null; nome: string; phone: string | null; keep_files: boolean };
  company: { id: string; name: string; logo_url: string | null } | null;
}

const KeepFilesSchema = z.object({ leadId: z.string().uuid(), keep: z.boolean() });

/** @deprecated Arquivos passam a ser persistentes por padrão. Mantido só para compatibilidade temporária. */
export const setLeadKeepFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => KeepFilesSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: updated, error } = await sb
      .from("leads")
      .update({ keep_files: data.keep })
      .eq("id", data.leadId)
      .eq("workspace_id", wsId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Lead não encontrado no workspace.");
    return { ok: true };
  });

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

function nameFromUrl(url: string, fallback: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch {
    /* ignore */
  }
  return fallback;
}

function mapManagedOrigin(source: string): ArquivoOrigem {
  if (source === "social_media") return "social_media";
  if (source === "gestor_trafego") return "gestor_trafego";
  if (source === "workflow") return "workflow";
  return "upload";
}

export const listCrmArquivos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ArquivoRow[]> => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    const { data: leads, error: leadsError } = await sb
      .from("leads")
      .select("id, name, phone, phone_normalized, company_id, keep_files")
      .eq("workspace_id", wsId);
    if (leadsError) throw new Error(leadsError.message);
    const leadRows = (leads || []) as Array<{
      id: string;
      name: string | null;
      phone: string | null;
      phone_normalized: string | null;
      company_id: string | null;
      keep_files: boolean | null;
    }>;
    const leadByPhone = new Map<string, (typeof leadRows)[number]>();
    const leadById = new Map<string, (typeof leadRows)[number]>();
    for (const l of leadRows) {
      leadById.set(l.id, l);
      if (l.phone_normalized) leadByPhone.set(l.phone_normalized, l);
    }

    const companyIds = Array.from(
      new Set(leadRows.map((l) => l.company_id).filter(Boolean)),
    ) as string[];
    const companyMap = new Map<string, { id: string; name: string; logo_url: string | null }>();
    if (companyIds.length) {
      const { data: comps, error: compsError } = await sb
        .from("companies")
        .select("id, name, logo_url")
        .eq("workspace_id", wsId)
        .in("id", companyIds);
      if (compsError) throw new Error(compsError.message);
      for (const c of (comps || []) as Array<{
        id: string;
        name: string;
        logo_url: string | null;
      }>) {
        companyMap.set(c.id, c);
      }
    }

    const rows: ArquivoRow[] = [];

    // Registro canônico dos arquivos que consomem a cota comercial.
    const { data: managedFiles, error: managedError } = await sb
      .from("workspace_storage_files")
      .select("id, bucket, storage_path, file_name, mime, kind, source, created_at")
      .eq("workspace_id", wsId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (managedError) throw new Error(managedError.message);

    for (const f of (managedFiles || []) as Array<{
      id: string;
      bucket: string;
      storage_path: string;
      file_name: string;
      mime: string | null;
      kind: string;
      source: string;
      created_at: string;
    }>) {
      const { data: signed } = await sb.storage
        .from(f.bucket)
        .createSignedUrl(f.storage_path, 3600);
      rows.push({
        id: `storage:${f.id}`,
        storage_file_id: f.id,
        nome: f.file_name,
        kind: mapMimeKind(f.mime ?? undefined, f.file_name),
        url: signed?.signedUrl ?? null,
        origem: mapManagedOrigin(f.source),
        received_at: f.created_at,
        lead: { id: null, nome: "Arquivos da plataforma", phone: null, keep_files: true },
        company: null,
      });
    }

    // Google Drive autorizado entra na Central de Arquivos existente.
    // Falha externa não derruba os arquivos nativos da MKTOn.
    try {
      const secret = await google.readGoogleSecretSafe(sb, wsId);
      const driveScope = "https://www.googleapis.com/auth/drive";
      if (secret && googleScopeGranted(secret, driveScope)) {
        const { token } = await google.getGoogleAccessToken(sb, wsId, secret);
        const driveFiles = await driveListFiles(token, 300);
        for (const file of driveFiles) {
          rows.push({
            id: `gdrive:${file.id}`,
            nome: file.name,
            kind: mapMimeKind(file.mimeType, file.name),
            url: file.webViewLink ?? file.webContentLink ?? null,
            origem: "google_drive",
            received_at: file.modifiedTime ?? file.createdTime ?? new Date().toISOString(),
            lead: { id: null, nome: "Google Drive", phone: null, keep_files: true },
            company: null,
          });
        }
      }
    } catch {
      // Integração externa degradada: mantém a Central de Arquivos utilizável.
    }

    const { data: waMsgs, error: waError } = await sb
      .from("whatsapp_web_messages")
      .select(
        "id, remote_jid, message_type, media_url, sender_name, sender_phone, from_me, received_at, raw",
      )
      .eq("workspace_id", wsId)
      .in("message_type", ["image", "audio", "video", "document", "sticker"])
      .not("media_url", "is", null)
      .order("received_at", { ascending: false })
      .limit(500);
    if (waError) throw new Error(waError.message);

    for (const m of (waMsgs || []) as Array<{
      id: string;
      remote_jid: string;
      message_type: string;
      media_url: string;
      sender_name: string | null;
      sender_phone: string | null;
      from_me: boolean;
      received_at: string;
      raw: Record<string, unknown> | null;
    }>) {
      const digits = (m.sender_phone || m.remote_jid || "").replace(/\D/g, "");
      const lead = digits ? leadByPhone.get(digits) : undefined;
      const raw = m.raw as { fileName?: string; filename?: string; caption?: string } | null;
      const fallback = raw?.fileName || raw?.filename || `${m.message_type}-${m.id.slice(0, 6)}`;
      const nome = nameFromUrl(m.media_url, fallback);
      const kind =
        m.message_type === "document" ? mapMimeKind(undefined, nome) : mapWaKind(m.message_type);
      rows.push({
        id: `wa:${m.id}`,
        nome,
        kind,
        url: m.media_url,
        origem: "whatsapp",
        received_at: m.received_at,
        lead: {
          id: lead?.id || null,
          nome: lead?.name || m.sender_name || m.sender_phone || m.remote_jid,
          phone: m.sender_phone || digits || null,
          keep_files: true,
        },
        company: lead?.company_id ? companyMap.get(lead.company_id) || null : null,
      });
    }

    const { data: chMsgs, error: chError } = await sb
      .from("channel_messages")
      .select("id, channel, lead_id, attachments, received_at")
      .eq("workspace_id", wsId)
      .neq("attachments", "[]")
      .order("received_at", { ascending: false })
      .limit(500);
    if (chError) throw new Error(chError.message);

    for (const m of (chMsgs || []) as Array<{
      id: string;
      channel: string;
      lead_id: string | null;
      attachments: unknown;
      received_at: string;
    }>) {
      const atts = Array.isArray(m.attachments) ? m.attachments : [];
      const lead = m.lead_id ? leadById.get(m.lead_id) : undefined;
      atts.forEach((a: any, i: number) => {
        const url: string | null = a?.url || a?.payload?.url || null;
        if (!url) return;
        const name: string =
          a?.name || a?.filename || nameFromUrl(url, `arquivo-${m.id.slice(0, 6)}-${i}`);
        const kind = mapMimeKind(a?.mime || a?.type, name);
        rows.push({
          id: `ch:${m.id}:${i}`,
          nome: name,
          kind,
          url,
          origem: (m.channel === "instagram" ? "instagram" : "messenger") as ArquivoOrigem,
          received_at: m.received_at,
          lead: {
            id: lead?.id || null,
            nome: lead?.name || "Lead",
            phone: lead?.phone || null,
            keep_files: true,
          },
          company: lead?.company_id ? companyMap.get(lead.company_id) || null : null,
        });
      });
    }

    rows.sort((a, b) => (a.received_at < b.received_at ? 1 : -1));
    return rows;
  });

const DeleteLeadFilesSchema = z.object({
  leadId: z.string().uuid(),
  manual: z.literal(true),
  escopo: z.enum(["todos", "descartados", "por-tipo", "por-tag"]).optional(),
  tipo: z.string().max(40).optional(),
  tag: z.string().max(120).optional(),
});

/**
 * Exclusão destrutiva de mídias legadas só pode ser chamada com intenção manual explícita.
 * Chamadas antigas/automáticas sem `manual: true` passam a falhar na validação e não apagam nada.
 */
export const deleteLeadFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteLeadFilesSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const escopo = data.escopo ?? "todos";

    const { data: leadRow, error: leadError } = await sb
      .from("leads")
      .select("id, phone_normalized, tags")
      .eq("id", data.leadId)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    const lead = leadRow as {
      id: string;
      phone_normalized: string | null;
      tags: string[] | null;
    } | null;
    if (!lead) throw new Error("Lead não encontrado no workspace.");

    if (escopo === "por-tag" && !(lead.tags ?? []).includes(data.tag ?? "")) {
      return { ok: true, deleted: 0, skipped: "lead sem a tag configurada" };
    }

    const typeMap: Record<string, string[]> = {
      image: ["image", "sticker"],
      audio: ["audio"],
      video: ["video"],
      pdf: ["document"],
      doc: ["document"],
      other: ["document"],
    };
    let deleted = 0;

    if (lead.phone_normalized) {
      let q = sb
        .from("whatsapp_web_messages")
        .select("id")
        .eq("workspace_id", wsId)
        .eq("sender_phone", lead.phone_normalized)
        .not("media_url", "is", null);
      if (escopo === "por-tipo" && data.tipo)
        q = q.in("message_type", typeMap[data.tipo] ?? [data.tipo]);
      const { data: msgs, error: msgsError } = await q;
      if (msgsError) throw new Error(msgsError.message);
      const ids = ((msgs || []) as Array<{ id: string }>).map((m) => m.id);
      if (ids.length) {
        const { error } = await sb
          .from("whatsapp_web_messages")
          .update({ media_url: null })
          .eq("workspace_id", wsId)
          .in("id", ids);
        if (error) throw new Error(error.message);
        deleted += ids.length;
      }
    }

    const { data: chMsgs, error: channelError } = await sb
      .from("channel_messages")
      .select("id, attachments")
      .eq("workspace_id", wsId)
      .eq("lead_id", lead.id)
      .neq("attachments", "[]");
    if (channelError) throw new Error(channelError.message);
    for (const m of (chMsgs || []) as Array<{ id: string; attachments: unknown }>) {
      const atts = Array.isArray(m.attachments) ? m.attachments : [];
      if (!atts.length) continue;
      const keep =
        escopo === "por-tipo" && data.tipo
          ? atts.filter((a: any) => {
              const mime = String(a?.mime || a?.type || "").toLowerCase();
              const name = String(a?.name || a?.filename || "").toLowerCase();
              const isType =
                mime.startsWith(`${data.tipo}/`) ||
                (data.tipo === "pdf" && (mime === "application/pdf" || name.endsWith(".pdf")));
              return !isType;
            })
          : [];
      if (keep.length === atts.length) continue;
      const { error } = await sb
        .from("channel_messages")
        .update({ attachments: keep })
        .eq("workspace_id", wsId)
        .eq("id", m.id);
      if (error) throw new Error(error.message);
      deleted += atts.length - keep.length;
    }

    return { ok: true, deleted };
  });
