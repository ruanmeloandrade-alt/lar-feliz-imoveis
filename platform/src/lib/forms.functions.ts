// Central de Formulários, server functions.
// Fluxo público (/f/<slug>) usa supabaseAdmin dentro do handler.
// Fluxo autenticado (listagem/edit/delete) usa requireSupabaseAuth.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { resolvePublicAppUrl } from "@/integrations/supabase/saude-slim-env";

type AnySb = { from: (t: string) => any };

async function activeWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  const id = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!id) throw new Error("Workspace ativo não encontrado.");
  return id;
}

/* ---------- Tipos compartilhados ---------- */

export type FormFieldKind = "text" | "email" | "phone" | "value" | "select" | "file" | "custom";
export type FormFileMode = "link" | "upload";
export type FormCurrency = "BRL" | "USD" | "EUR" | "GBP";

export const CURRENCY_SYMBOL: Record<FormCurrency, string> = {
  BRL: "R$",
  USD: "US$",
  EUR: "€",
  GBP: "£",
};

export interface FormField {
  id: string;
  label: string;
  kind: FormFieldKind;
  required?: boolean;
  customFieldId?: string; // link para lead_custom_fields.id (opcional)
  options?: string[];
  fileMode?: FormFileMode; // só aplica quando kind === "file"; default "link"
  currency?: FormCurrency; // aplica quando kind === "value"; default "BRL"
}

export interface FormBranding {
  logoUrl?: string | null;
  primaryColor?: string | null;   // hex #RRGGBB, cor do botão
  accentColor?: string | null;    // hex, cor secundária/decorações
  headline?: string | null;       // título grande no topo
  subheadline?: string | null;    // subtexto
  thanksMessage?: string | null;  // mensagem exibida após envio
  thanksButtonLabel?: string | null; // rótulo do botão pós-envio
  thanksButtonUrl?: string | null;   // link do botão pós-envio
  /** "link" = botão comum; "agendamento" = agenda uma call pelo calendário MKTOn */
  thanksButtonMode?: "link" | "agendamento" | null;
  scheduling?: FormScheduling | null;
  footerText?: string | null;
}

/** Configuração do botão de agendamento na tela de agradecimento. */
export interface FormScheduling {
  /** Duração da call em minutos (15/30/45/60) */
  durationMin?: number | null;
  /** Quantos dias à frente ficam disponíveis */
  daysAhead?: number | null;
  /** Janela de atendimento, formato "HH:MM" */
  workStart?: string | null;
  workEnd?: string | null;
  /** Só dias úteis (seg-sex) */
  weekdaysOnly?: boolean | null;
  /** Título do evento criado no calendário */
  eventTitle?: string | null;
  /** Link da reunião (Meet/Zoom) — opcional */
  meetingUrl?: string | null;
  /** Envia o evento para o Google Agenda quando a integração estiver conectada */
  syncGoogle?: boolean | null;
}

/** Origem das respostas do formulário. */
export type FormOrigem = "mkton" | "externo" | "meta";

export interface FormRecord {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  campos: FormField[];
  branding: FormBranding;
  updatedAt: string;
  /** Onde o formulário é preenchido: página MKTOn, site do cliente ou Meta. */
  origem: FormOrigem;
  /** Chave usada pelo site externo para enviar respostas (endpoint público). */
  ingestToken: string | null;
  /** ID do formulário de Lead Ads da Meta vinculado (quando origem = meta). */
  metaFormId: string | null;
  metaPageId: string | null;
  /** Cria lead automaticamente quando a resposta não bate com nenhum lead. */
  autoCriarLead: boolean;
}

/** URL do endpoint público de ingestão para sites externos. */
export function buildFormIngestUrl(token: string): string {
  return `${formShareOrigin()}/api/public/forms/${token}`;
}


export const DEFAULT_FORM_MESSAGE_TEMPLATE =
  "Olá {{nome}}! Para agilizar o próximo passo, preencha este formulário rapidinho: {{link}}";

/**
 * Variáveis "de sistema" disponíveis em qualquer mensagem enviada por
 * automação (formulário, WhatsApp, etc.). O `key` é o que vai entre
 * `{{ }}` no template; o `label` é o rótulo mostrado no seletor.
 */
export const SYSTEM_MESSAGE_VARIABLES: Array<{ key: string; label: string; hint?: string }> = [
  { key: "link", label: "Link do formulário", hint: "URL do formulário já com o leadId" },
  { key: "nome", label: "Primeiro nome do lead" },
  { key: "sobrenome", label: "Sobrenome do lead" },
  { key: "nome_completo", label: "Nome completo do lead" },
  { key: "email", label: "E-mail do lead" },
  { key: "telefone", label: "Telefone do lead" },
  { key: "empresa", label: "Empresa do lead" },
  { key: "valor", label: "Valor do lead" },
  { key: "etapa", label: "Etapa atual do funil" },
  { key: "funil", label: "Funil atual" },
];

export interface RenderMessageParams {
  link: string;
  nome?: string | null;
  sobrenome?: string | null;
  nomeCompleto?: string | null;
  email?: string | null;
  telefone?: string | null;
  empresa?: string | null;
  valor?: number | string | null;
  etapa?: string | null;
  funil?: string | null;
  /** Chave = nome do campo personalizado (case-insensitive), valor = texto */
  customFields?: Record<string, string | null | undefined>;
}

function splitName(full: string | null | undefined): { primeiro: string; sobrenome: string } {
  const t = (full ?? "").trim();
  if (!t) return { primeiro: "", sobrenome: "" };
  const parts = t.split(/\s+/);
  const primeiro = parts.shift() ?? "";
  return { primeiro, sobrenome: parts.join(" ") };
}

export function renderFormMessage(template: string, params: RenderMessageParams): string {
  const nameFallback = (params.nome ?? "").trim();
  const split = splitName(params.nomeCompleto ?? params.nome ?? null);
  const primeiro = nameFallback || split.primeiro || "tudo bem";
  const sobrenome = (params.sobrenome ?? split.sobrenome ?? "").trim();
  const nomeCompleto = (params.nomeCompleto ?? [primeiro, sobrenome].filter(Boolean).join(" ")).trim() || primeiro;

  const base: Record<string, string> = {
    link: params.link,
    nome: primeiro,
    sobrenome,
    nome_completo: nomeCompleto,
    email: (params.email ?? "").trim(),
    telefone: (params.telefone ?? "").trim(),
    empresa: (params.empresa ?? "").trim(),
    valor: params.valor === null || params.valor === undefined || params.valor === "" ? "" : String(params.valor),
    etapa: (params.etapa ?? "").trim(),
    funil: (params.funil ?? "").trim(),
  };

  const custom = new Map<string, string>();
  for (const [k, v] of Object.entries(params.customFields ?? {})) {
    custom.set(normalizeVarKey(k), (v ?? "").toString());
  }

  return template.replace(/\{\{\s*([^}\s][^}]*?)\s*\}\}/g, (_full, rawKey: string) => {
    const key = normalizeVarKey(rawKey);
    if (key in base) return base[key];
    if (custom.has(key)) return custom.get(key)!;
    return "";
  });
}

/** Normaliza um identificador de variável (sem acento, minúsculo, `_`). */
export function normalizeVarKey(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Prefixo curto usado na URL pública dos formulários. */
export const FORM_PUBLIC_PREFIX = "l";

/**
 * Domínio público da Vanessa Simoni usado nos links compartilhados com o cliente final.
 */
export function formShareOrigin(): string {
  return resolvePublicAppUrl();
}

export function buildFormPublicUrl(origin: string, slug: string, leadId?: string | null): string {
  const base = `${origin.replace(/\/$/, "")}/${FORM_PUBLIC_PREFIX}/${encodeURIComponent(slug)}`;
  if (!leadId) return base;
  return `${base}?leadId=${encodeURIComponent(leadId)}`;
}

/**
 * URL curta para compartilhar com o cliente final.
 */
export function buildFormShareUrl(slug: string, leadId?: string | null): string {
  return buildFormPublicUrl(formShareOrigin(), slug, leadId);
}

/**
 * Compatibilidade com chamadores que ainda passam o workspace. A URL pública
 * canônica permanece /l/<slug> para não colidir com rotas de produto/cadastro.
 */
export function buildFormShareUrlWithWorkspace(
  _workspaceSlug: string,
  formSlug: string,
  leadId?: string | null,
): string {
  return buildFormShareUrl(formSlug, leadId);
}

/**
 * Monta a URL pública que serve um arquivo do bucket privado `form-assets`
 * através da rota /api/public/form-assets/$. Guardamos essa URL no branding
 * ou no valor da submissão para o front consumir sem precisar assinar.
 */
export function buildFormAssetUrl(storagePath: string): string {
  return `/api/public/form-assets/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
}

/** Slugs reservados que não podem ser escolhidos pelo cliente. */
const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "auth", "login", "logout", "signup", "signin",
  "new", "edit", "delete", "list", "search", "share",
]);

/** Normaliza um slug digitado pelo cliente (apenas a-z, 0-9, hifens). */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length < 3 || slug.length > 60) return false;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false;
  if (RESERVED_SLUGS.has(slug)) return false;
  return true;
}

function slugify(input: string): string {
  return normalizeSlug(input) || "form";
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

function normalizeRow(row: any): FormRecord {
  return {
    id: row.id,
    slug: row.slug,
    nome: row.nome,
    descricao: row.descricao ?? null,
    campos: Array.isArray(row.campos) ? row.campos as FormField[] : [],
    branding: (row.branding ?? {}) as FormBranding,
    updatedAt: row.updated_at,
    origem: (row.origem ?? "mkton") as FormOrigem,
    ingestToken: row.ingest_token ?? null,
    metaFormId: row.meta_form_id ?? null,
    metaPageId: row.meta_page_id ?? null,
    autoCriarLead: row.auto_criar_lead !== false,

  };
}

const DEFAULT_SEEDS: Array<{ nome: string; descricao: string; campos: FormField[] }> = [
  {
    nome: "Qualificação inicial",
    descricao: "Primeiro contato do lead",
    campos: [
      { id: "c1", label: "Nome completo", kind: "text", required: true },
      { id: "c2", label: "E-mail", kind: "email", required: true },
      { id: "c3", label: "WhatsApp", kind: "phone", required: true },
      { id: "c4", label: "Orçamento aproximado", kind: "value" },
    ],
  },
  {
    nome: "Briefing de projeto",
    descricao: "Coleta detalhes técnicos",
    campos: [
      { id: "c1", label: "Nome", kind: "text", required: true },
      { id: "c2", label: "Segmento", kind: "select", options: ["Serviços", "Produtos", "SaaS", "Outro"] },
      { id: "c3", label: "Arquivos de referência", kind: "file", fileMode: "upload" },
    ],
  },
];

async function seedDefaults(sb: AnySb, wsId: string): Promise<void> {
  for (const s of DEFAULT_SEEDS) {
    const slug = `${slugify(s.nome)}-${randomSuffix()}`;
    await sb.from("crm_forms").insert({
      workspace_id: wsId,
      slug,
      nome: s.nome,
      descricao: s.descricao,
      campos: s.campos,
      branding: {},
    });
  }
}

/* ---------- Upload de arquivos ---------- */

// Máx. 5 MB por upload (base64 aumenta ~33%, então limite bruto = ~7 MB de string).
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_MIME = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml", "image/gif",
]);

const ALLOWED_ANY_MIME = new Set([
  ...ALLOWED_IMAGE_MIME,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "text/plain",
  "text/csv",
]);

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/zip": "zip",
    "text/plain": "txt",
    "text/csv": "csv",
  };
  return map[mime] ?? "bin";
}

function decodeBase64(b64: string): Uint8Array {
  // Remove data-url prefix se vier ("data:image/png;base64,...")
  const clean = b64.includes(",") ? b64.split(",", 2)[1] : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Upload do logo do formulário (autenticado). Aceita imagens. */
export const uploadFormLogo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    contentType: z.string().min(3).max(120),
    base64: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if (!ALLOWED_IMAGE_MIME.has(data.contentType)) {
      throw new Error("Envie uma imagem (PNG, JPG, WebP, SVG ou GIF).");
    }
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);

    const bytes = decodeBase64(data.base64);
    if (bytes.byteLength === 0) throw new Error("Arquivo vazio.");
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error(`Imagem muito grande (máx. ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${wsId}/logos/${randomId()}.${extFromMime(data.contentType)}`;
    const { error } = await supabaseAdmin.storage.from("form-assets").upload(path, bytes, {
      contentType: data.contentType,
      upsert: false,
    });
    if (error) throw new Error(error.message);

    return { url: buildFormAssetUrl(path), path };
  });

/** Upload de anexo pelo lead (público). Amarrado ao slug do formulário. */
export const uploadFormSubmissionFile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    slug: z.string().min(1).max(120),
    fieldId: z.string().min(1).max(60),
    filename: z.string().max(200).optional(),
    contentType: z.string().min(3).max(120),
    base64: z.string().min(1),
  }).parse(d))
  .handler(async ({ data }) => {
    if (!ALLOWED_ANY_MIME.has(data.contentType)) {
      throw new Error("Tipo de arquivo não permitido.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: form } = await supabaseAdmin
      .from("crm_forms")
      .select("id, workspace_id, campos")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!form) throw new Error("Formulário não encontrado.");
    const f = form as unknown as { id: string; workspace_id: string; campos: FormField[] };

    const field = f.campos.find((c) => c.id === data.fieldId);
    if (!field || field.kind !== "file" || (field.fileMode ?? "link") !== "upload") {
      throw new Error("Este campo não aceita upload de arquivo.");
    }

    const bytes = decodeBase64(data.base64);
    if (bytes.byteLength === 0) throw new Error("Arquivo vazio.");
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error(`Arquivo muito grande (máx. ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`);
    }

    const ext = extFromMime(data.contentType);
    const safeName = (data.filename ?? "arquivo").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60) || "arquivo";
    const path = `${f.workspace_id}/submissions/${f.id}/${randomId()}-${safeName}.${ext}`;
    const { error } = await supabaseAdmin.storage.from("form-assets").upload(path, bytes, {
      contentType: data.contentType,
      upsert: false,
    });
    if (error) throw new Error(error.message);

    return { url: buildFormAssetUrl(path), path, filename: safeName };
  });

/* ---------- Autenticado: listar / salvar / apagar ---------- */

export const listForms = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);

    const { data, error } = await sb
      .from("crm_forms")
      .select("id, slug, nome, descricao, campos, branding, updated_at, origem, ingest_token, meta_form_id, meta_page_id, auto_criar_lead")
      .eq("workspace_id", wsId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    return rows.map(normalizeRow);
  });

const FieldSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(120),
  kind: z.enum(["text", "email", "phone", "value", "select", "file", "custom"]),
  required: z.boolean().optional(),
  customFieldId: z.string().uuid().optional().nullable(),
  options: z.array(z.string()).optional(),
  fileMode: z.enum(["link", "upload"]).optional(),
  currency: z.enum(["BRL", "USD", "EUR", "GBP"]).optional(),
});

const BrandingSchema = z.object({
  logoUrl: z.string().max(2000).nullable().optional(),
  primaryColor: z.string().max(20).nullable().optional(),
  accentColor: z.string().max(20).nullable().optional(),
  headline: z.string().max(1000).nullable().optional(),
  subheadline: z.string().max(3000).nullable().optional(),
  thanksMessage: z.string().max(3000).nullable().optional(),
  thanksButtonLabel: z.string().max(200).nullable().optional(),
  thanksButtonUrl: z.string().max(2000).nullable().optional(),
  thanksButtonMode: z.enum(["link", "agendamento"]).nullable().optional(),
  scheduling: z.object({
    durationMin: z.number().int().min(10).max(240).nullable().optional(),
    daysAhead: z.number().int().min(1).max(90).nullable().optional(),
    workStart: z.string().max(5).nullable().optional(),
    workEnd: z.string().max(5).nullable().optional(),
    weekdaysOnly: z.boolean().nullable().optional(),
    eventTitle: z.string().max(200).nullable().optional(),
    meetingUrl: z.string().max(2000).nullable().optional(),
    syncGoogle: z.boolean().nullable().optional(),
  }).partial().nullable().optional(),
  footerText: z.string().max(1000).nullable().optional(),
}).partial();

export const upsertForm = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().nullable().optional(),
    nome: z.string().min(1).max(120),
    descricao: z.string().max(3000).nullable().optional(),
    slug: z.string().max(60).optional(),
    campos: z.array(FieldSchema).max(60),
    branding: BrandingSchema.optional(),
    origem: z.enum(["mkton", "externo", "meta"]).optional(),
    metaFormId: z.string().max(60).nullable().optional(),
    metaPageId: z.string().max(60).nullable().optional(),
    autoCriarLead: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);

    // Slug personalizado (opcional)
    const requested = data.slug ? normalizeSlug(data.slug) : "";
    if (data.slug && !isValidSlug(requested)) {
      throw new Error("Link personalizado inválido. Use 3-60 caracteres: letras minúsculas, números e hifens.");
    }

    if (data.id) {
      const patch: Record<string, unknown> = {
        nome: data.nome,
        descricao: data.descricao ?? null,
        campos: data.campos,
        branding: data.branding ?? {},
      };
      if (data.origem) patch.origem = data.origem;
      if (data.metaFormId !== undefined) patch.meta_form_id = data.metaFormId || null;
      if (data.metaPageId !== undefined) patch.meta_page_id = data.metaPageId || null;
      if (data.autoCriarLead !== undefined) patch.auto_criar_lead = data.autoCriarLead;

      if (requested) {
        // Verifica se o slug pedido já pertence a outro formulário
        const { data: exists } = await sb.from("crm_forms").select("id").eq("slug", requested).maybeSingle();
        const otherId = (exists as { id?: string } | null)?.id;
        if (otherId && otherId !== data.id) {
          throw new Error("Esse link personalizado já está em uso. Escolha outro.");
        }
        patch.slug = requested;
      }
      const { error } = await sb.from("crm_forms").update(patch).eq("id", data.id).eq("workspace_id", wsId);
      if (error) throw new Error(error.message);
      return { id: data.id, slug: requested || undefined };
    }

    // Slug para criação: usa o pedido (se livre) ou gera um único a partir do nome
    let slug = requested;
    if (slug) {
      const { data: exists } = await sb.from("crm_forms").select("id").eq("slug", slug).maybeSingle();
      if (exists) throw new Error("Esse link personalizado já está em uso. Escolha outro.");
    } else {
      slug = `${slugify(data.nome)}-${randomSuffix()}`;
      for (let i = 0; i < 5; i++) {
        const { data: exists } = await sb.from("crm_forms").select("id").eq("slug", slug).maybeSingle();
        if (!exists) break;
        slug = `${slugify(data.nome)}-${randomSuffix()}`;
      }
    }

    const { data: inserted, error } = await sb.from("crm_forms").insert({
      workspace_id: wsId,
      slug,
      nome: data.nome,
      descricao: data.descricao ?? null,
      campos: data.campos,
      branding: data.branding ?? {},
      origem: data.origem ?? "mkton",
      meta_form_id: data.metaFormId || null,
      meta_page_id: data.metaPageId || null,
      auto_criar_lead: data.autoCriarLead ?? true,
    }).select("id, slug").maybeSingle();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id, slug: (inserted as { slug: string }).slug };
  });

/** Gera uma nova chave de integração para o formulário (invalida a anterior). */
export const rotateFormIngestToken = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await sb
      .from("crm_forms")
      .update({ ingest_token: token })
      .eq("id", data.id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { token };
  });


export const deleteForm = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const { error } = await sb.from("crm_forms").delete().eq("id", data.id).eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getFormById = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const { data: row, error } = await sb
      .from("crm_forms")
      .select("id, slug, nome, descricao, campos, branding, updated_at, origem, ingest_token, meta_form_id, meta_page_id, auto_criar_lead")
      .eq("id", data.id)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return normalizeRow(row);
  });

/* ---------- Público: renderizar e enviar ---------- */

export const getPublicForm = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({
    slug: z.string().min(1).max(120),
    workspaceSlug: z.string().min(1).max(120).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let wsId: string | null = null;
    if (data.workspaceSlug) {
      const { data: ws } = await supabaseAdmin
        .from("workspaces")
        .select("id")
        .eq("slug", data.workspaceSlug)
        .maybeSingle();
      if (!ws) return null;
      wsId = (ws as { id: string }).id;
    }
    let query = supabaseAdmin
      .from("crm_forms")
      .select("id, slug, nome, descricao, campos, branding, workspace_id")
      .eq("slug", data.slug);
    if (wsId) query = query.eq("workspace_id", wsId);
    const { data: row, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const r = row as any;
    return {
      id: r.id as string,
      slug: r.slug as string,
      nome: r.nome as string,
      descricao: (r.descricao ?? null) as string | null,
      campos: (Array.isArray(r.campos) ? r.campos : []) as FormField[],
      branding: (r.branding ?? {}) as FormBranding,
    };
  });

export const submitPublicForm = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    slug: z.string().min(1).max(120),
    workspaceSlug: z.string().min(1).max(120).optional(),
    leadId: z.string().uuid().nullable().optional(),
    values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let wsId: string | null = null;
    if (data.workspaceSlug) {
      const { data: ws } = await supabaseAdmin
        .from("workspaces")
        .select("id")
        .eq("slug", data.workspaceSlug)
        .maybeSingle();
      if (!ws) throw new Error("Workspace não encontrado.");
      wsId = (ws as { id: string }).id;
    }

    let formQ = supabaseAdmin
      .from("crm_forms")
      .select("id, workspace_id, nome, campos, auto_criar_lead")
      .eq("slug", data.slug);
    if (wsId) formQ = formQ.eq("workspace_id", wsId);
    const { data: form } = await formQ.maybeSingle();
    if (!form) throw new Error("Formulário não encontrado.");
    const f = form as unknown as {
      id: string; workspace_id: string; nome: string; campos: FormField[]; auto_criar_lead?: boolean | null;
    };

    const { ingestFormSubmission } = await import("@/lib/forms-ingest.server");
    const result = await ingestFormSubmission(supabaseAdmin as never, {
      form: f,
      values: data.values,
      leadId: data.leadId ?? null,
      source: "mkton",
    });

    return { ok: true as const, leadId: result.leadId };
  });

