import { slimSafeOperationalError } from "./slim-operation-errors.core";
import { routeInboundAgentOwnership, waitingEventsAcceptInbound, type InboundResumeOptions } from "./slim-inbound-owner.core";
import { withSalesbotGuard, withAgentGuard, assertAutomationMayContinue, guardedAutomationFetch } from "./inbox-automation-guards.server";
// Executor server-only do Salesbot. Multi-tenant: cada run é ligada a
// workspace_id + salesbot_id + lead_id e só toca dados do próprio workspace.
//
// Blocos suportados nesta fase:
//   enviar-mensagem, msg-interna, pausar (cronometro / msg-recebida / OU),
//   condicao, validacao, ir-etapa, encerrar-bot,
//   acao: nota, tags, mudar-status-lead, mudar-responsavel,
//         definir-campo, webhook, enviar-email.
//
// Blocos ainda não executam (registram log skipped):
//   comentario, iniciar-salesbot,
//   etapa-codigo, round-robin,

//   acao: demais ações ainda não cobertas por este comentário legado.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createChildContext, createRootContext, type ExecutionContext, MAX_EXECUTION_DEPTH } from "./execution-context";
import {
  getAdminPhonesFromEvolutionPayload,
  getSalesbotGroupJid,
  getSalesbotGroupParticipantPhone,
  resolveSalesbotGroupAdminPhones,
} from "./salesbot-group-actions.server";
import { claimSalesbotAiTurn } from "./salesbot-ai-claim.server";
import { matchPlainSalesbotRule } from "./salesbot-text-rules";
import {
  findActiveSalesbotRunId,
  findPriorSingleEntrySalesbotRunId,
  waitForDurableSalesbotTimer,
} from "./salesbot-run-guards.server";
import { leadActivitiesToAiHistory } from "./ai-agent-x1-guards.server";
import { normalizeInternationalPhone, whatsappIdentityFromJid } from "./whatsapp-identity";
import {
  findLatestLeadWhatsappIdentity,
  resolveLeadEvolutionSession,
} from "./whatsapp-session-routing.server";
import { resolvePublicAppUrl } from "@/integrations/supabase/saude-slim-env";
import type { WorkspaceAiKey } from "@/lib/workspace-ai-key.server";
import {projectPromptAgent,promptReadinessError} from "./slim-prompt-only.core";

type AnySb = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };
type AnySbStorage = AnySb & { storage: { from: (b: string) => any } };

type BlockRow = {
  id: string;
  type: string;
  config: Record<string, unknown>;
  next_block_id: string | null;
};

type RunRow = {
  id: string;
  workspace_id: string;
  salesbot_id: string;
  lead_id: string;
  current_block_id: string | null;
  status: string;
  variables: Record<string, any>;
};


type WaitingSalesbotEvent = {
  type: "msg-recebida" | "lote-msgs" | "video-aberto" | "video-fechado" | "audio-aberto" | "audio-fechado" | "botao-clicado" | "formulario-enviado";
  nextBlockId: string | null;
  messageId?: string | null;
  /** "formulario-enviado": ID do formulário. */
  formularioId?: string;
  /** Pausa "lote-msgs": quantas mensagens ainda faltam para o bot avançar. */
  remaining?: number;
  /** "botao-clicado": rótulo de cada botão e o bloco de destino dele. */
  options?: Array<{ id?: string; label: string; nextBlockId: string | null }>;
};

/** Classifica o tipo de chat do WhatsApp pelo remoteJid. */
export function classifyWhatsappRemoteJid(remoteJid: string): "x1" | "group" | "broadcast" | "status" | "unknown" {
  if (!remoteJid) return "unknown";
  if (remoteJid.endsWith("@g.us")) return "group";
  if (remoteJid.endsWith("@s.whatsapp.net")) return "x1";
  if (remoteJid.endsWith("@broadcast")) return "broadcast";
  if (remoteJid === "status@broadcast") return "status";
  return "unknown";
}

/** Normaliza texto pra comparar resposta do lead com o rótulo do botão. */
function normalizeButtonText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function findLatestSentMedia(
  value: unknown,
  kind: "video" | "audio",
): { messageId?: unknown; kind?: unknown } | undefined {
  if (!Array.isArray(value)) return undefined;
  for (let index = value.length - 1; index >= 0; index--) {
    const item = value[index] as { messageId?: unknown; kind?: unknown } | undefined;
    if (item?.kind === kind && typeof item.messageId === "string") return item;
  }
  return undefined;
}

type LeadRow = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone: string | null;
  responsible_id: string | null;
  stage_id: string | null;
  pipeline_id: string | null;
  status: string | null;
  tags: unknown;
  workspace_id: string;
  source_provider?: string | null;
};


const MAX_STEPS_PER_TICK = 40;
/**
 * Aceita tanto o UUID do bot quanto o `local_id` usado pelo builder e devolve
 * sempre o UUID real do bot dentro do workspace (ou null se não existir).
 */
async function resolveSalesbotId(
  supabaseAdmin: AnySb,
  workspaceId: string,
  candidate: string,
): Promise<string | null> {
  const id = candidate.trim();
  if (!id) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (isUuid) {
    const { data } = await supabaseAdmin.from("salesbots")
      .select("id").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
    if (data?.id) return data.id as string;
  }
  const { data: byLocal } = await supabaseAdmin.from("salesbots")
    .select("id").eq("workspace_id", workspaceId).eq("local_id", id).maybeSingle();
  return (byLocal?.id as string | undefined) ?? null;
}

async function log(supabaseAdmin: AnySb, run: RunRow, block: BlockRow | null, status: "ok" | "error" | "skipped" | "wait", message?: string, payload?: Record<string, unknown>) {
  return supabaseAdmin.from("salesbot_run_logs").insert({
    workspace_id: run.workspace_id,
    salesbot_run_id: run.id,
    block_id: block?.id ?? null,
    status,
    message: message ?? null,
    payload: payload ?? {},
  });
}

async function loadBlocks(supabaseAdmin: AnySb, salesbotId: string): Promise<BlockRow[]> {
  const { data } = await supabaseAdmin
    .from("salesbot_blocks")
    .select("id, type, config, next_block_id")
    .eq("salesbot_id", salesbotId);
  return ((data ?? []) as BlockRow[]).map((b) => ({
    ...b,
    config: (b.config ?? {}) as Record<string, unknown>,
  }));
}

async function loadLead(supabaseAdmin: AnySb, leadId: string, workspaceId: string): Promise<(LeadRow & { source_provider?: string | null; status?: string | null }) | null> {
  const { data } = await supabaseAdmin
    .from("leads")
    .select("id, name, email, phone, phone_normalized, responsible_id, stage_id, pipeline_id, tags, workspace_id, source, crm_source_id, custom_data, instagram_igsid, messenger_psid, status, crm_sources(provider)")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return null;
  const d = data as LeadRow & { crm_sources?: { provider?: string } | null; status?: string | null };
  return { ...d, source_provider: d.crm_sources?.provider ?? null };
}

/**
 * Origem real do lead: `whatsapp:<session_id>`, `instagram:<ig_id>`,
 * `messenger:<page_id>`, `form:<form_id>`, `crm:<crm_source_id>` ou
 * `channel:<source>`. Mantém compatibilidade com valores antigos
 * (que guardavam apenas o crm_source_id).
 */
async function leadMatchesOrigin(supabaseAdmin: AnySb, lead: LeadRow, value: string): Promise<boolean> {
  if (!value) return false;
  const l = lead as LeadRow & {
    source?: string | null; crm_source_id?: string | null; phone_normalized?: string | null;
    custom_data?: Record<string, unknown> | null; instagram_igsid?: string | null; messenger_psid?: string | null;
  };
  const [kind, ...rest] = value.split(":");
  const ref = rest.join(":");
  const custom = (l.custom_data ?? {}) as Record<string, unknown>;

  if (!ref) return String(l.source ?? "") === value || String(l.crm_source_id ?? "") === value;

  switch (kind) {
    case "whatsapp": {
      if (String(custom["whatsapp_session_id"] ?? "") === ref) return true;
      const phone = l.phone_normalized ?? (l.phone ? l.phone.replace(/\D/g, "") : null);
      if (!phone) return false;
      const directJid = `${phone}@s.whatsapp.net`;
      const { data } = await supabaseAdmin
        .from("whatsapp_web_messages")
        .select("id")
        .eq("workspace_id", l.workspace_id)
        .eq("session_id", ref)
        .or(
          `sender_phone.eq.${phone},remote_jid.eq.${directJid},to_jid.eq.${directJid}`,
        )
        .limit(1);
      return Array.isArray(data) && data.length > 0;
    }
    case "instagram":
      return String(custom["ig_account_id"] ?? custom["page_id"] ?? "") === ref
        || (!!l.instagram_igsid && String(custom["page_id"] ?? "") === ref);
    case "messenger":
      return !!l.messenger_psid && String(custom["page_id"] ?? "") === ref;
    case "form":
      return String(custom["form_id"] ?? "") === ref;
    case "crm":
      return String(l.crm_source_id ?? "") === ref;
    case "channel":
      return String(l.source ?? "") === ref;
    default:
      return String(l.source ?? "") === value;
  }
}



/** Encontra o primeiro bloco do bot: procura um bloco sem predecessor. */
function findStartBlock(blocks: BlockRow[]): BlockRow | null {
  if (!blocks.length) return null;
  

  const markedStart = blocks.find((b) => b.config.isStartBlock === true || (b as any).is_start === true);
  if (markedStart) return markedStart;
  const referenced = new Set(blocks.map((b) => b.next_block_id).filter(Boolean) as string[]);
  const roots = blocks.filter((b) => !referenced.has(b.id));
  return roots[0] ?? blocks[0];
}

function findBlockById(blocks: BlockRow[], id: string | null | undefined): BlockRow | null {
  if (!id) return null;
  return blocks.find((b) => b.id === id) ?? null;
}

/** Pausas até este limite são executadas inline (o cron só roda a cada minuto). */
const SHORT_PAUSE_MAX_MS = 25_000;

/** Cronômetro: aceita segundos, minutos, horas, dias, semanas, meses, anos. */
function computeCronometroMs(cfg: Record<string, unknown>): number {
  return computePausaCronometroMs(cfg);
}

export function computePausaCronometroMs(pausa: Record<string, unknown>, nowOverride?: Date): number {
  const n = (k: string) => {
    const v = Number(pausa[k] ?? 0);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  
  const seg = n("seg") || n("pausaSeg");
  const min = n("min") || n("pausaMin");
  const hor = n("horas") || n("pausaHoras");
  const dias = n("dias") || n("pausaDias");
  const semanas = n("semanas") || n("pausaSemanas");
  const mesesRaw = n("meses") || n("pausaMeses");
  const anosRaw = n("anos") || n("pausaAnos");

  // Compatibilidade legada: 1 ano = 12 meses
  // Limite máximo operacional de 48 meses
  const totalMonths = Math.min(mesesRaw + (anosRaw * 12), 48);

  // Helper para adicionar meses de calendário
  const addCalendarMonths = (date: Date, m: number) => {
    const d = new Date(date);
    const day = d.getDate();
    d.setMonth(d.getMonth() + m);
    // Se o dia não existe no mês de destino, volta pro último dia válido
    if (d.getDate() !== day) d.setDate(0);
    return d;
  };

  const now = nowOverride || new Date();
  
  // A regra correta: o teto é exatamente now + 48 meses-calendário
  const maxDate = addCalendarMonths(now, 48);
  const maxAllowedMs = maxDate.getTime() - now.getTime();

  const targetDate = addCalendarMonths(now, totalMonths);
  
  const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
  
  // Diferença dos meses de calendário
  const baseMs = targetDate.getTime() - now.getTime();
  
  // Soma o resto normalmente
  const extraMs = seg * S + min * M + hor * H + dias * D + semanas * 7 * D;
  
  const totalMs = baseMs + extraMs;
  
  // Limita o resultado final pelo teto dinâmico de 48 meses
  return Math.min(totalMs, maxAllowedMs);
}

function evalValidationRule(tipo: string, ref: string, val: string): boolean {
  const plain = matchPlainSalesbotRule(tipo, ref, val);
  if (plain !== undefined) return plain;
  const raw = val.trim();
  const wanted = ref.trim();
  switch (tipo) {
    case "contem": return !!wanted && val.toLowerCase().includes(ref.toLowerCase());
    case "nao-contem": return !!wanted && !val.toLowerCase().includes(ref.toLowerCase());
    case "desigual": return !!wanted && val !== ref;
    case "comprimento": return !!wanted && val.length === Number(ref || 0);
    case "regex": { if (!wanted) return false; try { return new RegExp(ref).test(val); } catch { return false; } }
    case "numero": return !!wanted && /^-?\d+(\.\d+)?$/.test(raw) && Number(raw) === Number(wanted);
    case "letra": return !!wanted && /^[\p{L}\s]+$/u.test(raw) && raw.toLowerCase() === wanted.toLowerCase();
    case "palavra": return !!wanted && /^\p{L}+$/u.test(raw) && raw.toLowerCase() === wanted.toLowerCase();
    case "telefone": {
      const digits = val.replace(/\D/g, "");
      const refDigits = ref.replace(/\D/g, "");
      return !!refDigits && digits.length >= 8 && digits.includes(refDigits);
    }
    case "email": return !!wanted && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) && raw.toLowerCase().includes(wanted.toLowerCase());
    case "gama": {
      const [a, b] = ref.split("-").map((n) => Number(n.trim()));
      const n = Number(val);
      return Number.isFinite(n) && n >= a && n <= b;
    }
    default: return false;
  }
}

/** Verifica se um lead tem um evento de tracking recente. */
async function checkTrackingEvent(
  supabaseAdmin: AnySb,
  workspaceId: string,
  leadId: string,
  eventName: string,
  minutes: number = 10080, // Default 7 dias
): Promise<boolean> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("tracking_events")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("lead_id", leadId)
    .eq("event_name", eventName)
    .gte("created_at", since)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

async function evalValidacaoRegra(
  supabaseAdmin: AnySb,
  run: RunRow,
  lead: LeadRow,
  r: { alvo?: string; campoId?: string; tipo?: string; valor?: string },
): Promise<boolean> {
  const alvo = r.alvo ?? "mensagem";
  const tipo = r.tipo ?? "contem";
  const valorRef = r.valor ?? "";
  let valorReal = "";

  switch (alvo) {
    case "mensagem": valorReal = String(run.variables.last_message ?? ""); break;
    case "nome": valorReal = lead.name ?? ""; break;
    case "email": valorReal = lead.email ?? ""; break;
    case "telefone": valorReal = lead.phone ?? ""; break;
    case "empresa": valorReal = (lead as any).empresa ?? ""; break;
    case "responsavel": valorReal = lead.responsible_id ?? ""; break;
    case "etapa": valorReal = lead.stage_id ?? ""; break;
    case "tag": {
      const tags = Array.isArray(lead.tags) ? lead.tags : [];
      return tags.some((t) => String(t).toLowerCase() === valorRef.toLowerCase());
    }
    case "campo": {
      if (!r.campoId) return false;
      const { data } = await supabaseAdmin
        .from("lead_custom_field_values")
        .select("value")
        .eq("lead_id", lead.id)
        .eq("field_id", r.campoId)
        .maybeSingle();
      valorReal = customValueToText((data as any)?.value);
      break;
    }
    case "tracking-evento": {
      if (!valorRef) return false;
      // Formato: "evento" ou "evento:minutos"
      const parts = valorRef.split(":");
      const evt = parts[0].trim();
      const mins = parts[1] ? Number(parts[1]) : 10080;
      return checkTrackingEvent(supabaseAdmin, run.workspace_id, lead.id, evt, mins);
    }
    case "tracking-pageview": {
      if (!valorRef) return false;
      // Formato: "url_part" ou "url_part:minutos"
      const parts = valorRef.split(":");
      const urlPart = parts[0].trim();
      const mins = parts[1] ? Number(parts[1]) : 10080;
      const since = new Date(Date.now() - mins * 60_000).toISOString();
      const { data } = await supabaseAdmin
        .from("tracking_events")
        .select("id")
        .eq("workspace_id", run.workspace_id)
        .eq("lead_id", lead.id)
        .eq("event_name", "pageview")
        .ilike("url", `%${urlPart}%`)
        .gte("created_at", since)
        .limit(1);
      return Array.isArray(data) && data.length > 0;
    }
    case "tracking-tempo": {
      if (!valorRef) return false;
      // Formato: "minutos_na_pagina:url_part" ou apenas "minutos_na_pagina"
      // Retorna true se a soma de duration_seconds para pageviews for >= minutos*60
      const parts = valorRef.split(":");
      const minTotal = Number(parts[0]);
      const urlPart = parts[1] ? parts[1].trim() : null;
      if (isNaN(minTotal)) return false;

      let q = supabaseAdmin
        .from("tracking_events")
        .select("payload")
        .eq("workspace_id", run.workspace_id)
        .eq("lead_id", lead.id)
        .eq("event_name", "pageview");
      
      if (urlPart) q = q.ilike("url", `%${urlPart}%`);

      const { data } = await q;
      const totalSeconds = (data ?? []).reduce((acc: number, row: any) => {
        const dur = Number(row.payload?.duration_seconds ?? 0);
        return acc + dur;
      }, 0);
      return totalSeconds >= minTotal * 60;
    }
    case "tracking-produto": {
      if (!valorRef) return false;
      // Formato: "produto_id" ou "produto_id:tipo" (tipo=compra|interesse, default=compra)
      const parts = valorRef.split(":");
      const productId = parts[0].trim();
      const type = (parts[1] || "compra").trim().toLowerCase();
      
      const eventName = type === "interesse" ? "view_item" : "purchase";
      
      const { data } = await supabaseAdmin
        .from("tracking_events")
        .select("id")
        .eq("workspace_id", run.workspace_id)
        .eq("lead_id", lead.id)
        .eq("event_name", eventName)
        .filter("payload->>product_id", "eq", productId)
        .limit(1);
      return Array.isArray(data) && data.length > 0;
    }
    case "social-ativo": {
      // Verifica se o lead teve interações sociais (DMs ou Comentários) recentemente
      // Consideramos os últimos 30 dias por padrão
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("channel_messages")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", run.workspace_id)
        .eq("lead_id", lead.id)
        .in("channel", ["instagram", "messenger"])
        .gte("created_at", since);
      return (count ?? 0) > 0;
    }
    case "social-segue": {
      // Esta informação costuma estar em custom_data ou metadados da integração
      // No nosso modelo, verificamos instagram_igsid e se há flag de seguidor
      const custom = (lead as any).custom_data ?? {};
      return !!(lead as any).instagram_igsid && (custom.is_follower === true || custom.followed_at != null);
    }
    case "lead-produto": {
      if (!valorRef) return false;
      // Formato: "produto_id" ou "produto_id:tipo"
      const parts = valorRef.split(":");
      const productId = parts[0].trim();
      const kind = (parts[1] || "interesse").trim().toLowerCase();
      const { data } = await supabaseAdmin
        .from("lead_products")
        .select("id")
        .eq("workspace_id", run.workspace_id)
        .eq("lead_id", lead.id)
        .eq("product_id", productId)
        .eq("kind", kind)
        .limit(1);
      return Array.isArray(data) && data.length > 0;
    }
    default: return false;
  }

  return evalValidationRule(tipo, valorRef, valorReal);
}

/** Slug PT-BR safe: sem acentos, minúsculo, `_` entre palavras. */
function slugVar(input: string): string {
  return (input ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Resolve tokens de menção `{@participante}` / `{@membro}` / `{@lead}` /
 * `{@todos}` / `{@5511999999999}` para `{@<digitos>}` (ou `{@todos}`).
 * A conversão em menção real do WhatsApp acontece em `sendWhatsappText`.
 * Fora de grupo os tokens são simplesmente removidos.
 */
function resolveMentionTokens(text: string, lead: LeadRow, vars: Record<string, unknown>): string {
  return text.replace(/\{@\s*([\w.\-]+)\s*\}/g, (_m, rawKey) => {
    const key = String(rawKey).trim().toLowerCase().replace(/-/g, "_");
    if (key === "todos" || key === "everyone" || key === "all") return "{@todos}";
    if (key === "admins" || key === "administradores" || key === "adm") return "{@admins}";
    const pick = (v: unknown) => String(v ?? "").replace(/\D/g, "");
    let digits = "";
    if (/^\d{8,}$/.test(key)) digits = key;
    else if (key === "participante" || key === "remetente" || key === "autor")
      digits = pick(vars.participante_telefone ?? vars.remetente_telefone ?? vars.ultimo_remetente ?? lead.phone);
    else if (key === "membro" || key === "novo_membro" || key === "bemvindo" || key === "bem_vindo" || key === "novo")
      digits = pick(vars.participante_telefone ?? vars.membro_telefone);
    else if (key === "lead") digits = pick(lead.phone);
    return digits ? `{@${digits}}` : "";
  });
}


/** Placeholders {{nome}}, {{telefone}}, {{campo:aniversario}}, etc. */
function interpolate(text: string, lead: LeadRow, vars: Record<string, unknown>): string {
  const withMentions = resolveMentionTokens(text, lead, vars);
  return withMentions.replace(/\{\{\s*([\w.:\- ]+)\s*\}\}/g, (_m, rawKey) => {
    const key = String(rawKey).trim();
    // Campo personalizado: `campo:<slug>`, pré-carregado em vars.
    if (key.startsWith("campo:")) {
      const slug = slugVar(key.slice("campo:".length));
      const v = vars[`campo:${slug}`];
      return v == null ? "" : String(v);
    }
    const map: Record<string, unknown> = {
      nome: lead.name ?? "",
      name: lead.name ?? "",
      email: lead.email ?? "",
      telefone: lead.phone ?? "",
      phone: lead.phone ?? "",
      ...vars,
    };
    const v = map[key];
    return v == null ? "" : String(v);
  });
}

/** Converte o jsonb `value` de um campo personalizado em texto legível. */
function customValueToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const v = value as { display?: unknown; raw?: unknown };
    if (typeof v.display === "string") return v.display;
    if (Array.isArray(v.raw)) return v.raw.map(String).join(", ");
  }
  return String(value);
}

/** Campos personalizados do lead indexados pelo ID do campo (nome + valor + tipo). */
async function loadLeadCustomFieldById(
  supabaseAdmin: AnySb,
  workspaceId: string,
  leadId: string,
): Promise<Record<string, { name: string; value: string; field_type: string }>> {
  const { data } = await supabaseAdmin
    .from("lead_custom_field_values")
    .select("field_id, value, lead_custom_fields(name, field_type)")
    .eq("workspace_id", workspaceId)
    .eq("lead_id", leadId);
  const rows = (data ?? []) as Array<{
    field_id: string;
    value: unknown;
    lead_custom_fields: { name?: string; field_type?: string } | null;
  }>;
  const out: Record<string, { name: string; value: string; field_type: string }> = {};
  for (const r of rows) {
    if (!r.field_id) continue;
    out[r.field_id] = {
      name: r.lead_custom_fields?.name ?? "Campo personalizado",
      value: customValueToText(r.value),
      field_type: r.lead_custom_fields?.field_type ?? "texto",
    };
  }
  return out;
}


/** Carrega valores de campos personalizados do lead como um mapa `campo:<slug> -> valor`. */
async function loadLeadCustomFieldMap(
  supabaseAdmin: AnySb,
  workspaceId: string,
  leadId: string,
): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin
    .from("lead_custom_field_values")
    .select("value, lead_custom_fields(name)")
    .eq("workspace_id", workspaceId)
    .eq("lead_id", leadId);
  const rows = (data ?? []) as Array<{ value: unknown; lead_custom_fields: { name?: string } | null }>;
  const out: Record<string, string> = {};
  for (const r of rows) {
    const nm = r.lead_custom_fields?.name;
    if (!nm) continue;
    out[`campo:${slugVar(nm)}`] = customValueToText(r.value);
  }
  return out;

}


type RuntimeWhatsappTarget = {
  phone: string;
  remoteJid: string;
  sessionId: string;
  conversationKey: string;
  source: "conversation_jid" | "explicit_phone" | "group_jid";
};

async function resolveRuntimeWhatsappTarget(
  supabaseAdmin: AnySb,
  workspaceId: string,
  leadId: string,
  fallbackPhone: string | null | undefined,
): Promise<RuntimeWhatsappTarget | null> {
  const { data: leadRouteRow } = await supabaseAdmin
    .from("leads")
    .select("custom_data")
    .eq("workspace_id", workspaceId)
    .eq("id", leadId)
    .maybeSingle();
  const customData =
    (leadRouteRow as { custom_data?: Record<string, unknown> | null } | null)?.custom_data ?? {};
  const preferredSessionId =
    typeof customData.whatsapp_session_id === "string" && customData.whatsapp_session_id.trim()
      ? customData.whatsapp_session_id.trim()
      : null;

  // A technical group context belongs to one WhatsApp session. Another
  // session's newer message must never choose the sender for this Inbox run.
  if (customData.technical_group_context === true) {
    const group = whatsappIdentityFromJid(customData.whatsapp_group_jid);
    const fallback = whatsappIdentityFromJid(fallbackPhone);
    if (!group || group.kind !== "group" || !fallback || fallback.kind !== "group" ||
        group.remoteJid !== fallback.remoteJid || !preferredSessionId) {
      throw new Error("O contexto do grupo não corresponde à sessão e à conversa selecionadas.");
    }
    const sessionId = await resolveLeadEvolutionSession(supabaseAdmin, {
      workspaceId,
      preferredSessionId,
    });
    return {
      phone: group.remoteJid,
      remoteJid: group.remoteJid,
      sessionId,
      conversationKey: `${sessionId}:${group.remoteJid.toLowerCase()}`,
      source: "group_jid",
    };
  }

  const conversation = await findLatestLeadWhatsappIdentity(supabaseAdmin, { workspaceId, leadId, phone: fallbackPhone, preferredSessionId });
  if (conversation) {
    const sessionId = await resolveLeadEvolutionSession(supabaseAdmin, {
      workspaceId,
      preferredSessionId: preferredSessionId ?? conversation.sessionId,
    });
    return {
      phone: conversation.kind === "group" ? conversation.remoteJid : conversation.number,
      remoteJid: conversation.remoteJid,
      sessionId,
      conversationKey: `${sessionId}:${conversation.remoteJid.trim().toLowerCase()}`,
      source: conversation.kind === "group" ? "group_jid" : "conversation_jid",
    };
  }

  const jidIdentity = whatsappIdentityFromJid(fallbackPhone);
  if (jidIdentity) {
    let lastMessageQuery = supabaseAdmin
      .from("whatsapp_web_messages")
      .select("session_id")
      .eq("workspace_id", workspaceId);
    lastMessageQuery =
      jidIdentity.kind === "group"
        ? lastMessageQuery.eq("remote_jid", jidIdentity.remoteJid)
        : lastMessageQuery.or(
            `sender_phone.eq.${jidIdentity.digits},remote_jid.eq.${jidIdentity.remoteJid},to_jid.eq.${jidIdentity.remoteJid}`,
          );
    if (preferredSessionId) lastMessageQuery = lastMessageQuery.eq("session_id", preferredSessionId);
    const { data: lastMessage } = await lastMessageQuery
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const messageSessionId =
      (lastMessage as { session_id?: string | null } | null)?.session_id?.trim() || null;
    const sessionId = await resolveLeadEvolutionSession(supabaseAdmin, {
      workspaceId,
      preferredSessionId: preferredSessionId ?? messageSessionId,
    });
    return {
      phone: jidIdentity.kind === "group" ? jidIdentity.remoteJid : jidIdentity.number,
      remoteJid: jidIdentity.remoteJid,
      sessionId,
      conversationKey: `${sessionId}:${jidIdentity.remoteJid.trim().toLowerCase()}`,
      source: jidIdentity.kind === "group" ? "group_jid" : "conversation_jid",
    };
  }

  const normalized = normalizeInternationalPhone(fallbackPhone);
  if (!normalized.ok) return null;
  const remoteJid = `${normalized.digits}@s.whatsapp.net`;
  const sessionId = await resolveLeadEvolutionSession(supabaseAdmin, {
    workspaceId,
    preferredSessionId,
  });
  return {
    phone: normalized.digits,
    remoteJid,
    sessionId,
    conversationKey: `${sessionId}:${remoteJid.toLowerCase()}`,
    source: "explicit_phone",
  };
}

async function sendLeadWhatsappText(
  supabaseAdmin: AnySb,
  workspaceId: string,
  leadId: string,
  fallbackPhone: string | null | undefined,
  text: string,
): Promise<{ ok: boolean; error?: string; messageId?: string | null }> {
  const route = await resolveRuntimeWhatsappTarget(
    supabaseAdmin,
    workspaceId,
    leadId,
    fallbackPhone,
  );
  if (!route) {
    return {
      ok: false,
      error: "Identidade WhatsApp ambígua: informe DDI explícito ou use uma conversa com JID real.",
    };
  }
  return sendWhatsappText(
    supabaseAdmin,
    workspaceId,
    route.phone,
    text,
    route.sessionId,
  );
}

/** Envia texto via Evolution usando a sessão ativa do workspace. */
export async function sendWhatsappText(
  supabaseAdmin: AnySb,
  workspaceId: string,
  phone: string,
  text: string,
  sessionId?: string | null,
): Promise<{ ok: boolean; error?: string; messageId?: string | null }> {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) return { ok: false, error: "INTEGRATION_ENCRYPTION_KEY ausente" };
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8 && !phone?.includes("@g.us")) return { ok: false, error: "Telefone inválido" };

  let sessionQuery = supabaseAdmin
    .from("whatsapp_web_sessions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider", "evolution")
    .eq("status", "conectado");
  if (sessionId) sessionQuery = sessionQuery.eq("id", sessionId);
  else sessionQuery = sessionQuery.order("last_connected_at", { ascending: false });
  const { data: sess } = await sessionQuery.maybeSingle();
  const sessId = (sess as { id?: string } | null)?.id;
  if (!sessId) {
    return {
      ok: false,
      error: sessionId
        ? "Sessão Evolution informada não está conectada neste workspace"
        : "Nenhuma sessão Evolution conectada",
    };
  }

  const { data: creds } = await supabaseAdmin.rpc("get_evolution_credentials_service", {
    _session_id: sessId, _key: encKey,
  });
  const c = creds as { instance_name?: string; api_key?: string } | null;
  if (!c?.instance_name || !c.api_key) return { ok: false, error: "Credenciais Evolution indisponíveis" };

  const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base) return { ok: false, error: "EVOLUTION_BASE_URL não configurado" };

  // Menções `{@<digitos>}` / `{@todos}` / `{@admins}`: só valem em grupo (JID @g.us).
  const isGroupTarget = String(phone ?? "").includes("@g.us");
  let finalText = text;
  const mentioned: string[] = [];
  let mentionsEveryOne = false;

  // `{@admins}` marca todos os administradores reais do grupo.
  if (isGroupTarget && /\{@\s*admins\s*\}/i.test(finalText)) {
    let adminDigits: string[] = [];
    try {
      const r = await guardedAutomationFetch(
        `${base}/group/participants/${encodeURIComponent(c.instance_name)}?groupJid=${encodeURIComponent(String(phone).trim())}`,
        { headers: { apikey: c.api_key } },
      );
      const j = (await r.json().catch(() => null)) as
        | { participants?: Array<{ id?: string; admin?: string | null }> }
        | Array<{ id?: string; admin?: string | null }>
        | null;
      adminDigits = getAdminPhonesFromEvolutionPayload(j);
    } catch {
      adminDigits = [];
    }
    finalText = finalText.replace(
      /\{@\s*admins\s*\}/gi,
      adminDigits.length ? adminDigits.map((d) => `{@${d}}`).join(" ") : "",
    );
  }

  finalText = finalText.replace(/\{@\s*([\w]+)\s*\}/g, (_m, raw) => {
    const key = String(raw).toLowerCase();
    if (!isGroupTarget) return "";
    if (key === "todos") { mentionsEveryOne = true; return "@todos"; }
    const d = key.replace(/\D/g, "");
    if (d.length < 8) return "";
    const jid = `${d}@s.whatsapp.net`;
    if (!mentioned.includes(jid)) mentioned.push(jid);
    return `@${d}`;
  }).replace(/[ \t]{2,}/g, " ");


  const target = isGroupTarget ? String(phone).trim() : digits;
  const isDirectEvolution = isGroupTarget || digits.length >= 8;
  if (!isDirectEvolution) return { ok: false, error: "Alvo inválido para WhatsApp" };

  try {
    const resp = await guardedAutomationFetch(`${base}/message/sendText/${encodeURIComponent(c.instance_name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: c.api_key },
      body: JSON.stringify({
        number: target,
        text: finalText,
        ...(mentionsEveryOne ? { mentionsEveryOne: true } : {}),
        ...(mentioned.length > 0 ? { mentioned } : {}),
      }),
    });
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => "");
      return { ok: false, error: `Evolution ${resp.status}: ${bodyText.slice(0, 200)}` };
    }
    const j = await resp.json().catch(() => null) as { key?: { id?: string } } | null;
    return { ok: true, messageId: j?.key?.id ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Envia mensagem com botões (resposta rápida ou URL) via Evolution (`/message/sendButtons`). */
async function sendWhatsappButtons(
  supabaseAdmin: AnySb,
  workspaceId: string,
  phone: string,
  text: string,
  buttons: Array<{ id?: string; label: string; url?: string }>,
  footer?: string,
  sessionId?: string | null,
): Promise<{ ok: boolean; error?: string; messageId?: string | null }> {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) return { ok: false, error: "INTEGRATION_ENCRYPTION_KEY ausente" };
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return { ok: false, error: "Telefone inválido" };
  const btns = buttons
    .map((b) => {
      if (b.url) return { type: "url", display: String(b.label ?? "").slice(0, 20), url: b.url };
      return { type: "reply", display: String(b.label ?? "").slice(0, 20), id: String(b.id || b.label || "").slice(0, 64) };
    })
    .filter((b) => b.display.trim().length > 0)
    .slice(0, 3);
  if (btns.length === 0) return { ok: false, error: "Nenhum botão válido" };

  let sessionQuery = supabaseAdmin
    .from("whatsapp_web_sessions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider", "evolution")
    .eq("status", "conectado");
  if (sessionId) sessionQuery = sessionQuery.eq("id", sessionId);
  else sessionQuery = sessionQuery.order("last_connected_at", { ascending: false });
  const { data: sess } = await sessionQuery.maybeSingle();
  const sessId = (sess as { id?: string } | null)?.id;
  if (!sessId) return { ok: false, error: "Nenhuma sessão Evolution conectada" };

  const { data: creds } = await supabaseAdmin.rpc("get_evolution_credentials_service", {
    _session_id: sessId, _key: encKey,
  });
  const c = creds as { instance_name?: string; api_key?: string } | null;
  if (!c?.instance_name || !c.api_key) return { ok: false, error: "Credenciais Evolution indisponíveis" };

  const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base) return { ok: false, error: "EVOLUTION_BASE_URL não configurado" };

  try {
    const resp = await guardedAutomationFetch(`${base}/message/sendButtons/${encodeURIComponent(c.instance_name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: c.api_key },
      body: JSON.stringify({
        number: digits,
        title: "",
        description: text,
        footer: footer ?? "",
        buttons: btns,
      }),
    });
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => "");
      return { ok: false, error: `Evolution ${resp.status}: ${bodyText.slice(0, 200)}` };
    }
    const j = await resp.json().catch(() => null) as { key?: { id?: string } } | null;
    return { ok: true, messageId: j?.key?.id ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// =================== Agente IA de conversa (bloco "iniciar-ia") ===================

async function loadConversationHistoryForAI(
  supabaseAdmin: AnySb,
  workspaceId: string,
  leadId: string,
  limit = 20,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const { data } = await supabaseAdmin.from("lead_activities")
    .select("type, payload, occurred_at")
    .eq("workspace_id", workspaceId)
    .eq("lead_id", leadId)
    .in("type", ["message_in", "message_out"])
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return leadActivitiesToAiHistory((data ?? []) as Array<{
    type?: string | null;
    payload?: Record<string, unknown> | null;
    occurred_at?: string | null;
  }>);
}

/**
 * Contexto que um bot passa para o próximo bot iniciado por ele:
 * mantém variáveis da conversa, mas descarta o estado interno do agente/espera.
 */
function inheritedRunVariables(vars: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(vars ?? {}) };
  for (const k of ["ia_agent_id", "ia_agent_nome", "ia_max_turnos", "ia_turns_used", "ia_block_id", "salesbot_waiting_branch"]) {
    delete out[k];
  }
  return out;
}


/**
 * Última fala da conversa: usada no handoff (Salesbot → Agente IA).
 * Se quem falou por último foi o CLIENTE, o agente já responde essa mensagem.
 * Se a última fala foi NOSSA, o agente entra em silêncio e aguarda o cliente.
 */
async function getLastConversationTurn(
  supabaseAdmin: AnySb,
  workspaceId: string,
  leadId: string,
): Promise<{ direction: "in" | "out" | null; text: string }> {
  const history = await loadConversationHistoryForAI(supabaseAdmin, workspaceId, leadId, 5);
  const last = history[history.length - 1];
  if (!last) return { direction: null, text: "" };
  return {
    direction: last.role === "user" ? "in" : "out",
    text: last.content.trim(),
  };
}

/**
 * Handoff para o Agente IA levando o contexto da conversa.
 * Só dispara um turno imediato quando existe mensagem do cliente sem resposta.
 */
async function handoffToConversationAgent(
  supabaseAdmin: AnySb,
  params: { workspaceId: string; leadId: string; phone: string; agentId: string },
): Promise<{ replied: boolean; reason: string; error?: string }> {
  const last = await getLastConversationTurn(supabaseAdmin, params.workspaceId, params.leadId);
  if (last.direction !== "in") {
    return {
      replied: false,
      reason: last.direction === "out"
        ? "última mensagem foi nossa — agente aguarda o cliente responder"
        : "sem histórico de mensagens — agente aguarda o cliente iniciar",
    };
  }
  const r = await runAiAgentTurn(
    supabaseAdmin, params.workspaceId, params.leadId, params.phone, params.agentId, last.text,
  );
  return { replied: !r.error, reason: "respondeu a última mensagem do cliente", error: r.error };
}


async function loadConversationAgent(
  supabaseAdmin: AnySb,
  workspaceId: string,
  agentId: string,
): Promise<{ id: string; name: string; persona: string | null; system_prompt: string | null; model: string; metadata: unknown } | null> {
  const { data, error } = await supabaseAdmin.from("conversation_ai_agents")
    .select("id, name, persona, system_prompt, model, metadata")
    .eq("workspace_id", workspaceId)
    .eq("id", agentId)
    .eq("enabled", true)
    .maybeSingle();
  if (error) throw new Error("Não foi possível carregar o Agente IA desta empresa.");
  return projectPromptAgent((data as { id: string; name: string; persona: string | null; system_prompt: string | null; model: string; metadata: unknown } | null) ?? null);
}

/**
 * Fixa o agente IA no nível da conversa: mesmo que o Salesbot encerre,
 * o agente continua respondendo o lead até dar handoff ou ser pausado.
 */
async function assignConversationAgent(
  supabaseAdmin: AnySb,
  workspaceId: string,
  leadId: string,
  agentId: string,
): Promise<void> {
  await supabaseAdmin.from("leads")
    .update({ active_conversation_agent_id: agentId, ai_paused: false, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("workspace_id", workspaceId);
}


/** Estrutura mínima do fluxo de objetivos salvo em conversation_ai_agents.metadata. */
type ObjectiveNodeLike = {
  id?: string;
  /** Tipo do bloco: objetivo (padrão), acao, condicao ou tracking. */
  block?: string;
  conditions?: Array<{ field?: string; op?: string; value?: string; fieldId?: string }>;
  conditionLogic?: string;
  tracking?: {
    siteId?: string;
    event?: string;
    customEvent?: string;
    match?: string;
    everyMinutes?: number;
    forMinutes?: number;
    onFoundMessage?: string;
    onTimeout?: string;
  };
  say?: string;
  expected?: string;
  when?: string;
  returnAfter?: boolean;
  allowBranch?: boolean;


  mode?: string;
  questions?: string[];
  links?: Array<{ label?: string; url?: string; when?: string }>;
  minTurns?: number;
  maxTurns?: number;
  keepOnTrack?: boolean;
  actions?: Array<{ action?: string; targetLabel?: string; target?: string; message?: string }>;
  fallbacks?: ObjectiveFallbackLike[];
  children?: ObjectiveNodeLike[];
};

/** Gatilho de contingência de um objetivo. */
type ObjectiveFallbackLike = {
  id?: string;
  kind?: string;
  minutes?: number;
  attempts?: number;
  keywords?: string[];
  times?: number;
  message?: string;
  goTo?: string;
  actions?: Array<{ action?: string; targetLabel?: string; target?: string; message?: string }>;
};


type ObjectiveDiscountLike = {
  label?: string;
  kind?: string;
  unit?: string;
  value?: number;
  min?: number;
  max?: number;
  when?: string;
};

type ObjectiveTreeLike = {
  root?: ObjectiveNodeLike;
  context?: string;
  discounts?: ObjectiveDiscountLike[];
  pitch?: { minTurns?: number; maxTurns?: number; what?: string };
  outcome?: Array<{ action?: string; targetLabel?: string; target?: string; message?: string }> | Record<string, unknown>;
};


/** Converte a árvore de objetivos em instruções de sistema para a IA. */
function describeObjectiveTree(
  tree?: ObjectiveTreeLike | null,
  customFieldsById: Record<string, { name: string; value: string; field_type: string }> = {},
): string {
  if (!tree || !tree.root) return "";

  const lines: string[] = [];
  const objectiveFinal = tree.root.expected?.trim() || "";
  const generalContext = tree.context?.trim() || "";

  if (generalContext || objectiveFinal) {
    lines.push(`CONTEXTO ESTRATÉGICO:\n${generalContext}${objectiveFinal ? `\n\nOBJETIVO FINAL DO AGENTE: ${objectiveFinal}` : ""}`);
  }
  const pitchMin = Number(tree.pitch?.minTurns) || 0;
  const pitchMax = Number(tree.pitch?.maxTurns) || 0;
  const pitchWhat = tree.pitch?.what?.trim();
  if (pitchMin > 0 || pitchMax > 0 || pitchWhat) {
    const what = pitchWhat || "enviar o link / fazer a proposta";
    const rules: string[] = [];
    if (pitchMin > 0)
      rules.push(`só faça isso a partir da ${pitchMin}ª interação com o lead — antes disso, construa contexto e valor`);
    if (pitchMax > 0)
      rules.push(`não passe da ${pitchMax}ª interação sem chegar nesse ponto — conduza a conversa até lá`);
    lines.push(
      `ÁPICE DA CONVERSA (${what}):\n- ${rules.join("\n- ") || "conduza naturalmente até este ponto"}\n- Conte como interação cada mensagem enviada pelo lead nesta conversa.`,
    );
  }

  const discounts = (tree.discounts ?? []).filter((d) => d && (d.value || d.min || d.max));
  if (discounts.length) {
    const linhas = discounts.map((d) => {
      const un = d.unit === "percent" ? "%" : "R$";
      const valor =
        d.kind === "faixa"
          ? `negocie entre ${un} ${Number(d.min) || 0} e ${un} ${Number(d.max) || 0} (comece sempre pelo menor)`
          : `${un} ${Number(d.value) || 0} fixo`;
      return `- ${d.label?.trim() || "Desconto"}: ${valor}${d.when?.trim() ? ` — usar só quando: ${d.when.trim()}` : ""}`;
    });
    lines.push(
      `DESCONTOS AUTORIZADOS (nunca ofereça nada além disso, nunca invente condição):\n${linhas.join("\n")}`,
    );
  }

  const walk = (node: ObjectiveNodeLike, prefix: string) => {
    const kind = node.block ?? "objetivo";

    // Blocos de sistema: a IA não conversa neles, só precisa entender o fluxo.
    if (kind === "acao" || kind === "condicao" || kind === "tracking") {
      const nome = node.say?.trim() || "(sem nome)";
      const acts0 = (node.actions ?? []).filter((a) => a?.action);
      const linhaAcoes = acts0.length
        ? ` O sistema executa: ${acts0.map((a) => `${a.action}${a.targetLabel ? ` → ${a.targetLabel}` : ""}`).join("; ")}.`
        : "";
      if (kind === "acao") {
        const contextoAcao = node.expected?.trim() ? ` Motivo/Contexto: ${node.expected.trim()}.` : "";
        lines.push(`${prefix} [BLOCO DE AÇÃO] ${nome} — o sistema executa sozinho, não fale nada sobre isso.${contextoAcao}${linhaAcoes}`);
      } else if (kind === "condicao") {
        const rows = (node.conditions ?? []).filter((c) => c?.field);
        const desc = rows
          .map((c) => {
            if (c.field === "campo") {
              const def = customFieldsById[String(c.fieldId ?? "")];
              const nomeCampo = def?.name ?? "campo personalizado";
              const atual = def?.value?.trim() ? `"${def.value}"` : "(vazio)";
              return `campo personalizado "${nomeCampo}" (valor atual do lead: ${atual}) ${c.op ?? "contem"} "${c.value ?? ""}"`;
            }
            return `${c.field} ${c.op ?? "contem"} "${c.value ?? ""}"`;
          })
          .join((node.conditionLogic ?? "e") === "ou" ? " OU " : " E ");
        lines.push(
          `${prefix} [BLOCO DE CONDIÇÃO] ${nome} — o sistema verifica: ${desc || "(sem condições)"}. Se bater, segue pelo 1º caminho; se não, pelo 2º.`,
        );
      } else {
        const t = node.tracking ?? {};
        const ev = t.event === "custom" ? t.customEvent || "evento personalizado" : t.event || "lead";
        const sourceLabel = t.siteId === "crm-capi" ? "Módulo CRM/CAPI" : t.siteId?.startsWith("meta-") ? "Módulo Meta Ads" : "Pixel do Site";
        lines.push(
          `${prefix} [BLOCO DE TRACKING] ${nome} — o sistema fica conferindo via ${sourceLabel}, a cada ${Number(t.everyMinutes) || 5} min, se ocorreu o evento "${ev}"${t.match?.trim() ? ` na página "${t.match.trim()}"` : ""}. Não pergunte ao lead se ele fez isso: você é avisado pelo sistema.${
            t.onFoundMessage?.trim() ? ` Quando confirmar, diga algo como: "${t.onFoundMessage.trim()}".` : ""
          }${linhaAcoes}`,
        );
      }
      for (const c of node.children ?? []) walk(c, `${prefix}  `);
      return;
    }

    const parts: string[] = [`${prefix} Objetivo: ${node.say?.trim() || "(não definido)"}`];
    if (node.when?.trim()) parts.push(`${prefix}   Só siga por este caminho se: ${node.when.trim()}`);
    if (node.returnAfter)
      parts.push(
        `${prefix}   DESVIO: resolva só este assunto, sem alongar, e volte imediatamente ao objetivo de onde saiu, retomando dali pro próximo passo.`,
      );
    if (node.expected?.trim()) parts.push(`${prefix}   Conclui quando: ${node.expected.trim()}`);

    if ((node.mode ?? "free") === "strict" && node.questions?.length) {
      parts.push(`${prefix}   Perguntas OBRIGATÓRIAS, faça na ordem, uma por vez:`);
      node.questions.filter(Boolean).forEach((q, i) => parts.push(`${prefix}     ${i + 1}. ${q}`));
    }
    const lks = (node.links ?? []).filter((l) => l?.url?.trim());
    if (lks.length) {
      parts.push(`${prefix}   Links que você pode enviar neste objetivo (envie o URL exatamente como está):`);
      lks.forEach((l) =>
        parts.push(
          `${prefix}     - ${l.label?.trim() || "Link"}: ${l.url!.trim()}${l.when?.trim() ? ` (enviar quando: ${l.when.trim()})` : ""}`,
        ),
      );
    }
    const maxTurns = Number(node.maxTurns) || 0;
    const minTurns = Number(node.minTurns) || 0;
    if (minTurns > 0) {
      parts.push(
        `${prefix}   Troque no MÍNIMO ${minTurns} mensagens com o lead dentro deste objetivo antes de avançar, mesmo que ele já tenha dado a resposta esperada.`,
      );
    }
    parts.push(
      maxTurns > 0
        ? `${prefix}   Você pode trocar até ${maxTurns} mensagens com o lead dentro deste objetivo; depois disso avance mesmo com o que tiver.`
        : `${prefix}   Sem limite máximo de interações: faça quantas perguntas forem necessárias até cumprir o critério.`,
    );

    if (node.keepOnTrack !== false) {
      parts.push(
        `${prefix}   ANCORAGEM: se o lead mudar de assunto, responda com educação e em seguida retome este objetivo até concluí-lo.`,
      );
    }
    const acts = (node.actions ?? []).filter((a) => a?.action);
    if (acts.length) {
      parts.push(
        `${prefix}   Ao concluir, o sistema executa: ${acts
          .map((a) => `${a.action}${a.targetLabel ? ` → ${a.targetLabel}` : ""}`)
          .join("; ")}`,
      );
    }
    const fbs = (node.fallbacks ?? []).filter((f) => f?.kind);
    if (fbs.length) {
      parts.push(`${prefix}   CONTINGÊNCIAS (o objetivo não avançou):`);
      for (const f of fbs) {
        const dest =
          f.goTo === "proximo"
            ? "depois disso, avance para o próximo objetivo mesmo sem concluir este"
            : f.goTo === "encerrar"
              ? "depois disso, encerre e finalize com [[HANDOFF]]"
              : "continue tentando concluir este objetivo";
        let cond = "";
        if (f.kind === "inatividade")
          cond = `o lead ficar ${Number(f.minutes) || 30} min sem responder (o sistema cobra até ${Number(f.attempts) || 2}x)`;
        else if (f.kind === "negativa")
          cond = "o lead recusar, dizer que não tem interesse, que está caro ou que não quer";
        else if (f.kind === "palavra-chave")
          cond = `o lead escrever algo como: ${(f.keywords ?? []).join(", ") || "(termos não definidos)"}`;
        else if (f.kind === "limite-interacoes")
          cond = `passar de ${Number(f.times) || 6} mensagens sem concluir este objetivo`;
        else if (f.kind === "desvio-repetido")
          cond = `o lead fugir do assunto ${Number(f.times) || 3} vezes seguidas`;
        const acts2 = (f.actions ?? []).filter((a) => a?.action);
        parts.push(
          `${prefix}     - Se ${cond}: ${f.message?.trim() ? `diga algo como "${f.message.trim()}" e ` : ""}${dest}.` +
            (acts2.length
              ? ` O sistema executa: ${acts2.map((a) => `${a.action}${a.targetLabel ? ` → ${a.targetLabel}` : ""}`).join("; ")}.`
              : ""),
        );
      }
    }

    lines.push(parts.join("\n"));
    const kids = node.children ?? [];
    if (kids.length > 1) {
      const desvios = kids.filter((c) => c.returnAfter);
      const caminhos = kids.filter((c) => !c.returnAfter);
      if (caminhos.length) {
        const opts = caminhos.map(
          (c, i) =>
            `${prefix}${i + 1}. ${c.when?.trim() ? `se ${c.when.trim()}` : "caminho alternativo"} → ${c.say?.trim() || "(objetivo não definido)"}`,
        );
        lines.push(
          `${prefix}   CAMINHOS POSSÍVEIS depois deste objetivo (escolha UM, pelo que o lead responder, e siga por ele até o objetivo final):\n${opts.join("\n")}`,
        );
      }
      if (desvios.length) {
        const opts = desvios.map(
          (c) =>
            `${prefix}- ${c.when?.trim() ? `se ${c.when.trim()}` : "se o lead puxar esse assunto"} → resolva "${c.say?.trim() || "(objetivo não definido)"}" e volte para este objetivo`,
        );
        lines.push(
          `${prefix}   DESVIOS PERMITIDOS aqui (parada rápida, não trocam o caminho principal):\n${opts.join("\n")}`,
        );
      }
    }
    kids.forEach((c, i) => walk(c, `${prefix}${i + 1}.`));

    kids.forEach((c, i) => walk(c, `${prefix}${i + 1}.`));

  };
  walk(tree.root, "1.");

  const outcome = Array.isArray(tree.outcome) ? tree.outcome.filter((o) => o?.action && o.action !== "proximo-objetivo") : [];
  if (outcome.length) {
    lines.push(
      `ENCERRAMENTO: quando o fluxo terminar, o sistema executa: ${outcome
        .map((o) => `${o.action}${o.targetLabel ? ` → ${o.targetLabel}` : ""}`)
        .join("; ")}. Sinalize o fim com [[HANDOFF]].`,
    );
  }

  return [
    "FLUXO DE OBJETIVOS (siga na ordem, um objetivo por vez, só avance quando o critério for cumprido).",
    [
      "COMO USAR OS CAMINHOS E DESVIOS:",
      "- O fluxo existe para chegar no OBJETIVO FINAL. Tudo o que você fizer tem que empurrar a conversa pra lá.",
      "- Se o lead puxar um assunto que tem DESVIO configurado (preço, prazo, comparação, objeção...), atenda esse desvio: explique, qualifique, resolva rápido e, sem anunciar que está voltando, retome exatamente o objetivo de onde saiu.",
      "- Se o assunto do lead corresponde a um CAMINHO, mude de trilho e siga por esse caminho até o final — não volte pro anterior.",
      "- Se o lead fugir para algo que não tem desvio nem caminho, responda em 1 frase e volte imediatamente à pergunta pendente do objetivo atual.",
      "- Nunca abandone o objetivo atual, nunca fique preso num desvio e nunca invente etapas que não estão no fluxo.",
    ].join("\n"),
    ...lines,
  ].join("\n\n");
}



/**
 * Executa de fato as ações configuradas no agente IA (encerramento do fluxo de
 * objetivos, contingências e regras). Os alvos vêm dos seletores da UI, então
 * `target` é sempre um ID real (etapa, salesbot, usuário, formulário, arquivo).
 */
/** Config do compromisso criada pelo AppointmentPicker (JSON no target). */
function parseAppointmentTarget(raw?: string | null) {
  const base = { titulo: "", duracaoMin: 30, antecedenciaMin: 60, responsavelId: "", googleAgendaLead: true };
  if (!raw) return base;
  try {
    const p = JSON.parse(raw) as Partial<typeof base>;
    return { ...base, ...p, titulo: String(p.titulo ?? "") };
  } catch {
    return { ...base, titulo: String(raw) };
  }
}

/** Link "adicionar ao Google Agenda" — funciona no Google Agenda do próprio lead. */
function googleCalendarLink(titulo: string, start: Date, end: Date) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: titulo,
    dates: `${fmt(start)}/${fmt(end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function executeAgentActions(
  supabaseAdmin: AnySb,
  workspaceId: string,
  leadId: string,
  phone: string,
  actions: Array<{ action?: string; target?: string; targetLabel?: string; message?: string }> | undefined | null,
  sessionId?: string | null,
): Promise<void> {
  let resolvedActionRoute: RuntimeWhatsappTarget | null | undefined;
  const getActionRoute = async (): Promise<RuntimeWhatsappTarget | null> => {
    if (sessionId) {
      const jidIdentity = whatsappIdentityFromJid(phone);
      if (jidIdentity) {
        return {
          phone: jidIdentity.kind === "group" ? jidIdentity.remoteJid : jidIdentity.number,
          remoteJid: jidIdentity.remoteJid,
          sessionId,
          conversationKey: `${sessionId}:${jidIdentity.remoteJid.toLowerCase()}`,
          source: jidIdentity.kind === "group" ? "group_jid" : "conversation_jid",
        };
      }
      const normalized = normalizeInternationalPhone(phone, { allowTrustedBare: true });
      if (normalized.ok === false) return null;
      const remoteJid = `${normalized.digits}@s.whatsapp.net`;
      return {
        phone: normalized.digits,
        remoteJid,
        sessionId,
        conversationKey: `${sessionId}:${remoteJid.toLowerCase()}`,
        source: "explicit_phone",
      };
    }
    if (resolvedActionRoute !== undefined) return resolvedActionRoute;
    resolvedActionRoute = await resolveRuntimeWhatsappTarget(
      supabaseAdmin,
      workspaceId,
      leadId,
      phone,
    );
    return resolvedActionRoute;
  };

  for (const a of actions ?? []) {
    const kind = String(a?.action ?? "");
    const target = String(a?.target ?? "").trim();
    if (!kind) continue;
    try {
      switch (kind) {
        case "proximo-objetivo": {
          // Ação nula: apenas para avançar o fluxo no canvas sem efeitos no CRM.
          break;
        }
        case "mudar-etapa":
        case "trocar-etapa": {
          if (!target) break;
          const { data: stageRow } = await supabaseAdmin
            .from("pipeline_stages")
            .select("id, name, pipeline_id")
            .eq("id", target)
            .eq("workspace_id", workspaceId)
            .maybeSingle();
          const st = stageRow as { id: string; name?: string | null; pipeline_id?: string | null } | null;
          if (!st || !st.pipeline_id) break;
          const { data: currentLead } = await supabaseAdmin.from("leads")
            .select("stage_id")
            .eq("id", leadId)
            .eq("workspace_id", workspaceId)
            .maybeSingle();
          if (!currentLead) break;
          const fromStageId = (currentLead as { stage_id?: string | null }).stage_id ?? null;
          await supabaseAdmin.from("leads")
            .update({ stage_id: st.id, pipeline_id: st.pipeline_id, updated_at: new Date().toISOString() })
            .eq("id", leadId).eq("workspace_id", workspaceId);
          await supabaseAdmin.from("lead_activities").insert({
            workspace_id: workspaceId, lead_id: leadId, type: "stage_change",
            payload: { from_stage_id: fromStageId, to_stage_id: st.id, to_stage_nome: st.name ?? "", by: null, source: "ai_agent" },
          });
          const { dispatchCrmStageMoved } = await import("@/lib/crm-event-dispatch.server");
          await dispatchCrmStageMoved(supabaseAdmin as never, {
            workspaceId, leadId, newStageId: st.id, newPipelineId: st.pipeline_id, fromStageId,
          });
          break;
        }
        case "adicionar-tag": {
          const incoming = target.split(",").map((t) => t.trim()).filter(Boolean);
          if (!incoming.length) break;
          const { data: leadRow } = await supabaseAdmin
            .from("leads").select("tags").eq("id", leadId).eq("workspace_id", workspaceId).maybeSingle();
          const cur = Array.isArray((leadRow as { tags?: string[] } | null)?.tags) ? (leadRow as { tags: string[] }).tags : [];
          const existing = new Set(cur.map((tag) => String(tag).toLocaleLowerCase()));
          const added = incoming.filter((tag) => !existing.has(tag.toLocaleLowerCase()));
          if (!added.length) break;
          await supabaseAdmin.from("leads")
            .update({ tags: [...cur, ...added], updated_at: new Date().toISOString() })
            .eq("id", leadId).eq("workspace_id", workspaceId);
          const { dispatchCrmTagAdded } = await import("@/lib/crm-event-dispatch.server");
          await dispatchCrmTagAdded(supabaseAdmin as never, { workspaceId, leadId, tags: added });
          break;
        }
        case "ler-historico": {
          // Leitura de contexto: não muda nada no CRM, o efeito acontece no
          // prompt (o agente passa a receber a conversa completa).
          break;
        }
        case "transferir-humano": {
          if (target) {
            const { data: member } = await supabaseAdmin.from("workspace_members")
              .select("user_id").eq("workspace_id", workspaceId).eq("user_id", target).maybeSingle();
            if (!member) break;
            await supabaseAdmin.from("leads")
              .update({ responsible_id: target, updated_at: new Date().toISOString() })
              .eq("id", leadId).eq("workspace_id", workspaceId);
            const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");
            await enqueueLeadAutomationEvent(supabaseAdmin as never, {
              leadId, event: "assignee-changed", workspaceId,
            });
          }
          await supabaseAdmin.from("lead_activities").insert({
            workspace_id: workspaceId, lead_id: leadId, type: "note",
            payload: { text: `Agente IA transferiu o atendimento${a?.targetLabel ? ` para ${a.targetLabel}` : ""}.`, source: "ai_agent" },
          });
          break;
        }
        case "criar-tarefa": {
          await supabaseAdmin.from("tasks").insert({
            workspace_id: workspaceId,
            lead_id: leadId,
            title: (a?.message?.trim() || a?.targetLabel?.trim() || target || "Tarefa criada pelo agente IA").slice(0, 200),
            status: "pendente",
            kind: "tarefa",
            due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          });
          break;
        }
        case "alterar-responsavel":
        case "mudar-responsavel":
        case "transferir-usuario": {
          if (!target) break;
          const { data: member } = await supabaseAdmin.from("workspace_members")
            .select("user_id").eq("workspace_id", workspaceId).eq("user_id", target).maybeSingle();
          if (!member) break;
          await supabaseAdmin.from("leads")
            .update({ responsible_id: target, updated_at: new Date().toISOString() })
            .eq("id", leadId).eq("workspace_id", workspaceId);
          const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");
          await enqueueLeadAutomationEvent(supabaseAdmin as never, {
            leadId, event: "assignee-changed", workspaceId,
          });
          await supabaseAdmin.from("lead_activities").insert({
            workspace_id: workspaceId, lead_id: leadId, type: "note",
            payload: { text: `Agente IA definiu ${a?.targetLabel || "um novo responsável"} como responsável.`, source: "ai_agent" },
          });
          break;
        }
        case "mudar-etapa-lead": {
          await executeAgentActions(
            supabaseAdmin,
            workspaceId,
            leadId,
            phone,
            [{ action: "mudar-etapa", target, targetLabel: a?.targetLabel }],
            sessionId,
          );
          break;
        }
        case "iniciar-salesbot":
        case "iniciar-bot": {
          if (!target) break;
          await startSalesbotRun(supabaseAdmin, { workspaceId, salesbotId: target, leadId });
          break;
        }
        case "enviar-formulario": {
          if (!target) break;
          const url = /^https?:\/\//i.test(target)
            ? target
            : `${resolvePublicAppUrl()}/f/${target}`;
          const texto = `${a?.message?.trim() ? `${a.message.trim()} ` : ""}${url}`;
          const route = await getActionRoute();
          if (!route) break;
          await sendWhatsappText(supabaseAdmin, workspaceId, route.phone, texto, route.sessionId);
          break;
        }
        case "enviar-arquivo": {
          if (!target) break;
          if (/^https?:\/\//i.test(target)) {
            const route = await getActionRoute();
            if (!route) break;
            await sendWhatsappText(
              supabaseAdmin,
              workspaceId,
              route.phone,
              `${a?.message?.trim() ? `${a.message.trim()} ` : ""}${target}`,
              route.sessionId,
            );
          } else {
            const route = await getActionRoute();
            if (!route) break;
            await sendWhatsappMedia(
              supabaseAdmin as never, workspaceId, route.phone, target, "document",
              "application/octet-stream", a?.targetLabel || "arquivo", a?.message?.trim() ?? "",
              false, route.sessionId,
            );
          }
          break;
        }
        case "enviar-mensagem": {
          const texto = (a?.message ?? a?.targetLabel ?? target).trim();
          if (texto) {
            const route = await getActionRoute();
            if (!route) break;
            await sendWhatsappText(supabaseAdmin, workspaceId, route.phone, texto, route.sessionId);
          }
          break;
        }
        case "remover-tag": {
          const remover = target.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
          if (!remover.length) break;
          const { data: leadRow } = await supabaseAdmin
            .from("leads").select("tags").eq("id", leadId).eq("workspace_id", workspaceId).maybeSingle();
          const cur = Array.isArray((leadRow as { tags?: string[] } | null)?.tags) ? (leadRow as { tags: string[] }).tags : [];
          await supabaseAdmin.from("leads")
            .update({ tags: cur.filter((t) => !remover.includes(String(t).toLowerCase())), updated_at: new Date().toISOString() })
            .eq("id", leadId).eq("workspace_id", workspaceId);
          break;
        }
        // Campo personalizado: alvo no formato `fieldId=valor`.
        case "definir-campo":
        case "atualizar-campo": {
          const sep = target.indexOf("=");
          const fieldId = sep === -1 ? target : target.slice(0, sep).trim();
          let valor = sep === -1 ? (a?.message ?? "").trim() : target.slice(sep + 1).trim();
          if (/\{\{\s*agora\s*\}\}/i.test(valor)) valor = valor.replace(/\{\{\s*agora\s*\}\}/gi, new Date().toISOString());
          if (!fieldId) break;
          const { data: field } = await supabaseAdmin.from("lead_custom_fields")
            .select("id, name").eq("id", fieldId).eq("workspace_id", workspaceId).maybeSingle();
          if (!field) break;
          await supabaseAdmin.from("lead_custom_field_values").upsert({
            workspace_id: workspaceId,
            lead_id: leadId,
            field_id: fieldId,
            value: { display: valor, raw: [valor] },
            updated_at: new Date().toISOString(),
          }, { onConflict: "lead_id,field_id" });
          const { dispatchCrmFieldUpdated } = await import("@/lib/crm-event-dispatch.server");
          await dispatchCrmFieldUpdated(supabaseAdmin as never, {
            workspaceId, leadId, fieldId, fieldName: (field as { name?: string }).name,
          });
          break;
        }
        case "vincular-produto": {
          let cfg: Record<string, unknown> = {};
          try { cfg = target.startsWith("{") ? (JSON.parse(target) as Record<string, unknown>) : {}; } catch { cfg = {}; }
          const pId = String(cfg["productId"] ?? "").trim();
          if (!pId) break;
          const { data: product } = await supabaseAdmin.from("products")
            .select("id").eq("id", pId).eq("workspace_id", workspaceId).maybeSingle();
          if (!product) break;
          const kind = (cfg["kind"] as "interesse" | "comprou") || "interesse";
          await supabaseAdmin.from("lead_products").upsert(
            { workspace_id: workspaceId, lead_id: leadId, product_id: pId, kind },
            { onConflict: "lead_id,product_id,kind" },
          );
          await supabaseAdmin.from("lead_activities").insert({
            workspace_id: workspaceId, lead_id: leadId, type: "produto_vinculado",
            payload: { product_id: pId, kind, source: "ai_agent" },
          });
          break;
        }
        // Tarefa no Fluxo de Trabalho (pipeline/etapa/responsável reais).
        case "criar-tarefa-workflow": {
          let cfg: Record<string, unknown> = {};
          try { cfg = target.startsWith("{") ? (JSON.parse(target) as Record<string, unknown>) : {}; } catch { cfg = {}; }
          const pipelineId = String(cfg["pipelineId"] ?? "").trim();
          if (!pipelineId) break;
          const minutos = Number(cfg["dueInMinutes"] ?? 1440);
          const { createWorkflowTaskAdmin } = await import("@/lib/workflow-task-create.server");
          await createWorkflowTaskAdmin({
            workspaceId,
            pipelineId,
            stageId: (cfg["stageId"] as string | undefined) || null,
            title: String(cfg["title"] ?? a?.message ?? "Tarefa criada pelo agente IA").slice(0, 160),
            description: (cfg["description"] as string | undefined) ?? null,
            priority: (cfg["priority"] as "baixa" | "media" | "alta" | "urgente" | undefined) ?? "media",
            dueAt: new Date(Date.now() + Math.max(0, minutos) * 60_000).toISOString(),
            assigneeId: (cfg["assigneeId"] as string | undefined) || null,
            leadId,
          });
          break;
        }
        // Leituras de contexto: o dado real entra no prompt (buildAgentSystemDataBlock).
        case "consultar-trafego":
        case "consultar-social":
        case "consultar-tracking":
        case "consultar-workflow":
          break;
        case "encerrar-conversa": {
          await supabaseAdmin.from("leads")
            .update({ active_conversation_agent_id: null, ai_paused: true, updated_at: new Date().toISOString() })
            .eq("id", leadId).eq("workspace_id", workspaceId);
          break;
        }
        default:
          break;

      }
    } catch {
      // Uma ação com falha não pode derrubar o restante do encerramento.
    }
  }
}



/** Ações "Quando → Fazer" configuradas no Agente de Prompt. */
type PromptAgentAction = {
  id?: string;
  when?: { trigger?: string; subjects?: string[]; custom?: string };
  do?: {
    action?: string; message?: string; target?: string; targetLabel?: string; withPermission?: boolean; withSummary?: boolean;
    task?: { title?: string; description?: string; workflowPipelineId?: string; workflowStageId?: string; assigneeId?: string; priority?: "baixa" | "media" | "alta" | "urgente"; dueInMinutes?: number; durationMinutes?: number; addToCalendar?: boolean };
  };
  more?: string;
};

import { describePromptAgentActions } from "@/lib/agent-action-rules";
import {
  describeConversationFacts,
  evaluateTrigger,
  detectSentiment,

  type MessageFormat,
  type TriggerContext,
} from "@/lib/agent-trigger-eval";
import {
  matchAgentRules,
  ruleActionToRuntime,
  ruleEndsConversation,
  type AgentRuleLike,
} from "@/lib/agent-conditional-rules";

const FORMAT_MAP: Record<string, MessageFormat> = {
  text: "texto", chat: "texto", conversation: "texto", extendedtextmessage: "texto",
  audio: "áudio", ptt: "áudio", audiomessage: "áudio",
  image: "imagem", imagemessage: "imagem", sticker: "imagem",
  video: "vídeo", videomessage: "vídeo",
  document: "documento", documentmessage: "documento",
  location: "localização", locationmessage: "localização",
};

/**
 * Monta os FATOS que a IA não consegue inferir sozinha (horário, formato da
 * mensagem, tempo sem resposta) para avaliar os gatilhos "Quando".
 */
async function buildTriggerContext(
  supabaseAdmin: AnySb,
  workspaceId: string,
  phone: string,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  lead?: { name?: string | null; email?: string | null; phone?: string | null },
): Promise<TriggerContext> {
  let messageFormat: MessageFormat = "texto";
  let minutesSinceCustomerMessage: number | null = null;
  let finalMessage = message;
  try {
    const jidIdentity = whatsappIdentityFromJid(phone);
    const isGroup = jidIdentity?.kind === "group";
    const digits = isGroup
      ? ""
      : (jidIdentity?.kind === "direct"
          ? jidIdentity.digits
          : String(phone ?? "").replace(/\D/g, ""));
    const expectedJid = isGroup
      ? jidIdentity.remoteJid
      : (digits.length >= 8 ? `${digits}@s.whatsapp.net` : "");
    if (expectedJid) {
      let messageQuery = supabaseAdmin
        .from("whatsapp_web_messages")
        .select("id, message_type, from_me, received_at, body, media_url, raw")
        .eq("workspace_id", workspaceId);
      messageQuery = isGroup
        ? messageQuery.eq("remote_jid", expectedJid)
        : messageQuery.or(
            `sender_phone.eq.${digits},remote_jid.eq.${expectedJid},to_jid.eq.${expectedJid}`,
          );
      const { data } = await messageQuery
        .order("received_at", { ascending: false })
        .limit(20);
      const rows = (data ?? []) as Array<{
        id?: string; message_type?: string; from_me?: boolean; received_at?: string;
        body?: string | null; media_url?: string | null; raw?: Record<string, unknown> | null;
      }>;
      const ultima = rows.find((r) => r.from_me === false);
      if (ultima) {
        messageFormat = FORMAT_MAP[String(ultima.message_type ?? "").toLowerCase()] ?? "texto";
        if (ultima.received_at) {
          minutesSinceCustomerMessage = (Date.now() - new Date(ultima.received_at).getTime()) / 60_000;
        }
        // Áudio: o modelo não "ouve" — transcrevemos com a chave OpenAI do workspace.
        if (messageFormat === "áudio") {
          const { transcribeWhatsappAudioMessage } = await import("@/lib/audio-transcription.server");
          const texto = await transcribeWhatsappAudioMessage(supabaseAdmin, workspaceId, ultima);
          if (texto) {
            finalMessage = `[áudio transcrito] ${texto}`;
          } else if (!String(message ?? "").trim()) {
            finalMessage = "[áudio recebido — não foi possível transcrever]";
          }
        }
      }
    }
  } catch {
    // sem dados de canal: os gatilhos dependentes ficam como "verifique você"
  }
  // Fuso do Brasil, para os gatilhos de horário baterem com o expediente do cliente.
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return { message: finalMessage, messageFormat, history, minutesSinceCustomerMessage, now, lead };

}


/**
 * Ação "ler histórico da conversa": quando o agente tem esse bloco em qualquer
 * objetivo (ou no encerramento), ele deixa de olhar só as últimas mensagens e
 * recebe a conversa inteira com o lead para entender o contexto geral.
 */
function wantsFullConversationHistory(meta: unknown): boolean {
  try {
    return JSON.stringify(meta ?? {}).includes("ler-historico");
  } catch {
    return false;
  }
}

/** Executa um turno do agente IA de conversa e envia a resposta via WhatsApp. */
async function runAiAgentTurn(
  supabaseAdmin: AnySb, workspaceId: string, leadId: string, phone: string, agentId: string, extraUserMessage?: string, expectedVersion?: number,
): Promise<{ reply: string; handoff: boolean; error?: string }> {
  try {
    return await withAgentGuard(supabaseAdmin, workspaceId, leadId,
      () => runAiAgentTurnUnchecked(supabaseAdmin, workspaceId, leadId, phone, agentId, extraUserMessage), agentId, expectedVersion);
  } catch (error) {
    return { reply: "", handoff: false, error: error instanceof Error ? error.message : "Agente IA interrompido." };
  }
}
async function runAiAgentTurnUnchecked(
  supabaseAdmin: AnySb,
  workspaceId: string,
  leadId: string,
  phone: string,
  agentId: string,
  extraUserMessage?: string,
): Promise<{ reply: string; handoff: boolean; error?: string }> {
  const agent = await loadConversationAgent(supabaseAdmin, workspaceId, agentId);
  if (!agent) return { reply: "", handoff: true, error: "Agente IA não encontrado" };
  const readiness=promptReadinessError(agent.system_prompt);
  if(readiness)return {reply:"",handoff:true,error:readiness};

  const meta = (agent.metadata ?? {}) as {
    settings?: {
      language?: string;
      allowed_actions?: string[];
      actions?: PromptAgentAction[];
      sources?: unknown[];
      links?: Array<{ label?: string; url?: string; when?: string }>;
      rules?: AgentRuleLike[];
    };
    objective_tree?: ObjectiveTreeLike & { sources?: unknown[] };
  };
  const idioma = meta.settings?.language ?? "pt-BR";
  const persona = agent.persona ?? "";
  const customFieldValues = await loadLeadCustomFieldMap(supabaseAdmin, workspaceId, leadId);
  const customFieldBlock = Object.entries(customFieldValues)
    .map(([key, value]) => `- ${key.replace(/^campo:/, "")}: ${value}`)
    .join("\n");
  const customFieldsById = await loadLeadCustomFieldById(supabaseAdmin, workspaceId, leadId);
  const objetivoBlock = describeObjectiveTree(meta.objective_tree, customFieldsById);

  // Ação "ler histórico da conversa": puxa o atendimento inteiro, não só o fim.
  const lerHistoricoCompleto = wantsFullConversationHistory(meta);
  const history = await loadConversationHistoryForAI(
    supabaseAdmin, workspaceId, leadId, lerHistoricoCompleto ? 300 : 24,
  );
  const historicoBlock = lerHistoricoCompleto
    ? `LEITURA DE HISTÓRICO ATIVA: você está recebendo a conversa COMPLETA com este lead (até 300 mensagens). Antes de responder, releia o histórico, identifique o que já foi combinado, o que já foi respondido, as objeções que apareceram e onde a conversa travou. Nunca repita perguntas já respondidas e retome exatamente do ponto onde parou para destravar o objetivo atual.`
    : "";
  // "Quando" avaliado pelo servidor: horário, formato, tempo sem resposta,
  // primeira vez, dado fornecido e sentimento deixam de ser chute da IA.
  const ultimaDoCliente = extraUserMessage
    ?? [...history].reverse().find((m) => m.role === "user")?.content
    ?? "";
  const historicoAnterior = extraUserMessage
    ? history
    : history.slice(0, history.map((m) => m.role).lastIndexOf("user"));
  const { data: leadRow } = await supabaseAdmin
    .from("leads").select("name, email, phone, tags, stage_id").eq("id", leadId).maybeSingle();
  const routeTarget = await resolveRuntimeWhatsappTarget(
    supabaseAdmin,
    workspaceId,
    leadId,
    phone || (leadRow as { phone?: string | null } | null)?.phone || null,
  );
  if (!routeTarget) {
    return {
      reply: "",
      handoff: true,
      error: "Identidade WhatsApp ambígua: DDI explícito ou conversa real obrigatórios.",
    };
  }
  const routedPhone = routeTarget.phone;
  const routedSessionId = routeTarget.sessionId;
  const triggerCtx = await buildTriggerContext(
    supabaseAdmin, workspaceId, routedPhone, ultimaDoCliente, historicoAnterior,
    (leadRow ?? undefined) as { name?: string | null; email?: string | null; phone?: string | null } | undefined,
  );
  const acoes = meta.settings?.actions ?? [];
  const verdicts: Record<string, { status: "ativo" | "inativo" | "ia"; detail: string }> = {};
  for (const a of acoes) {
    if (a?.id) verdicts[a.id] = evaluateTrigger(a.when, triggerCtx);
  }
  const acoesBlock = describePromptAgentActions(acoes, verdicts);
  const fatosBlock = acoes.length || triggerCtx.messageFormat !== "texto" ? describeConversationFacts(triggerCtx) : "";
  // Fontes de conhecimento (texto, documento no storage e URL) resolvidas de verdade.
  let conhecimentoBlock = "";
  try {
    const { buildWorkspaceAgentKnowledgeBlock } = await import("@/lib/agent-brain-sources.server");
    const todas = [
      ...(Array.isArray(meta.settings?.sources) ? meta.settings!.sources! : []),
      ...(Array.isArray(meta.objective_tree?.sources) ? meta.objective_tree!.sources! : []),
    ] as never;
    conhecimentoBlock = await buildWorkspaceAgentKnowledgeBlock(supabaseAdmin as never, workspaceId, todas);
  } catch {
    return { reply: "", handoff: false, error: "Não foi possível consultar as fontes atuais do Cérebro." };
  }
  // Links cadastrados no agente (vale para prompt e fluxo de objetivos).
  const linksCadastrados = (meta.settings?.links ?? []).filter((l) => (l?.url ?? "").trim());
  const linksBlock = linksCadastrados.length
    ? `LINKS QUE VOCÊ PODE ENVIAR (copie a URL exatamente como está, nunca invente nem encurte):\n${linksCadastrados
        .map(
          (l) =>
            `- ${l.label?.trim() || "Link"}: ${l.url!.trim()}${l.when?.trim() ? ` (enviar quando: ${l.when.trim()})` : ""}`,
        )
        .join("\n")}`
    : "Você não tem links cadastrados: nunca envie URLs nem invente endereços de site.";

  // Grupos: o agente pode marcar participantes usando `{@<numero>}`.
  const isGrupoConversa = String(routedPhone ?? "").includes("@g.us");
  const mencaoBlock = isGrupoConversa
    ? [
        "Você está falando dentro de um GRUPO de WhatsApp.",
        "Para marcar (mencionar) alguém use exatamente estes tokens no texto:",
        "- {@participante} marca quem acabou de falar;",
        "- {@membro} marca quem entrou, saiu ou foi promovido (quando esse foi o gatilho);",
        "- {@admins} marca todos os administradores do grupo;",
        "- {@todos} marca todo mundo — use só quando for realmente necessário;",
        "- {@<numero com DDI e DDD>} marca uma pessoa específica.",
        "Nunca escreva o número solto no texto e nunca invente participantes.",
        "Neste grupo não existem botões: ofereça as opções escritas na própria mensagem.",
      ].join("\n")
    : "";


  // Dados reais dos outros módulos (tráfego, social, tracking, workflow).
  let sistemaBlock = "";
  try {
    const { buildAgentSystemDataBlock } = await import("@/lib/agent-system-data.server");
    sistemaBlock = await buildAgentSystemDataBlock(supabaseAdmin as never, workspaceId, leadId, meta);
  } catch {
    sistemaBlock = "";
  }

  const sys = [
    agent.system_prompt ?? "",
    mencaoBlock,
    persona ? `Persona: ${persona}` : "",
    `Idioma padrão: ${idioma}.`,
    objetivoBlock,
    historicoBlock,
    conhecimentoBlock,
    linksBlock,
    fatosBlock,
    acoesBlock,
    sistemaBlock,

    customFieldBlock
      ? `Campos personalizados ATUAIS deste lead:\n${customFieldBlock}`
      : "Este lead ainda não possui valores em campos personalizados.",
    
    `CAMPOS DISPONÍVEIS NO CRM para você preencher (ID: Nome [tipo]):\n` + 
    Object.entries(customFieldsById).map(([id, f]) => `- ${id}: ${f.name} [${f.field_type}]`).join("\n"),

    `Você está atendendo pelo WhatsApp como um humano, mensagens curtas, tom natural, sem markdown pesado.`,
    `Se identificar que já cumpriu o objetivo, que o lead pediu falar com humano, ou que a conversa deve ser encerrada, finalize sua ÚLTIMA resposta com uma nova linha contendo apenas [[HANDOFF]].`,
  ].filter(Boolean).join("\n\n");



  // Áudio: o modelo não ouve, então usamos a transcrição já resolvida em
  // buildTriggerContext como a mensagem real do lead neste turno.
  const { shouldListenToAudio, shouldReactToSentiment, pickReactionEmoji } = await import(
    "@/lib/agent-sentiment-reaction"
  );
  const ouveAudio = shouldListenToAudio(meta.settings?.allowed_actions);
  const transcrito =
    ouveAudio && triggerCtx.messageFormat === "áudio" && triggerCtx.message.startsWith("[áudio transcrito]")
      ? triggerCtx.message
      : "";
  const mensagemDoTurno = transcrito || extraUserMessage;

  const msgs: Array<{ role: string; content: string }> = [{ role: "system", content: sys }, ...history];
  if (transcrito) {
    // Substitui o placeholder vazio/genérico do áudio pela transcrição.
    const idx = msgs.map((m) => m.role).lastIndexOf("user");
    if (idx > 0) msgs[idx] = { role: "user", content: transcrito };
    else msgs.push({ role: "user", content: transcrito });
  }
  const last = history[history.length - 1];
  if (mensagemDoTurno && !transcrito && (!last || last.content !== mensagemDoTurno || last.role !== "user")) {
    msgs.push({ role: "user", content: mensagemDoTurno });
  }
  if (transcrito) {
    msgs.splice(1, 0, {
      role: "system",
      content:
        "O lead enviou um ÁUDIO. O texto entre colchetes é a transcrição desse áudio. Responda ao conteúdo do áudio normalmente, sem dizer que leu uma transcrição.",
    });
  }


  let aiKey: WorkspaceAiKey;
  try {
    const mod = await import("@/lib/workspace-ai-key.server");
    aiKey = await mod.resolveWorkspaceAiKey(supabaseAdmin as never, workspaceId);
  } catch (e) {
    return { reply: "", handoff: true, error: (e as Error).message };
  }

  const model = aiKey.provider === "lovable"
    ? (agent.model && agent.model.startsWith("openai/") ? agent.model : aiKey.defaultModel)
    : aiKey.provider === "gemini"
      ? (agent.model && agent.model.startsWith("gemini") ? agent.model : aiKey.defaultModel)
      : (agent.model && !agent.model.startsWith("openai/") ? aiKey.defaultModel : agent.model.replace(/^openai\//, ""));

  try {
    const resp = await guardedAutomationFetch(`${aiKey.baseUrl}/chat/completions`, {
      method: "POST",
      headers: aiKey.provider === "lovable"
        ? { "Content-Type": "application/json", "Lovable-API-Key": aiKey.apiKey, "X-Lovable-AIG-SDK": "salesbot-runtime" }
        : { "Content-Type": "application/json", Authorization: `Bearer ${aiKey.apiKey}` },
      body: JSON.stringify({ model, messages: msgs, temperature: 0.7 }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return { reply: "", handoff: true, error: `AI HTTP ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    await assertAutomationMayContinue();
    const raw = json.choices?.[0]?.message?.content ?? "";
    
    // Extração automática de dados via marcador [[EXTRACT_DATA:fieldId=valor]]
    const extractionMatches = Array.from(raw.matchAll(/\[\[EXTRACT_DATA:([^\]=]+)=([^\]]+)\]\]/gi));
    for (const match of extractionMatches) {
      const fieldId = match[1].trim();
      let valor = match[2].trim();
      if (fieldId) {
        if (/\{\{\s*agora\s*\}\}/i.test(valor)) valor = valor.replace(/\{\{\s*agora\s*\}\}/gi, new Date().toISOString());
        await supabaseAdmin.from("lead_custom_field_values").upsert({
          workspace_id: workspaceId,
          lead_id: leadId,
          field_id: fieldId,
          value: { display: valor, raw: [valor] },
          updated_at: new Date().toISOString(),
        }, { onConflict: "lead_id,field_id" });
      }
    }

    const actionIds = Array.from(raw.matchAll(/\[\[AGENT_ACTION:([^\]]+)\]\]/gi)).map((match) => match[1]);
    let handoff = /\[\[HANDOFF\]\]/i.test(raw);
    const reply = raw
      .replace(/\[\[HANDOFF\]\]/gi, "")
      .replace(/\[\[AGENT_ACTION:[^\]]+\]\]/gi, "")
      .replace(/\[\[EXTRACT_DATA:[^\]]+\]\]/gi, "")
      .trim();

    // Reação por sentimento: antes de responder, o agente reage na mensagem do
    // lead com um emoji coerente com o tom percebido (vale para prompt e fluxo).
    if (shouldReactToSentiment(meta.settings?.allowed_actions)) {
      try {
        const alvo = String(mensagemDoTurno || triggerCtx.message || "");
        if (alvo.trim()) {
          const emoji = pickReactionEmoji(alvo, detectSentiment(alvo));
          await sendWhatsappReaction(supabaseAdmin, workspaceId, routedPhone, emoji);
        }
      } catch {
        // reação é enfeite: nunca pode impedir a resposta do agente
      }
    }

    if (reply) {
      let replyOut = reply;
      if (isGrupoConversa) {
        // Resolve `{@participante}` com quem falou por último neste grupo.
        const { data: lastRun } = await supabaseAdmin.from("salesbot_runs")
          .select("variables")
          .eq("workspace_id", workspaceId)
          .eq("lead_id", leadId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const runVars = ((lastRun as { variables?: Record<string, unknown> } | null)?.variables ?? {}) as Record<string, unknown>;
        replyOut = resolveMentionTokens(
          replyOut,
          ({ ...(leadRow ?? {}), phone: routedPhone } as LeadRow),
          runVars,
        );
      }
      // Aplicação obrigatória das regras do Cérebro IA antes da saída do agente.
      // Falhar fechado: se o banco estiver indisponível, não enviar resposta.
      const { data: terms, error: termsError } = await supabaseAdmin
        .from("ai_brain_blocked_terms").select("term")
        .eq("workspace_id", workspaceId).eq("enabled", true);
      if (termsError) return { reply: "", handoff, error: "Não foi possível verificar palavras proibidas." };
      const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
      const normalizedReply = fold(replyOut);
      if ((terms ?? []).some((row: { term: string }) => normalizedReply.includes(fold(row.term)))) {
        return { reply: "", handoff, error: "Resposta da IA bloqueada por palavra proibida." };
      }
      const matches = [...replyOut.matchAll(/https?:\/\/[^\s<>"'()]+/gi)].map(m => m[0].replace(/[.,;!?]+$/, ""));
      if (matches.length) {
        const { data: approved, error: linksError } = await supabaseAdmin.from("ai_brain_sources")
          .select("url").eq("workspace_id", workspaceId).eq("source_type", "url").eq("enabled", true);
        if (linksError) return { reply: "", handoff, error: "Não foi possível validar links autorizados." };
        const urls = new Set((approved ?? []).map((r: { url: string | null }) => (r.url ?? "").replace(/\/$/, "")));
        if (matches.some(link => !urls.has(link.replace(/\/$/, "")))) {
          return { reply: "", handoff, error: "Resposta da IA bloqueada por link não autorizado." };
        }
      }
      const s = await sendWhatsappText(supabaseAdmin, workspaceId, routedPhone, replyOut, routedSessionId);
      if (!s.ok) return { reply, handoff, error: s.error };
      // Persiste imediatamente a resposta do agente. Não dependemos do callback
      // assíncrono da Evolution para o próximo turno enxergar o que acabamos de dizer.
      await supabaseAdmin.from("lead_activities").insert({
        workspace_id: workspaceId,
        lead_id: leadId,
        type: "message_out",
        payload: {
          text: replyOut,
          channel: "whatsapp_web",
          whatsapp_message_id: s.messageId ?? null,
          whatsapp_session_id: routedSessionId,
          whatsapp_remote_jid: routeTarget.remoteJid,
          whatsapp_conversation_key: routeTarget.conversationKey,
          source: "ai_agent",
        },
        occurred_at: new Date().toISOString(),
      });
    }


    // Regras condicionais (Se X → faça Y): avaliadas no servidor com dados reais
    // do lead e da conversa, não dependem do julgamento do modelo.
    try {
      const leadInfo = (leadRow ?? {}) as { tags?: string[] | null; stage_id?: string | null };
      const camposRegras = (meta.settings?.rules ?? [])
        .flatMap((r) => (r?.conditions ?? []).map((c) => String(c?.field ?? "")))
        .filter(Boolean);
      let systemMetrics: Record<string, number> = {};
      if (camposRegras.some((f) => /^(trafego|social|workflow|tracking)-/.test(f))) {
        try {
          const { loadSystemMetrics } = await import("@/lib/agent-system-data.server");
          systemMetrics = await loadSystemMetrics(supabaseAdmin as never, workspaceId, leadId, camposRegras);
        } catch { systemMetrics = {}; }
      }
      // Campos personalizados do lead (condição "Campo personalizado").
      let customFieldValues: Record<string, string> = {};
      if (camposRegras.some((f) => f === "campo-personalizado" || f === "campo")) {
        try {
          const { data: cfv } = await supabaseAdmin
            .from("lead_custom_field_values")
            .select("field_id, value")
            .eq("workspace_id", workspaceId)
            .eq("lead_id", leadId);
          for (const row of ((cfv ?? []) as Array<{ field_id: string; value: unknown }>)) {
            customFieldValues[row.field_id] = String(row.value ?? "");
          }
        } catch { customFieldValues = {}; }
      }
      const disparadas = matchAgentRules(meta.settings?.rules, {
        message: triggerCtx.message,
        interactions: history.filter((m) => m.role === "user").length + (extraUserMessage ? 1 : 0),
        minutesSinceCustomerMessage: triggerCtx.minutesSinceCustomerMessage,
        tags: Array.isArray(leadInfo.tags) ? leadInfo.tags : [],
        stageId: leadInfo.stage_id ?? null,
        objectiveReached: handoff,
        systemMetrics,
        customFieldValues,
      });

      for (const regra of disparadas) {
        if (ruleEndsConversation(regra)) {
          handoff = true;
          continue;
        }
        const acao = ruleActionToRuntime(regra);
        if (!acao) continue;
        await executeAgentActions(supabaseAdmin, workspaceId, leadId, routedPhone, [acao] as never, routedSessionId);
      }
      if (disparadas.length) {
        await supabaseAdmin.from("lead_activities").insert({
          workspace_id: workspaceId,
          lead_id: leadId,
          type: "note",
          payload: {
            text: `Agente IA aplicou ${disparadas.length} regra(s) condicional(is): ${disparadas
              .map((r) => r.action?.targetLabel || r.action?.type || "ação")
              .join(", ")}.`,
            source: "ai_agent",
          },
        });
      }
    } catch {
      // regra com alvo inválido não pode derrubar o atendimento
    }

    if (handoff) {
      const outcome = Array.isArray(meta.objective_tree?.outcome) ? meta.objective_tree!.outcome : [];
      await executeAgentActions(supabaseAdmin, workspaceId, leadId, routedPhone, outcome as never, routedSessionId);
      // "Transferir para usuário" do Agente de Prompt: define o responsável real do lead.
      const transferencias = (meta.settings?.actions ?? [])
        .filter((a) => a?.do?.action === "transferir-usuario" && String(a.do?.target ?? "").trim())
        .map((a) => ({ action: "transferir-humano", target: a.do!.target, targetLabel: a.do!.targetLabel }));
      if (transferencias.length) {
        await executeAgentActions(supabaseAdmin, workspaceId, leadId, routedPhone, transferencias.slice(0, 1) as never, routedSessionId);
      }
    }
    for (const actionId of actionIds) {
      const acao = (meta.settings?.actions ?? []).find((item) => item.id === actionId);
      // Trava de segurança: se o servidor sabe que o gatilho não se aplica agora,
      // não executa nada mesmo que o modelo tenha cuspido o marcador.
      if (acao?.id && verdicts[acao.id]?.status === "inativo") continue;



      // Campo personalizado: alvo no formato `fieldId=valor`, com campo real da workspace.
      if (acao?.do?.action === "definir-campo") {
        const raw = String(acao.do?.target ?? "");
        const sep = raw.indexOf("=");
        const fieldId = sep === -1 ? raw.trim() : raw.slice(0, sep).trim();
        let valor = sep === -1 ? "" : raw.slice(sep + 1).trim();
        if (/\{\{\s*agora\s*\}\}/i.test(valor)) valor = valor.replace(/\{\{\s*agora\s*\}\}/gi, new Date().toISOString());
        if (fieldId) {
          await supabaseAdmin.from("lead_custom_field_values").upsert({
            workspace_id: workspaceId,
            lead_id: leadId,
            field_id: fieldId,
            value: { display: valor, raw: [valor] },
            updated_at: new Date().toISOString(),
          }, { onConflict: "lead_id,field_id" });
        }
        continue;
      }

      // Tag: aplica no lead (cria se ainda não existir no workspace).
      if (acao?.do?.action === "gerenciar-tags") {
        const tag = String(acao.do?.target ?? "").trim();
        if (tag) {
          await executeAgentActions(supabaseAdmin, workspaceId, leadId, routedPhone, [{ action: "adicionar-tag", target: tag }] as never, routedSessionId);
        }
        continue;
      }

      // Ações que dependem de um alvo selecionado (id real do sistema).
      const alvoDireto = new Set(["iniciar-salesbot", "mudar-etapa-lead", "alterar-responsavel", "transferir-usuario", "enviar-arquivo"]);
      if (acao?.do?.action && alvoDireto.has(acao.do.action) && String(acao.do?.target ?? "").trim()) {
        await executeAgentActions(supabaseAdmin, workspaceId, leadId, routedPhone, [{
          action: acao.do.action,
          target: acao.do.target,
          targetLabel: acao.do.targetLabel,
          message: acao.do.message,
        }] as never, routedSessionId);
        continue;
      }

      // Compromisso: cria no calendário da MKTOn e manda o convite do Google Agenda.
      if (acao?.do?.action === "criar-compromisso") {
        const cfg = parseAppointmentTarget(acao.do?.target);
        if (cfg.titulo) {
          const start = new Date(Date.now() + Math.max(0, cfg.antecedenciaMin) * 60_000);
          const end = new Date(start.getTime() + Math.max(5, cfg.duracaoMin) * 60_000);
          await supabaseAdmin.from("tasks").insert({
            workspace_id: workspaceId,
            lead_id: leadId,
            title: cfg.titulo.slice(0, 200),
            status: "pendente",
            kind: "reuniao",
            due_at: start.toISOString(),
            assignee_id: cfg.responsavelId || null,
          });
          await supabaseAdmin.from("lead_activities").insert({
            workspace_id: workspaceId, lead_id: leadId, type: "note",
            payload: { text: `Compromisso "${cfg.titulo}" agendado pelo agente IA para ${start.toLocaleString("pt-BR")}.`, source: "ai_agent" },
          });
          if (cfg.googleAgendaLead) {
            const link = googleCalendarLink(cfg.titulo, start, end);
            await sendWhatsappText(
              supabaseAdmin,
              workspaceId,
              routedPhone,
              `Agendei "${cfg.titulo}". Para salvar no seu Google Agenda: ${link}`,
              routedSessionId,
            );
          }
        }
        continue;
      }

      const configured = acao?.do?.action === "adicionar-tarefa" ? acao : undefined;
      const task = configured?.do?.task;
      if (!task?.title?.trim()) continue;
      const start = new Date(Date.now() + Math.max(0, Number(task.dueInMinutes ?? 60)) * 60_000);
      const end = new Date(start.getTime() + Math.max(5, Number(task.durationMinutes ?? 30)) * 60_000);
      const dueAt = start.toISOString();
      if (task.workflowPipelineId) {
        const { createWorkflowTaskAdmin } = await import("@/lib/workflow-task-create.server");
        await createWorkflowTaskAdmin({
          workspaceId,
          pipelineId: task.workflowPipelineId,
          stageId: task.workflowStageId ?? null,
          title: task.title.trim().slice(0, 160),
          description: task.description?.trim() || null,
          priority: task.priority ?? "media",
          dueAt,
          assigneeId: task.assigneeId ?? null,
          leadId,
        });
      }
      if (!task.workflowPipelineId || task.addToCalendar) {
        await supabaseAdmin.from("tasks").insert({
          workspace_id: workspaceId,
          lead_id: leadId,
          title: task.title.trim().slice(0, 200),
          status: "pendente",
          kind: "tarefa",
          start_at: start.toISOString(),
          end_at: end.toISOString(),
        });
      }
    }
    return { reply, handoff };
  } catch (e) {
    return { reply: "", handoff: true, error: (e as Error).message };
  }
}


/**
 * Envia mídia (imagem/vídeo/áudio/documento) via Evolution.
 * `mediaPath` é o caminho no bucket `salesbot-media`. Gera signed URL de 1h
 * e passa como `media`/`audio` para a Evolution.
 */
async function sendWhatsappMedia(
  supabaseAdmin: AnySbStorage,
  workspaceId: string,
  phone: string,
  mediaPath: string,
  mediaKind: "image" | "video" | "audio" | "document",
  mimeType: string,
  fileName: string,
  caption: string,
  asVoice: boolean = false,
  sessionId?: string | null,
): Promise<{ ok: boolean; error?: string; messageId?: string | null; mediaUrl?: string }> {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) return { ok: false, error: "INTEGRATION_ENCRYPTION_KEY ausente" };
  const jidIdentity = whatsappIdentityFromJid(phone);
  const isGroupTarget = jidIdentity?.kind === "group";
  const digits = isGroupTarget
    ? ""
    : (jidIdentity?.kind === "direct" ? jidIdentity.digits : (phone ?? "").replace(/\D/g, ""));
  if (!isGroupTarget && digits.length < 8) return { ok: false, error: "Telefone inválido" };
  const target = isGroupTarget ? jidIdentity.remoteJid : digits;

  let sessionQuery = supabaseAdmin
    .from("whatsapp_web_sessions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider", "evolution")
    .eq("status", "conectado");
  if (sessionId) sessionQuery = sessionQuery.eq("id", sessionId);
  else sessionQuery = sessionQuery.order("last_connected_at", { ascending: false });
  const { data: sess } = await sessionQuery.maybeSingle();
  const sessId = (sess as { id?: string } | null)?.id;
  if (!sessId) return { ok: false, error: "Nenhuma sessão Evolution conectada" };

  const { data: creds } = await supabaseAdmin.rpc("get_evolution_credentials_service", {
    _session_id: sessId, _key: encKey,
  });
  const c = creds as { instance_name?: string; api_key?: string } | null;
  if (!c?.instance_name || !c.api_key) return { ok: false, error: "Credenciais Evolution indisponíveis" };

  const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base) return { ok: false, error: "EVOLUTION_BASE_URL não configurado" };

  // Signed URL válida por 1h para a Evolution baixar o arquivo.
  const signed = await supabaseAdmin.storage.from("salesbot-media").createSignedUrl(mediaPath, 60 * 60);
  const mediaUrl: string | undefined = signed?.data?.signedUrl;
  if (!mediaUrl) return { ok: false, error: "Falha ao gerar URL da mídia" };

  try {
    // Áudio só vai como mensagem de voz (PTT) quando o usuário marcou "enviar
    // como voz" (gravação pelo microfone, ou anexo convertido). Áudio anexado
    // "puro" segue como documento/anexo, sem virar PTT.
    const sendAsVoice = mediaKind === "audio" && asVoice === true;
    const url = sendAsVoice
      ? `${base}/message/sendWhatsAppAudio/${encodeURIComponent(c.instance_name)}`
      : `${base}/message/sendMedia/${encodeURIComponent(c.instance_name)}`;
    const body = sendAsVoice
      ? { number: target, audio: mediaUrl, encoding: true }
      : {
          number: target,
          mediatype: mediaKind === "audio" ? "document" : mediaKind, // image | video | document
          mimetype: mimeType,
          media: mediaUrl,
          fileName,
          caption: caption ?? "",
        };
    const resp = await guardedAutomationFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: c.api_key },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => "");
      return { ok: false, error: `Evolution ${resp.status}: ${bodyText.slice(0, 200)}` };
    }
    const j = await resp.json().catch(() => null) as { key?: { id?: string } } | null;
    return { ok: true, messageId: j?.key?.id ?? null, mediaUrl };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}


/**
 * Envia um indicador de presença (digitando / gravando áudio) via Evolution.
 * `durationMs` é quanto tempo manter o indicador ativo (Evolution retorna sozinho).
 * Erros são silenciosos, presença é "nice to have", nunca deve travar o fluxo.
 */
async function sendWhatsappPresence(
  supabaseAdmin: AnySb,
  workspaceId: string,
  phone: string,
  presence: "composing" | "recording" | "paused",
  durationMs: number,
  sessionId?: string | null,
): Promise<void> {
  try {
    const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!encKey) return;
    const jidIdentity = whatsappIdentityFromJid(phone);
    const isGroupTarget = jidIdentity?.kind === "group";
    const digits = isGroupTarget
      ? ""
      : (jidIdentity?.kind === "direct" ? jidIdentity.digits : (phone ?? "").replace(/\D/g, ""));
    if (!isGroupTarget && digits.length < 8) return;
    const target = isGroupTarget ? jidIdentity.remoteJid : digits;

    let sessionQuery = supabaseAdmin
      .from("whatsapp_web_sessions")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("provider", "evolution")
      .eq("status", "conectado");
    if (sessionId) sessionQuery = sessionQuery.eq("id", sessionId);
    else sessionQuery = sessionQuery.order("last_connected_at", { ascending: false });
    const { data: sess } = await sessionQuery.maybeSingle();
    const sessId = (sess as { id?: string } | null)?.id;
    if (!sessId) return;

    const { data: creds } = await supabaseAdmin.rpc("get_evolution_credentials_service", {
      _session_id: sessId, _key: encKey,
    });
    const c = creds as { instance_name?: string; api_key?: string } | null;
    if (!c?.instance_name || !c.api_key) return;

    const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
    if (!base) return;

    await guardedAutomationFetch(`${base}/chat/sendPresence/${encodeURIComponent(c.instance_name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: c.api_key },
      body: JSON.stringify({ number: target, presence, delay: Math.max(500, Math.min(20_000, durationMs)) }),
    }).catch(() => {});
  } catch { /* ignore */ }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}
async function sendWhatsappReaction(
  supabaseAdmin: AnySb,
  workspaceId: string,
  phone: string,
  emoji: string,
): Promise<{ ok: boolean; error?: string; messageId?: string | null }> {
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) return { ok: false, error: "INTEGRATION_ENCRYPTION_KEY ausente" };
  if (!emoji.trim()) return { ok: false, error: "Emoji vazio" };

  const jidIdentity = whatsappIdentityFromJid(phone);
  const isGroup = jidIdentity?.kind === "group";
  const digits = isGroup ? "" : (jidIdentity?.kind === "direct" ? jidIdentity.digits : (phone ?? "").replace(/\D/g, ""));
  if (!isGroup && digits.length < 8) return { ok: false, error: "Telefone inválido" };
  const expectedJid = isGroup ? jidIdentity.remoteJid : `${digits}@s.whatsapp.net`;

  // Identidade COMPLETA e sessão da própria mensagem; nunca busca por sufixo.
  let messageQuery = supabaseAdmin
    .from("whatsapp_web_messages")
    .select("message_id, remote_jid, to_jid, from_me, sender_phone, received_at, session_id")
    .eq("workspace_id", workspaceId);
  messageQuery = isGroup
    ? messageQuery.eq("remote_jid", expectedJid)
    : messageQuery.or(
        `sender_phone.eq.${digits},remote_jid.eq.${expectedJid},to_jid.eq.${expectedJid}`,
      );
  const { data: rows } = await messageQuery
    .order("received_at", { ascending: false })
    .limit(30);

  type Msg = {
    message_id?: string;
    remote_jid?: string;
    to_jid?: string;
    from_me?: boolean;
    session_id?: string | null;
  };
  const list = ((rows ?? []) as Msg[]).filter((m) => m.message_id);
  const target = list.find((m) => m.from_me === false) ?? list[0] ?? null;
  if (!target?.message_id) {
    return {
      ok: false,
      error: "Nenhuma mensagem nessa conversa para reagir (o lead precisa ter trocado ao menos 1 mensagem no WhatsApp Web)",
    };
  }
  if (!target.session_id) return { ok: false, error: "Mensagem WhatsApp sem sessão de origem." };

  const { data: sess } = await supabaseAdmin
    .from("whatsapp_web_sessions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider", "evolution")
    .eq("status", "conectado")
    .eq("id", target.session_id)
    .maybeSingle();
  const sessId = (sess as { id?: string } | null)?.id;
  if (!sessId) {
    return { ok: false, error: "A sessão WhatsApp desta conversa não está conectada." };
  }

  const remoteJid = target.remote_jid || target.to_jid || expectedJid;
  const fromMe = target.from_me === true;
  const { data: creds } = await supabaseAdmin.rpc("get_evolution_credentials_service", {
    _session_id: sessId,
    _key: encKey,
  });
  const credentials = creds as { instance_name?: string; api_key?: string } | null;
  if (!credentials?.instance_name || !credentials.api_key) {
    return { ok: false, error: "Credenciais Evolution indisponíveis" };
  }

  const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base) return { ok: false, error: "EVOLUTION_BASE_URL não configurado" };

  const key = { remoteJid, fromMe, id: target.message_id };
  const payloads: Array<Record<string, unknown>> = [
    { key, reaction: emoji },
    { reactionMessage: { key, text: emoji } },
  ];
  let lastError = "";
  for (const body of payloads) {
    try {
      const resp = await guardedAutomationFetch(
        `${base}/message/sendReaction/${encodeURIComponent(credentials.instance_name)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: credentials.api_key },
          body: JSON.stringify(body),
        },
      );
      if (resp.ok) {
        const json = await resp.json().catch(() => null) as { key?: { id?: string } } | null;
        return { ok: true, messageId: json?.key?.id ?? null };
      }
      const bodyText = await resp.text().catch(() => "");
      lastError = `Evolution ${resp.status}: ${bodyText.slice(0, 200)}`;
      if (resp.status >= 500) break;
    } catch (error) {
      lastError = (error as Error).message;
      break;
    }
  }
  return { ok: false, error: lastError || "Falha ao enviar reação" };
}

/** Executa a ação do bloco. Retorna se prosseguir. */
async function runAction(
  supabaseAdmin: AnySb,
  run: RunRow,
  lead: LeadRow,
  block: BlockRow,
): Promise<{ ok: boolean; message?: string }> {
  const cfg = block.config;
  const tipo = String(cfg.acaoTipo ?? "");
  const val = String(cfg.acaoConfig ?? "");
  switch (tipo) {
    case "enviar-privado": {
      const mensagem = interpolate(String(cfg.acaoConfig ?? ""), lead, run.variables).trim();
      if (!mensagem) return { ok: false, message: "mensagem privada vazia" };

      const phone = getSalesbotGroupParticipantPhone(run.variables);
      if (!phone) return { ok: false, message: "participante do grupo não identificado" };

      const groupRoute = await resolveRuntimeWhatsappTarget(
        supabaseAdmin,
        run.workspace_id,
        run.lead_id,
        lead.phone ?? "",
      );
      if (!groupRoute?.sessionId) {
        return { ok: false, message: "sessão WhatsApp do grupo não identificada" };
      }
      const result = await sendWhatsappText(
        supabaseAdmin,
        run.workspace_id,
        phone,
        mensagem,
        groupRoute.sessionId,
      );
      return result.ok
        ? { ok: true, message: "mensagem privada enviada" }
        : { ok: false, message: result.error ?? "falha ao enviar mensagem privada" };
    }
    case "notificar-admins": {
      const mensagem = interpolate(String(cfg.acaoConfig ?? ""), lead, run.variables).trim();
      if (!mensagem) return { ok: false, message: "mensagem para admins vazia" };

      const groupJid = getSalesbotGroupJid(lead.phone, run.variables);
      if (!groupJid) return { ok: false, message: "grupo não identificado" };

      const resolved = await resolveSalesbotGroupAdminPhones(
        supabaseAdmin,
        run.workspace_id,
        groupJid,
      );
      if (!resolved.ok) {
        return { ok: false, message: resolved.error ?? "nenhum admin identificado no grupo" };
      }

      let sent = 0;
      let failed = 0;
      let lastError = "";
      for (const phone of resolved.phones) {
        const result = await sendWhatsappText(
          supabaseAdmin,
          run.workspace_id,
          phone,
          mensagem,
          resolved.sessionId,
        );
        if (result.ok) sent += 1;
        else {
          failed += 1;
          lastError = result.error ?? lastError;
        }
      }

      if (!sent) return { ok: false, message: lastError || "falha ao notificar admins" };
      return {
        ok: true,
        message: `${sent} admin(s) notificado(s)${failed ? `; ${failed} falha(s)` : ""}`,
      };
    }
    case "enviar-email": {
      const to = String(lead.email ?? "").trim();
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return { ok: true, message: "email_missing: lead sem e-mail válido" };
      }

      const subject = interpolate(String(cfg.emailSubject ?? ""), lead, run.variables).trim();
      const body = interpolate(String(cfg.acaoConfig ?? ""), lead, run.variables).trim();
      if (!subject) return { ok: false, message: "email_failed: assunto vazio" };
      if (!body) return { ok: false, message: "email_failed: corpo vazio" };

      const escapeHtml = (value: string) => value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
      const html = escapeHtml(body).replace(/\r?\n/g, "<br>");

      try {
        const email = await import("./email-sender.server");
        const sent = await email.sendWorkspaceEmail(supabaseAdmin, run.workspace_id, {
          to,
          subject,
          html,
          text: body,
        });
        return {
          ok: true,
          message: `email_sent: ${to} via ${sent.mode}${sent.id ? ` (${sent.id})` : ""}`,
        };
      } catch (e) {
        return {
          ok: false,
          message: `email_failed: ${e instanceof Error ? e.message : "falha desconhecida no envio"}`,
        };
      }
    }
    case "nota": {
      await supabaseAdmin.from("lead_activities").insert({
        workspace_id: run.workspace_id,
        lead_id: lead.id,
        type: "note",
        payload: { text: val || "(nota via salesbot)", by: null, salesbot_run_id: run.id },
      });
      return { ok: true };
    }
    case "tags": {
      const incoming = val.split(",").map((s) => s.trim()).filter(Boolean);
      if (!incoming.length) return { ok: true, message: "sem tags" };

      const cur = Array.isArray(lead.tags) ? (lead.tags as string[]) : [];
      const mode = String(cfg.tagsModo ?? "adicionar") === "remover" ? "remover" : "adicionar";
      const incomingKeys = new Set(incoming.map((tag) => tag.toLocaleLowerCase()));

      let next: string[];
      let changed = 0;
      const addedTags: string[] = [];
      if (mode === "remover") {
        next = cur.filter((tag) => !incomingKeys.has(String(tag).toLocaleLowerCase()));
        changed = cur.length - next.length;
      } else {
        next = [...cur];
        const existing = new Set(cur.map((tag) => String(tag).toLocaleLowerCase()));
        for (const tag of incoming) {
          const key = tag.toLocaleLowerCase();
          if (existing.has(key)) continue;
          existing.add(key);
          next.push(tag);
          addedTags.push(tag);
          changed += 1;
        }
      }

      if (!changed) return { ok: true, message: mode === "remover" ? "nenhuma tag removida" : "tags já vinculadas" };
      const { error } = await supabaseAdmin.from("leads")
        .update({ tags: next, updated_at: new Date().toISOString() })
        .eq("id", lead.id).eq("workspace_id", run.workspace_id);
      if (error) return { ok: false, message: error.message };
      lead.tags = next;
      if (addedTags.length) {
        const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");
        await enqueueLeadAutomationEvent(supabaseAdmin as never, {
          leadId: lead.id, event: "tag-added", workspaceId: run.workspace_id, tags: addedTags,
        });
      }
      return { ok: true, message: `${mode === "remover" ? "-" : "+"}${changed} tag(s)` };
    }
    case "mudar-status-lead": {
      const stageId = String(cfg.destinoStageId ?? val ?? "");
      if (!stageId) return { ok: false, message: "stage vazio" };
      // Confere se a etapa existe no workspace e deriva o funil dela.
      const { data: stageRow } = await supabaseAdmin
        .from("pipeline_stages")
        .select("id, name, pipeline_id")
        .eq("id", stageId)
        .eq("workspace_id", run.workspace_id)
        .maybeSingle();
      const st = stageRow as { id: string; name?: string | null; pipeline_id?: string | null } | null;
      if (!st || !st.pipeline_id) return { ok: false, message: `etapa ${stageId} não existe neste workspace` };
      const requestedPipelineId = cfg.destinoPipelineId ? String(cfg.destinoPipelineId) : null;
      if (requestedPipelineId && requestedPipelineId !== st.pipeline_id) {
        return { ok: false, message: "etapa não pertence ao funil configurado" };
      }
      const pipelineId = st.pipeline_id;
      const patch: Record<string, unknown> = { stage_id: stageId, pipeline_id: pipelineId, updated_at: new Date().toISOString() };
      const { error } = await supabaseAdmin.from("leads")
        .update(patch).eq("id", lead.id).eq("workspace_id", run.workspace_id);
      if (error) return { ok: false, message: error.message };
      // Registra no histórico para o CRM refletir a movimentação.
      await supabaseAdmin.from("lead_activities").insert({
        workspace_id: run.workspace_id,
        lead_id: lead.id,
        type: "stage_change",
        payload: {
          from_stage_id: lead.stage_id ?? null,
          to_stage_id: stageId,
          to_stage_nome: String(cfg.destinoEtapa ?? st.name ?? ""),
          by: null,
          salesbot_run_id: run.id,
        },
      });
      const fromStageId = lead.stage_id ?? null;
      lead.stage_id = stageId;
      lead.pipeline_id = pipelineId;
      const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");
      await enqueueLeadAutomationEvent(supabaseAdmin as never, {
        leadId: lead.id, event: "moved", workspaceId: run.workspace_id,
        pipelineId, stageId, fromStageId,
      });
      return { ok: true, message: `lead movido para ${String(cfg.destinoEtapa ?? st.name ?? stageId)}` };
    }

    case "mudar-responsavel": {
      const userId = String(cfg.destinoResponsavelId ?? val ?? "");
      if (!userId) return { ok: false, message: "responsável vazio" };
      const { data: member } = await supabaseAdmin.from("workspace_members")
        .select("user_id").eq("workspace_id", run.workspace_id).eq("user_id", userId).maybeSingle();
      if (!member) return { ok: false, message: "responsável pertence a outro workspace" };
      const { error } = await supabaseAdmin.from("leads")
        .update({ responsible_id: userId, updated_at: new Date().toISOString() })
        .eq("id", lead.id).eq("workspace_id", run.workspace_id);
      if (error) return { ok: false, message: error.message };
      const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");
      await enqueueLeadAutomationEvent(supabaseAdmin as never, {
        leadId: lead.id, event: "assignee-changed", workspaceId: run.workspace_id,
      });
      return { ok: true };
    }
    case "definir-campo": {
      const fieldRef = String(cfg.campoId ?? "");
      if (!fieldRef) return { ok: false, message: "campo vazio" };

      const isBuiltin = (r: string) => r.startsWith("lead:") || r.startsWith("empresa:");
      const companyIdOf = async (): Promise<string | null> => {
        const { data } = await supabaseAdmin.from("leads")
          .select("company_id").eq("id", lead.id).eq("workspace_id", run.workspace_id).maybeSingle();
        return (data as { company_id?: string | null } | null)?.company_id ?? null;
      };
      const readRef = async (ref: string): Promise<string> => {
        if (ref.startsWith("lead:")) {
          const col = ref.slice(5);
          const { data } = await supabaseAdmin.from("leads").select(col).eq("id", lead.id).eq("workspace_id", run.workspace_id).maybeSingle();
          const v = (data as Record<string, unknown> | null)?.[col];
          return v == null ? "" : String(v);
        }
        if (ref.startsWith("empresa:")) {
          const col = ref.slice(8);
          const cid = await companyIdOf();
          if (!cid) return "";
          const { data } = await supabaseAdmin.from("companies").select(col).eq("id", cid).eq("workspace_id", run.workspace_id).maybeSingle();
          const v = (data as Record<string, unknown> | null)?.[col];
          return v == null ? "" : String(v);
        }
        const { data } = await supabaseAdmin.from("lead_custom_field_values")
          .select("value").eq("workspace_id", run.workspace_id).eq("lead_id", lead.id).eq("field_id", ref).maybeSingle();
        const raw = (data as { value?: { display?: string } } | null)?.value;
        return raw?.display ?? "";
      };

      const origem = String(cfg.campoOrigem ?? "manual");
      let value: string;
      if (origem === "mensagem") {
        value = String(run.variables.last_message ?? "");
      } else if (origem === "copiar" && cfg.campoOrigemRef) {
        value = await readRef(String(cfg.campoOrigemRef));
      } else {
        value = String(cfg.campoValor ?? val ?? "");
      }
      if (/\{\{\s*agora\s*\}\}/i.test(value)) {
        value = value.replace(/\{\{\s*agora\s*\}\}/gi, new Date().toISOString());
      }

      if (isBuiltin(fieldRef)) {
        const nowIso = new Date().toISOString();
        if (fieldRef.startsWith("lead:")) {
          const col = fieldRef.slice(5);
          const parsed = col === "value"
            ? Number(String(value).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) || 0
            : value;
          const { error } = await supabaseAdmin.from("leads")
            .update({ [col]: parsed, updated_at: nowIso })
            .eq("id", lead.id).eq("workspace_id", run.workspace_id);
          if (error) return { ok: false, message: error.message };
          const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");
          await enqueueLeadAutomationEvent(supabaseAdmin as never, {
            leadId: lead.id, event: "field-updated", workspaceId: run.workspace_id, fieldName: col,
          });
          return { ok: true };
        }
        const col = fieldRef.slice(8);
        const cid = await companyIdOf();
        if (!cid) return { ok: false, message: "lead sem empresa vinculada" };
        const { error } = await supabaseAdmin.from("companies")
          .update({ [col]: value, updated_at: nowIso })
          .eq("id", cid).eq("workspace_id", run.workspace_id);
        if (error) return { ok: false, message: error.message };
        return { ok: true };
      }

      const { data: field } = await supabaseAdmin.from("lead_custom_fields")
        .select("id, name").eq("id", fieldRef).eq("workspace_id", run.workspace_id).maybeSingle();
      if (!field) return { ok: false, message: "campo pertence a outro workspace" };
      const { data: priorValue, error: priorError } = await supabaseAdmin.from("lead_custom_field_values")
        .select("value").eq("workspace_id", run.workspace_id).eq("lead_id", lead.id).eq("field_id", fieldRef).maybeSingle();
      if (priorError) return { ok: false, message: "Não foi possível conferir o valor atual do campo." };
      if (customValueToText(priorValue?.value) === value) return { ok: true, message: "O campo já possui esse valor." };
      const { error } = await supabaseAdmin.from("lead_custom_field_values")
        .upsert({
          workspace_id: run.workspace_id,
          lead_id: lead.id,
          field_id: fieldRef,
          value: { display: value, raw: [value] },
          updated_at: new Date().toISOString(),
        }, { onConflict: "lead_id,field_id" });
      if (error) return { ok: false, message: error.message };
      const { enqueueLeadAutomationEvent } = await import("@/lib/stage-automation-engine.server");
      await enqueueLeadAutomationEvent(supabaseAdmin as never, {
        leadId: lead.id, event: "field-updated", workspaceId: run.workspace_id,
        fieldId: fieldRef, fieldName: (field as { name?: string }).name,
      });
      await dispatchCustomFieldChanged(supabaseAdmin, {
        workspaceId: run.workspace_id, leadId: lead.id, fieldId: fieldRef,
        fieldName: (field as { name?: string }).name, value,
      });

      return { ok: true };
    }

    case "webhook": {
      const automationId = String(cfg.webhookAutomationId ?? "").trim();
      const payload = {
        lead_id: lead.id,
        workspace_id: run.workspace_id,
        salesbot_id: run.salesbot_id,
        run_id: run.id,
        block_id: block.id,
        variables: run.variables,
      };
      let result: {
        ok: boolean; status: number | null; responseText: string; responseJson: unknown | null; error: string | null; attempts: number;
      };
      try {
        if (automationId) {
          const mod = await import("@/lib/salesbot-external-automation.server");
          result = await mod.executeConnectedSalesbotAutomation({
            supabaseAdmin,
            workspaceId: run.workspace_id,
            automationId,
            event: "salesbot.external_action",
            payload,
            timeoutMs: Number(cfg.webhookTimeoutMs ?? 15_000),
          });
        } else {
          const url = String(cfg.webhookUrl ?? val ?? "").trim();
          if (!url) return { ok: false, message: "webhook sem integração conectada e sem URL" };
          const mod = await import("@/lib/salesbot-webhook.server");
          result = await mod.executeSalesbotWebhook({
            url,
            method: String(cfg.webhookMethod ?? "POST").toUpperCase() as "POST" | "PUT" | "PATCH",
            secret: cfg.webhookSecret ? String(cfg.webhookSecret) : null,
            body: payload,
            timeoutMs: Number(cfg.webhookTimeoutMs ?? 15_000),
            retries: Number(cfg.webhookRetries ?? 0),
          });
        }
      } catch (error) {
        result = {
          ok: false,
          status: null,
          responseText: "",
          responseJson: null,
          error: error instanceof Error ? error.message : String(error),
          attempts: 0,
        };
      }

      const responseKeyRaw = String(cfg.webhookResponseVariable ?? "webhook_response").trim();
      const responseKey = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(responseKeyRaw)
        ? responseKeyRaw
        : "webhook_response";
      const responseValue = result.responseJson ?? result.responseText;
      const nextVariables: Record<string, unknown> = {
        ...(run.variables ?? {}),
        webhook_ok: result.ok,
        webhook_status: result.status ?? 0,
        webhook_error: result.error ?? "",
        [responseKey]: responseValue,
      };
      run.variables = nextVariables;
      await supabaseAdmin.from("salesbot_runs")
        .update({ variables: nextVariables })
        .eq("id", run.id)
        .eq("workspace_id", run.workspace_id);

      const detail = result.ok
        ? `HTTP ${result.status ?? 0}; resposta → {{${responseKey}}}`
        : result.error ?? `HTTP ${result.status ?? 0}`;
      return { ok: result.ok, message: detail };
    }
    case "tarefa": {
      const title = String(cfg.tarefaTitulo ?? val ?? "Tarefa via Salesbot").slice(0, 160);
      const kind = (String(cfg.tarefaKind ?? "tarefa") as "tarefa" | "reuniao" | "evento");
      const offsetMin = Math.max(0, Number(cfg.tarefaOffsetMin ?? 60));
      const durMin = Math.max(5, Number(cfg.tarefaDuracaoMin ?? 30));
      const start = new Date(Date.now() + offsetMin * 60_000);
      const end = new Date(start.getTime() + durMin * 60_000);

      // Se um fluxo de trabalho foi selecionado, cria a tarefa no Kanban.
      const wfPipeline = cfg.tarefaWorkflowPipelineId ? String(cfg.tarefaWorkflowPipelineId) : "";
      const alsoCalendar = wfPipeline ? cfg.tarefaTambemCalendario === true : true;
      let wfMsg = "";
      if (wfPipeline) {
        const { createWorkflowTaskAdmin } = await import("@/lib/workflow-task-create.server");
        const res = await createWorkflowTaskAdmin({
          workspaceId: run.workspace_id,
          pipelineId: wfPipeline,
          stageId: cfg.tarefaWorkflowStageId ? String(cfg.tarefaWorkflowStageId) : null,
          title,
          description: `Criada via Salesbot para o lead ${lead.id}`,
          priority: (cfg.tarefaWorkflowPriority as "baixa" | "media" | "alta" | "urgente" | undefined) ?? "media",
          dueAt: end.toISOString(),
          assigneeId: (cfg.tarefaWorkflowAssigneeId as string | undefined) ?? lead.responsible_id ?? null,
          tags: [`lead:${lead.id}`],
          createdBy: lead.responsible_id ?? null,
          leadId: lead.id,
        });
        if (!res.ok) return { ok: false, message: res.error };
        wfMsg = `tarefa no fluxo criada (${res.id})`;
        if (!alsoCalendar) return { ok: true, message: wfMsg };
      }

      const { error } = await supabaseAdmin.from("tasks").insert({
        workspace_id: run.workspace_id,
        created_by: lead.responsible_id ?? null,
        title,
        kind,
        status: "pendente",
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        lead_id: lead.id,
      });
      if (error) return { ok: false, message: wfMsg ? `${wfMsg}; calendário falhou: ${error.message}` : error.message };
      const calMsg = `tarefa criada p/ ${start.toISOString()}`;
      return { ok: true, message: wfMsg ? `${wfMsg} + ${calMsg}` : calMsg };
    }
    case "completar-tarefa": {
      // Marca como concluídas: (a) tarefas do calendário (tasks) do lead e
      // (b) tarefas do Fluxo de trabalho (workflow_tasks) vinculadas ao lead.
      const nowIso = new Date().toISOString();
      let calDone = 0;
      let wfDone = 0;

      const { data: pending, error: qErr } = await supabaseAdmin
        .from("tasks")
        .select("id")
        .eq("workspace_id", run.workspace_id)
        .eq("lead_id", lead.id)
        .eq("status", "pendente");
      if (qErr) return { ok: false, message: qErr.message };
      const ids = (pending as Array<{ id: string }> | null)?.map((t) => t.id) ?? [];
      if (ids.length) {
        const { error } = await supabaseAdmin.from("tasks")
          .update({ status: "concluida", updated_at: nowIso })
          .in("id", ids);
        if (error) return { ok: false, message: error.message };
        calDone = ids.length;
      }

      // Fluxo de trabalho: o vínculo com o lead fica na descrição ("[Lead: <id>]").
      const { data: wfRows } = await supabaseAdmin
        .from("workflow_tasks")
        .select("id, pipeline_id")
        .eq("workspace_id", run.workspace_id)
        .eq("status", "ativa")
        .eq("is_review_copy", false)
        .ilike("description", `%[Lead: ${lead.id}]%`);
      const wfList = (wfRows ?? []) as Array<{ id: string; pipeline_id: string }>;
      if (wfList.length) {
        const pipeIds = [...new Set(wfList.map((t) => t.pipeline_id))];
        const { data: doneStages } = await supabaseAdmin
          .from("workflow_stages")
          .select("id, pipeline_id")
          .in("pipeline_id", pipeIds)
          .eq("is_done_stage", true);
        const doneByPipe = new Map<string, string>();
        for (const s of (doneStages ?? []) as Array<{ id: string; pipeline_id: string }>) {
          if (!doneByPipe.has(s.pipeline_id)) doneByPipe.set(s.pipeline_id, s.id);
        }
        for (const t of wfList) {
          const patch: Record<string, unknown> = {
            status: "concluida",
            completed_at: nowIso,
            updated_at: nowIso,
          };
          const stageId = doneByPipe.get(t.pipeline_id);
          if (stageId) patch.stage_id = stageId;
          const { error } = await supabaseAdmin.from("workflow_tasks").update(patch).eq("id", t.id);
          if (!error) wfDone += 1;
        }
      }

      if (!calDone && !wfDone) return { ok: true, message: "nenhuma tarefa pendente" };
      const parts: string[] = [];
      if (calDone) parts.push(`${calDone} no calendário`);
      if (wfDone) parts.push(`${wfDone} no fluxo`);
      return { ok: true, message: `tarefas concluídas: ${parts.join(" + ")}` };
    }
    case "status-conversa": {
      const raw = String(cfg.acaoConfig ?? val ?? "").toLowerCase().trim();
      const allowed = ["aberta", "lida", "fechada"] as const;
      if (!allowed.includes(raw as typeof allowed[number])) {
        return { ok: false, message: "status inválido (use aberta/lida/fechada)" };
      }
      const { error } = await supabaseAdmin.from("leads")
        .update({ conversation_status: raw, updated_at: new Date().toISOString() })
        .eq("id", lead.id)
        .eq("workspace_id", run.workspace_id);
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: `status da conversa: ${raw}` };
    }
    case "formulario": {
      const listRaw = Array.isArray(cfg.formularios) ? (cfg.formularios as Array<{ id?: string }>) : [];
      const ids = (listRaw.map((x) => String(x?.id ?? "")).filter(Boolean).length
        ? listRaw.map((x) => String(x?.id ?? "")).filter(Boolean)
        : [String(cfg.formularioId ?? "")].filter(Boolean));
      if (!ids.length) return { ok: false, message: "formulário vazio" };
      const { data: formsData } = await supabaseAdmin.from("crm_forms")
        .select("id, slug, nome").in("id", ids).eq("workspace_id", run.workspace_id);
      const rows = (formsData ?? []) as Array<{ id: string; slug?: string; nome?: string }>;
      const origin = resolvePublicAppUrl();
      const found = ids
        .map((id) => rows.find((r) => r.id === id))
        .filter((r): r is { id: string; slug?: string; nome?: string } => Boolean(r?.slug));
      if (!found.length) return { ok: false, message: "formulário não encontrado" };
      const urls = found.map((f) => `${origin}/f/${encodeURIComponent(String(f.slug))}?leadId=${lead.id}`);
      const template = String(cfg.formularioMensagem ?? "Olá! Preencha por favor:").trim();
      // Legado: se o usuário ainda usa {{url}}, substitui pelo primeiro link.
      const base = template.replace(/\{\{\s*url\s*\}\}/g, urls[0] ?? "");
      const missing = urls.filter((u) => !base.includes(u));
      const text = [base, ...missing].filter(Boolean).join("\n\n");
      const r = await sendLeadWhatsappText(
        supabaseAdmin,
        run.workspace_id,
        run.lead_id,
        lead.phone ?? "",
        text,
      );
      const nomes = found.map((f) => f.nome ?? f.slug).join(", ");
      return r.ok ? { ok: true, message: `form ${nomes} enviado` } : { ok: false, message: r.error };
    }
    case "vincular-produto": {
      const config = block.config || {};
      const productId = (config.productId || config.acaoConfig) as string;
      const kind = (config.productKind || "interesse") as "interesse" | "comprou";
      const prodNome = (config.productNome || "produto") as string;
      
      if (!productId) {
        return { ok: false, message: "produto não selecionado" };
      }
      
      // Validação de isolamento do produto (Workspace Isolation)
      const { data: product } = await supabaseAdmin
        .from("products" as any)
        .select("id")
        .eq("id", productId)
        .eq("workspace_id", run.workspace_id)
        .maybeSingle();

      if (!product) {
        return { ok: false, message: "produto não encontrado ou pertence a outro workspace" };
      }
      
      const linkData = { 
        workspace_id: run.workspace_id, 
        lead_id: lead.id, 
        product_id: productId, 
        kind 
      };

      const { error } = await supabaseAdmin
        .from("lead_products" as any)
        .upsert(linkData, { onConflict: "lead_id,product_id,kind" });

      if (error) {
        console.error("Upsert lead_products error:", error);
        return { ok: false, message: error.message };
      }
      
      await supabaseAdmin.from("lead_activities").insert({
        workspace_id: run.workspace_id,
        lead_id: lead.id,
        type: "produto_vinculado",
        payload: {
          product_id: productId,
          product_nome: prodNome,
          kind,
          salesbot_run_id: run.id
        }
      });
      
      return { ok: true, message: `vinculado: ${prodNome} (${kind})` };
    }

    case "enviar-email": {
      return { ok: false, message: "envio de e-mail em breve (integração não conectada)" };
    }
    default:
      return { ok: false, message: `ação "${tipo}" ainda não implementada` };
  }
}

/** Avalia uma condição simples. */
async function evalCondition(supabaseAdmin: AnySb, run: RunRow, lead: LeadRow, block: BlockRow): Promise<boolean> {
  const conds = Array.isArray(block.config.condicoes) ? (block.config.condicoes as Array<Record<string, unknown>>) : [];
  if (!conds.length) return true;
  const modo = String(block.config.condicaoModo ?? "e");
  const results: boolean[] = [];
  for (const c of conds) {
    const sujeito = String(c.sujeito ?? "cliente");
    const operador = String(c.operador ?? "igual");
    const valor = String(c.valor ?? "");
    let atual = "";
    if (sujeito === "cliente" || sujeito === "comentario") {
      atual = String(run.variables.last_message ?? "");
    } else if (sujeito === "fonte-leads") {
      const found = await leadMatchesOrigin(supabaseAdmin, lead, valor);
      results.push(operador === "desigual" ? !found : found);
      continue;

    } else if (sujeito === "etapa") {
      atual = String(lead.stage_id ?? "");
    } else if (sujeito === "tag") {
      const tags = Array.isArray(lead.tags) ? (lead.tags as string[]) : [];
      const found = tags.some((t) => t.toLowerCase() === valor.toLowerCase());
      // Tag: reinterpreta operador
      results.push(operador === "desigual" ? !found : found);
      continue;
    } else if (sujeito === "campo-personalizado") {
      const fieldId = String(c.campo ?? "");
      if (fieldId) {
        const { data } = await supabaseAdmin.from("lead_custom_field_values")
          .select("value").eq("lead_id", lead.id).eq("field_id", fieldId).maybeSingle();
        atual = customValueToText((data as { value?: unknown } | null)?.value);

      }
    }
    const match =
      operador === "igual" ? atual === valor :
      operador === "desigual" ? atual !== valor :
      operador === "contem" ? atual.toLowerCase().includes(valor.toLowerCase()) :
      false;
    results.push(match);
  }
  return modo === "ou" ? results.some(Boolean) : results.every(Boolean);
}

/** Valida a última mensagem do lead. */
async function runValidation(supabaseAdmin: AnySb, run: RunRow, lead: LeadRow, block: BlockRow): Promise<boolean> {
  return evalValidacaoRegra(supabaseAdmin, run, lead, {
    alvo: String(block.config.validacaoAlvo ?? "mensagem"),
    campoId: String(block.config.validacaoCampoId ?? ""),
    tipo: String(block.config.validacaoTipo ?? ""),
    valor: String(block.config.validacaoValor ?? ""),
  });
}

/**
 * Resolve o ALVO da regra de validação (o que estamos validando) e aplica a
 * regra. O alvo é sempre algo que já existe no sistema: a resposta do cliente,
 * um dado do lead, um campo personalizado ou uma tag.
 */


/** Config de expediente lida do workspace. */
type BHDay = { enabled: boolean; start: string; end: string };
type BusinessHoursCfg = { timezone: string; days: BHDay[] };

const DEFAULT_BH_CFG: BusinessHoursCfg = {
  timezone: "America/Sao_Paulo",
  days: [
    { enabled: false, start: "09:00", end: "18:00" },
    { enabled: true,  start: "09:00", end: "18:00" },
    { enabled: true,  start: "09:00", end: "18:00" },
    { enabled: true,  start: "09:00", end: "18:00" },
    { enabled: true,  start: "09:00", end: "18:00" },
    { enabled: true,  start: "09:00", end: "18:00" },
    { enabled: false, start: "09:00", end: "13:00" },
  ],
};

function parseHM(s: string): number {
  const [h, m] = String(s || "0:0").split(":").map((n) => Number(n) || 0);
  return h * 60 + m;
}

/** Retorna { dayIdx (0=Dom..6=Sab), minutesOfDay } no fuso do workspace. */
function nowInTz(tz: string): { day: number; minutes: number; date: Date } {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: map[wd] ?? 1, minutes: hh * 60 + mm, date: d };
}

function isBusinessHoursNow(cfg: BusinessHoursCfg = DEFAULT_BH_CFG): boolean {
  const { day, minutes } = nowInTz(cfg.timezone);
  const d = cfg.days[day];
  if (!d || !d.enabled) return false;
  return minutes >= parseHM(d.start) && minutes < parseHM(d.end);
}

/** Próximo instante em que o expediente começa (ISO no UTC do JS). */
function nextBusinessHoursStart(cfg: BusinessHoursCfg = DEFAULT_BH_CFG): Date {
  const now = nowInTz(cfg.timezone);
  for (let i = 0; i < 8; i++) {
    const dayIdx = (now.day + i) % 7;
    const d = cfg.days[dayIdx];
    if (d?.enabled) {
      const startMin = parseHM(d.start);
      if (i === 0 && now.minutes < startMin) {
        return new Date(Date.now() + (startMin - now.minutes) * 60_000);
      }
      if (i > 0) {
        const minsUntilMidnight = 24 * 60 - now.minutes;
        const extraDays = i - 1;
        return new Date(Date.now() + (minsUntilMidnight + extraDays * 24 * 60 + startMin) * 60_000);
      }
    }
  }
  return new Date(Date.now() + 60 * 60_000);
}

/** Próximo instante em que o expediente termina. */
function nextBusinessHoursEnd(cfg: BusinessHoursCfg = DEFAULT_BH_CFG): Date {
  const now = nowInTz(cfg.timezone);
  
  // Tenta encontrar o fechamento no dia atual (se ainda não passou) ou nos próximos dias
  for (let i = 0; i < 8; i++) {
    const dayIdx = (now.day + i) % 7;
    const d = cfg.days[dayIdx];
    
    if (d?.enabled) {
      const endMin = parseHM(d.end);
      // Se for hoje (i=0) e ainda não fechou, ou se for um dia futuro
      if (i === 0 && now.minutes < endMin) {
        return new Date(Date.now() + (endMin - now.minutes) * 60_000);
      }
      if (i > 0) {
        const minsUntilMidnight = 24 * 60 - now.minutes;
        const extraDays = i - 1;
        return new Date(Date.now() + (minsUntilMidnight + extraDays * 24 * 60 + endMin) * 60_000);
      }
    }
  }
  
  // Fallback se nada configurado (raro)
  return new Date(Date.now() + 60 * 60_000);
}

function normalizeBusinessHours(input: any): BusinessHoursCfg {
  const src = input && typeof input === "object" ? input : {};
  const days = Array.isArray(src.days) && src.days.length === 7 ? src.days : DEFAULT_BH_CFG.days;
  return {
    timezone: typeof src.timezone === "string" && src.timezone ? src.timezone : DEFAULT_BH_CFG.timezone,
    days: days.map((d: any, i: number) => ({
      enabled: !!(d?.enabled ?? DEFAULT_BH_CFG.days[i].enabled),
      start: typeof d?.start === "string" ? d.start : DEFAULT_BH_CFG.days[i].start,
      end: typeof d?.end === "string" ? d.end : DEFAULT_BH_CFG.days[i].end,
    })),
  };
}




/**
 * Executa passos até bloqueio (timer / msg / finished / erro).
 * Guarda em salesbot_runs.status: running enquanto processa, muda ao fim.
 */
export async function executeRun(supabaseAdmin: AnySb, runInput: string | RunRow): Promise<void> {
  await withSalesbotGuard(supabaseAdmin, runInput, () => executeRunUnchecked(supabaseAdmin, runInput));
}
async function executeRunUnchecked(supabaseAdmin: AnySb, runInput: string | RunRow): Promise<void> {
  let run: RunRow | null = null;
  if (typeof runInput === "string") {
    const { data: runData } = await supabaseAdmin
      .from("salesbot_runs")
      .select("id, workspace_id, salesbot_id, lead_id, current_block_id, status, variables")
      .eq("id", runInput).maybeSingle();
    run = runData as RunRow | null;
  } else {
    run = runInput;
  }

  if (!run) return;
  if (run.status === "finished" || run.status === "error") return;

  const blocks = await loadBlocks(supabaseAdmin, run.salesbot_id);
  const lead = await loadLead(supabaseAdmin, run.lead_id, run.workspace_id);
  if (!lead) {
    await supabaseAdmin.from("salesbot_runs")
      .update({ status: "error", last_error: "Lead não encontrado", finished_at: new Date().toISOString() })
      .eq("id", run.id);
    return;
  }

  // Pré-carrega valores dos campos personalizados do lead para uso em {{campo:slug}}.
  const cfMap = await loadLeadCustomFieldMap(supabaseAdmin, run.workspace_id, lead.id);
  run.variables = { ...(run.variables ?? {}), ...cfMap };



  // Carrega horário de expediente do workspace
  const { data: wsRow } = await supabaseAdmin
    .from("workspaces").select("business_hours").eq("id", run.workspace_id).maybeSingle();
  const bhCfg = normalizeBusinessHours((wsRow as any)?.business_hours);

  // Bots de grupo: interação curta. Ao atingir o limite, o bot encerra sozinho.
  const { data: botMetaRow } = await supabaseAdmin
    .from("salesbots").select("scope, settings").eq("id", run.salesbot_id).maybeSingle();
  const botMeta = botMetaRow as { scope?: string | null; settings?: Record<string, unknown> | null } | null;
  const isGrupoBot = botMeta?.scope === "grupo";
  const maxInteracoesGrupo = isGrupoBot
    ? Math.max(0, Number(botMeta?.settings?.["maxInteracoes"] ?? 5) || 5)
    : 0;

  let current: BlockRow | null = run.current_block_id
    ? findBlockById(blocks, run.current_block_id)
    : findStartBlock(blocks);
  
  // DEBUG
  console.log(`[executeRun] current_block_id=${run.current_block_id}, found block:`, current?.id);

  if (!current) {
    await supabaseAdmin.from("salesbot_runs")
      .update({ status: "finished", finished_at: new Date().toISOString() })
      .eq("id", run.id);
    return;
  }

  let steps = 0;
  while (current && steps < MAX_STEPS_PER_TICK) {
    await assertAutomationMayContinue();
    steps++;
    const b: BlockRow = current;

    // Marca posição atual antes de executar (para retomada segura)
    await supabaseAdmin.from("salesbot_runs")
      .update({ current_block_id: b.id, status: "running" })
      .eq("id", run.id);

    let nextId: string | null | undefined = b.next_block_id;
    let advance = true;

    if (isGrupoBot && maxInteracoesGrupo > 0 && b.type === "enviar-mensagem") {
      const usadas = Number(run.variables?.grupo_interacoes ?? 0);
      if (usadas >= maxInteracoesGrupo) {
        await log(supabaseAdmin, run, b, "ok", `limite de ${maxInteracoesGrupo} interações no grupo atingido`);
        await supabaseAdmin.from("salesbot_runs")
          .update({ status: "finished", current_block_id: null, finished_at: new Date().toISOString() })
          .eq("id", run.id);
        return;
      }
      run.variables = { ...(run.variables ?? {}), grupo_interacoes: usadas + 1 };
      await supabaseAdmin.from("salesbot_runs")
        .update({ variables: run.variables })
        .eq("id", run.id);
    }

    try {
      switch (b.type) {
        case "enviar-mensagem": {
          const texto = interpolate(String(b.config.texto ?? ""), lead, run.variables);
          const textoDelayMs = Math.max(0, Math.min(20_000, Number(b.config.textoDelayMs ?? 0)));

          // Compat: se o bloco só tem o legado mediaPath, converte pra 1 item.
          const legacy = String(b.config.mediaPath ?? "").trim();
          const legacyKind = String(b.config.mediaKind ?? "").trim() as "image" | "video" | "audio" | "document" | "";
          const rawItems = Array.isArray(b.config.mediaItems) ? (b.config.mediaItems as any[]) : [];
          const items: Array<{ path: string; kind: "image"|"video"|"audio"|"document"; mime: string; filename: string; caption?: string; delayMs?: number; asVoice?: boolean }> =
            rawItems.length > 0
              ? rawItems.filter((it) => it && typeof it.path === "string" && it.kind)
              : (legacy && legacyKind
                  ? [{
                      path: legacy,
                      kind: legacyKind,
                      mime: String(b.config.mediaMime ?? "application/octet-stream"),
                      filename: String(b.config.mediaFilename ?? "arquivo"),
                      caption: texto, // legado usava texto como legenda
                    }]
                  : []);

          // Em bots de grupo o bloco pode responder no grupo (padrão) ou no
          // privado de quem entrou/falou (`destino: "privado"`).
          const leadPhone = lead.phone ?? "";
          const destinoPrivado =
            String(b.config.destino ?? "grupo") === "privado" && leadPhone.includes("@g.us");
          const privadoDigits = String(
            run.variables?.participante_telefone ?? run.variables?.membro_telefone ?? "",
          ).replace(/\D/g, "");
          const routeTarget = await resolveRuntimeWhatsappTarget(
            supabaseAdmin,
            run.workspace_id,
            run.lead_id,
            leadPhone,
          );
          if (!routeTarget) {
            await log(
              supabaseAdmin,
              run,
              b,
              "error",
              "Identidade WhatsApp ambígua: informe DDI explícito ou inicie a conversa por um JID real.",
            );
            break;
          }
          const phone = destinoPrivado && privadoDigits.length >= 8
            ? privadoDigits
            : routeTarget.phone;
          const routeSessionId = routeTarget.sessionId;

          const sentMsgIds: Array<string | null> = [];
          const sentMedia: Array<{ messageId: string; kind: "video" | "audio" }> = [];

          // 1) Texto (opcional), com ou sem botões de resposta rápida
          // WhatsApp não entrega botões interativos em grupos — ignora a config nesse caso.
          const useBotoes = Boolean(b.config.useBotoes) && !phone.includes("@g.us");
          const botoesCfg = Array.isArray(b.config.botoes) ? (b.config.botoes as Array<{ id?: string; label?: string; nextBlockId?: string; url?: string }>) : [];
          const botoes = botoesCfg
            .map((x) => ({
              id: String(x.id ?? "").trim(),
              label: interpolate(String(x.label ?? ""), lead, run.variables).trim(),
              nextBlockId: typeof x.nextBlockId === "string" && x.nextBlockId ? x.nextBlockId : null,
              url: typeof x.url === "string" && x.url.trim() ? x.url.trim() : undefined,
            }))
            .filter((x) => x.label.length > 0)
            .slice(0, 3);
          if (texto.trim() && !(rawItems.length === 0 && legacy && legacyKind)) {
            if (textoDelayMs > 0) {
              await sendWhatsappPresence(supabaseAdmin, run.workspace_id, phone, "composing", textoDelayMs, routeSessionId);
              await sleep(textoDelayMs);
            }
            const r = useBotoes && botoes.length > 0
              ? await sendWhatsappButtons(supabaseAdmin, run.workspace_id, phone, texto, botoes as any, undefined, routeSessionId)
              : await sendWhatsappText(supabaseAdmin, run.workspace_id, phone, texto, routeSessionId);
            if (r.ok) sentMsgIds.push(r.messageId ?? null);
            else { await log(supabaseAdmin, run, b, "error", r.error); throw new Error(r.error ?? "Falha no envio da mensagem."); }
          }

          // 2) Anexos em sequência
          for (const it of items) {
            const delay = Math.max(0, Math.min(20_000, Number(it.delayMs ?? 0)));
            const isVoice = it.kind === "audio" && it.asVoice === true;
            if (delay > 0) {
              const presence = isVoice ? "recording" : "composing";
              await sendWhatsappPresence(supabaseAdmin, run.workspace_id, phone, presence, delay, routeSessionId);
              await sleep(delay);
            }
            const captionInterp = it.caption ? interpolate(String(it.caption), lead, run.variables) : "";
            const r = await sendWhatsappMedia(
              supabaseAdmin as AnySbStorage,
              run.workspace_id,
              phone,
              it.path,
              it.kind,
              it.mime || "application/octet-stream",
              it.filename || "arquivo",
              captionInterp,
              isVoice,
              routeSessionId,
            );
            if (r.ok) {
              sentMsgIds.push(r.messageId ?? null);
              if (r.messageId && (it.kind === "video" || it.kind === "audio")) {
                sentMedia.push({ messageId: r.messageId, kind: it.kind });
              }
            }
            else { await log(supabaseAdmin, run, b, "error", r.error); throw new Error(r.error ?? "Falha no envio da mensagem."); }
          }

          if (sentMsgIds.length > 0) {
            if (sentMedia.length > 0) {
              const nextVars = { ...run.variables, salesbot_last_sent_media: sentMedia };
              run.variables = nextVars;
              await supabaseAdmin.from("salesbot_runs").update({ variables: nextVars }).eq("id", run.id);
            }
            await log(supabaseAdmin, run, b, "ok",
              `${sentMsgIds.length} mensagem(ns) enviada(s)`,
              { messageIds: sentMsgIds });
          } else if (!texto.trim() && items.length === 0) {
            await log(supabaseAdmin, run, b, "skipped", "bloco vazio");
          }

          // Botões com caminho próprio: o bot para aqui e espera o clique do lead
          // pra seguir pelo cabo do botão escolhido (senão segue o cabo padrão).
          if (useBotoes && botoes.some((x) => !x.url && x.nextBlockId)) {
            const waitBranch = {
              blockId: b.id,
              waitingEvents: [{
                type: "botao-clicado",
                nextBlockId: b.next_block_id,
                options: botoes.map((x) => ({ id: x.id, label: x.label, nextBlockId: x.nextBlockId })),
              }] satisfies WaitingSalesbotEvent[],
            };
            await supabaseAdmin.from("salesbot_runs")
              .update({
                status: "waiting_message",
                waiting_until: null,
                current_block_id: b.id,
                variables: { ...run.variables, salesbot_waiting_branch: waitBranch },
              })
              .eq("id", run.id);
            await log(supabaseAdmin, run, b, "wait", "aguardando o lead escolher um botão");
            return;
          }
          break;
        }
        case "reacao": {
          const emoji = String(b.config.texto ?? "").trim();
          if (!emoji) {
            await log(supabaseAdmin, run, b, "skipped", "emoji não definido");
            break;
          }
          const reactionTarget = await resolveRuntimeWhatsappTarget(
            supabaseAdmin,
            run.workspace_id,
            run.lead_id,
            lead.phone ?? "",
          );
          if (!reactionTarget) {
            await log(supabaseAdmin, run, b, "error", "Identidade WhatsApp ambígua para reação.");
            break;
          }
          const r = await sendWhatsappReaction(supabaseAdmin, run.workspace_id, reactionTarget.phone, emoji);
          if (r.ok) {
            await log(supabaseAdmin, run, b, "ok", "reação enviada", { messageId: r.messageId, emoji });
          } else {
            await log(supabaseAdmin, run, b, "error", r.error);
          }
          break;
        }
        case "comentario": {
          // Auto-reply em comentário/menção da página (Facebook/Instagram).
          // Requer que a run tenha sido iniciada por um gatilho social- e portanto
          // carrega comment_id + page_id nas variáveis.
          const variants: string[] = Array.isArray(b.config.comentarios)
            ? (b.config.comentarios as unknown[]).map((x) => String(x).trim()).filter(Boolean)
            : [String(b.config.texto ?? "").trim()].filter(Boolean);
          const commentId = String(run.variables?.comment_id ?? "").trim();
          const pageId = String(run.variables?.page_id ?? "").trim();
          if (!variants.length) {
            await log(supabaseAdmin, run, b, "skipped", "nenhum texto de resposta configurado");
            break;
          }
          if (!commentId || !pageId) {
            await log(supabaseAdmin, run, b, "skipped", "sem comment_id/page_id (fora de gatilho social)");
            break;
          }
          // Round-robin: escolhe variante via variável interna
          const roundKey = `_rr_comment_${b.id}`;
          const idx = Number(run.variables?.[roundKey] ?? 0) % variants.length;
          const message = interpolate(variants[idx], lead, run.variables);
          const encKey = process.env.INTEGRATION_ENCRYPTION_KEY ?? "";
          try {
            const { data: tok } = await supabaseAdmin.rpc("get_meta_page_token", {
              _workspace_id: run.workspace_id, _page_id: pageId, _key: encKey,
            });
            const pageToken = tok as string | null;
            if (!pageToken) throw new Error("token da página indisponível");
            const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(commentId)}/comments`;
            const r = await guardedAutomationFetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ message, access_token: pageToken }).toString(),
            });
            const j = await r.json().catch(() => ({})) as { id?: string; error?: { message?: string } };
            if (!r.ok || j.error) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
            await supabaseAdmin.from("salesbot_runs").update({
              variables: { ...(run.variables ?? {}), [roundKey]: idx + 1 },
            }).eq("id", run.id);
            await log(supabaseAdmin, run, b, "ok", "resposta ao comentário enviada", { comment_id: commentId, reply_id: j.id ?? null, variant: idx });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await log(supabaseAdmin, run, b, "error", `falha ao responder comentário: ${msg}`);
          }
          break;
        }
        case "enviar-dm": {
          // Envia mensagem no privado (Direct/Messenger) de quem comentou.
          // - Facebook: POST /{comment_id}/private_replies com { message } (janela de 7 dias após o comentário)
          // - Instagram: POST /{ig_user_id}/messages com { recipient: { comment_id }, message: { text } }
          //   (requer permissão instagram_manage_messages)
          const texto = interpolate(String(b.config.texto ?? ""), lead, run.variables).trim();
          const commentId = String(run.variables?.comment_id ?? "").trim();
          const pageId = String(run.variables?.page_id ?? "").trim();
          const igUserId = String(run.variables?.ig_user_id ?? "").trim();
          if (!texto) {
            await log(supabaseAdmin, run, b, "skipped", "texto da DM não configurado");
            break;
          }
          if (!commentId || !pageId) {
            await log(supabaseAdmin, run, b, "skipped", "sem comment_id/page_id (fora de gatilho social)");
            break;
          }
          try {
            const encKey = process.env.INTEGRATION_ENCRYPTION_KEY ?? "";
            const { data: tok } = await supabaseAdmin.rpc("get_meta_page_token", {
              _workspace_id: run.workspace_id, _page_id: pageId, _key: encKey,
            });
            const pageToken = tok as string | null;
            if (!pageToken) throw new Error("token da página indisponível");
            let url: string;
            let body: string;
            let headers: Record<string, string>;
            if (igUserId) {
              url = `https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}/messages`;
              headers = { "Content-Type": "application/json" };
              body = JSON.stringify({
                recipient: { comment_id: commentId },
                message: { text: texto },
                access_token: pageToken,
              });
            } else {
              url = `https://graph.facebook.com/v21.0/${encodeURIComponent(commentId)}/private_replies`;
              headers = { "Content-Type": "application/x-www-form-urlencoded" };
              body = new URLSearchParams({ message: texto, access_token: pageToken }).toString();
            }
            const r = await guardedAutomationFetch(url, { method: "POST", headers, body });
            const j = await r.json().catch(() => ({})) as { id?: string; message_id?: string; error?: { message?: string } };
            if (!r.ok || j.error) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
            await log(supabaseAdmin, run, b, "ok", "DM enviada", { comment_id: commentId, message_id: j.message_id ?? j.id ?? null });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await log(supabaseAdmin, run, b, "error", `falha ao enviar DM: ${msg}`);
          }
          break;
        }
        case "msg-interna": {
          const texto = interpolate(String(b.config.texto ?? ""), lead, run.variables);
          const corpo = texto || "(mensagem interna)";
          const { error: noteError } = await supabaseAdmin.from("lead_activities").insert({
            workspace_id: run.workspace_id,
            lead_id: lead.id,
            type: "note",
            payload: { text: corpo, by: null, salesbot_run_id: run.id, internal: true },
          });
          if (noteError) throw new Error("Não foi possível gravar a mensagem interna no histórico do lead.");

          // Alerta do sistema no Chat da equipe, para quem foi escolhido no bloco
          try {
            const destinoTipo = String(b.config.msgInternaDestinoTipo ?? "usuario");
            const destinoId = b.config.msgInternaDestinoId
              ? String(b.config.msgInternaDestinoId)
              : null;
            const rows: Array<Record<string, unknown>> = [];
            const base = {
              workspace_id: run.workspace_id,
              from_user_id: null,
              body: corpo,
              origin: "salesbot",
            };

            if (destinoTipo === "setor" && destinoId) {
              const { data: sector, error: sectorError } = await supabaseAdmin.from("workflow_sectors")
                .select("id").eq("id", destinoId).eq("workspace_id", run.workspace_id).maybeSingle();
              if (sectorError || !sector) throw new Error("Setor não encontrado nesta empresa.");
              rows.push({ ...base, sector_id: destinoId, to_user_id: null });
              const { data: membros } = await supabaseAdmin
                .from("workflow_sector_members")
                .select("user_id")
                .eq("sector_id", destinoId);
              for (const m of (membros ?? []) as Array<{ user_id: string }>) {
                rows.push({ ...base, sector_id: null, to_user_id: m.user_id });
              }
            } else if (destinoTipo === "admins") {
              const { data: ws } = await supabaseAdmin
                .from("workspaces")
                .select("owner_id")
                .eq("id", run.workspace_id)
                .maybeSingle();
              const { data: admins } = await supabaseAdmin
                .from("workspace_members")
                .select("user_id, role, role_type")
                .eq("workspace_id", run.workspace_id);
              const ids = new Set<string>();
              const ownerId = (ws as { owner_id?: string } | null)?.owner_id;
              if (ownerId) ids.add(ownerId);
              for (const m of (admins ?? []) as Array<{
                user_id: string;
                role: string | null;
                role_type: string | null;
              }>) {
                if (m.role === "admin" || m.role === "owner" || m.role_type === "admin" || m.role_type === "owner") {
                  ids.add(m.user_id);
                }
              }
              for (const id of ids) rows.push({ ...base, sector_id: null, to_user_id: id });
            } else if (destinoId) {
              const { data: member, error: memberError } = await supabaseAdmin.from("workspace_members")
                .select("user_id").eq("workspace_id", run.workspace_id).eq("user_id", destinoId).maybeSingle();
              if (memberError || !member) throw new Error("Destinatário não encontrado nesta empresa.");
              rows.push({ ...base, sector_id: null, to_user_id: destinoId });
            }

            if (rows.length > 0) {
              const { error: deliveryError } = await supabaseAdmin.from("team_messages").insert(rows);
              if (deliveryError) throw new Error("Não foi possível entregar o alerta ao Chat da equipe.");
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await log(supabaseAdmin, run, b, "error", `alerta interno não entregue: ${msg}`);
            break;
          }

          await log(supabaseAdmin, run, b, "ok");
          break;
        }
        case "pausar": {
          const pausas = Array.isArray(b.config.pausas)
            ? (b.config.pausas as Array<Record<string, unknown>>)
            : [];

          if (pausas.length > 0) {
            let timerUntil: string | null = null;
            let timerAtMs: number | null = null;
            let timerNextBlockId: string | null = null;
            const waitingEvents: WaitingSalesbotEvent[] = [];
            let resolvedByPausa = false;
            const setTimerCandidate = (date: Date, branchNext: string | null | undefined) => {
              const at = date.getTime();
              if (timerAtMs === null || at < timerAtMs) {
                timerAtMs = at;
                timerUntil = date.toISOString();
                timerNextBlockId = branchNext ?? null;
              }
            };

            for (const p of pausas) {
              const tipo = String(p.tipo ?? "cronometro");
              const branchNext = typeof p.nextBlockId === "string" ? p.nextBlockId : b.next_block_id;

              if (tipo === "cronometro") {
                const ms = computePausaCronometroMs(p);
                setTimerCandidate(new Date(Date.now() + Math.max(ms, 1000)), branchNext);
                continue;
              }

              if (tipo === "lote-msgs") {
                const qtd = Math.max(2, Math.min(200, Number(p.qtdMensagens ?? 3) || 3));
                waitingEvents.push({ type: "lote-msgs", nextBlockId: branchNext ?? null, remaining: qtd });
                continue;
              }



              if (tipo === "msg-recebida" || tipo === "video-aberto" || tipo === "video-fechado" || tipo === "audio-aberto" || tipo === "audio-fechado") {
                const mediaKind = tipo.startsWith("video") ? "video" : tipo.startsWith("audio") ? "audio" : null;
                const lastMedia = mediaKind === null
                  ? undefined
                  : findLatestSentMedia(run.variables.salesbot_last_sent_media, mediaKind);
                if (mediaKind && !lastMedia?.messageId) throw new Error("Envie a mídia neste fluxo antes de aguardar a confirmação do WhatsApp.");
                waitingEvents.push({
                  type: tipo,
                  nextBlockId: branchNext ?? null,
                  messageId: typeof lastMedia?.messageId === "string" ? lastMedia.messageId : null,
                });
                continue;
              }

              if (tipo === "exceto-expediente" || tipo === "exceto-fora-expediente") {
                const inHours = isBusinessHoursNow(bhCfg);
                const mayRunNow = (tipo === "exceto-expediente" && !inHours) || (tipo === "exceto-fora-expediente" && inHours);
                if (mayRunNow) {
                  nextId = branchNext;
                  resolvedByPausa = true;
                  await log(supabaseAdmin, run, b, "ok", `pausa resolveu (${tipo})`, { branchNextBlockId: branchNext });
                  break;
                }
                setTimerCandidate(
                  tipo === "exceto-expediente" ? nextBusinessHoursEnd(bhCfg) : nextBusinessHoursStart(bhCfg),
                  branchNext,
                );
                continue;
              }

              if (tipo === "ate-expediente") {
                if (isBusinessHoursNow(bhCfg)) {
                  nextId = branchNext;
                  resolvedByPausa = true;
                  await log(supabaseAdmin, run, b, "ok", "pausa resolveu (já está no expediente)", { branchNextBlockId: branchNext });
                  break;
                }
                setTimerCandidate(nextBusinessHoursStart(bhCfg), branchNext);
                continue;
              }

              if (tipo === "ate-fora-expediente") {
                if (!isBusinessHoursNow(bhCfg)) {
                  nextId = branchNext;
                  resolvedByPausa = true;
                  await log(supabaseAdmin, run, b, "ok", "pausa resolveu (já está fora do expediente)", { branchNextBlockId: branchNext });
                  break;
                }
                setTimerCandidate(nextBusinessHoursEnd(bhCfg), branchNext);
                continue;
              }

              if (tipo === "formulario-enviado") {
                waitingEvents.push({
                  type: "formulario-enviado",
                  nextBlockId: branchNext ?? null,
                  formularioId: typeof p.formularioId === "string" ? p.formularioId : undefined,
                });
                continue;
              }
            }

            if (resolvedByPausa) break;

            const waitBranch = { blockId: b.id, timerNextBlockId, waitingEvents };
            if (waitingEvents.length > 0 && timerUntil) {
              await supabaseAdmin.from("salesbot_runs")
                .update({ status: "waiting_message", waiting_until: timerUntil, current_block_id: b.id, variables: { ...run.variables, salesbot_waiting_branch: waitBranch } })
                .eq("id", run.id);
              await log(supabaseAdmin, run, b, "wait", `aguardando resposta ou cronômetro (${timerUntil})`, waitBranch);
              return;
            }
            if (waitingEvents.length > 0) {
              await supabaseAdmin.from("salesbot_runs")
                .update({ status: "waiting_message", waiting_until: null, current_block_id: b.id, variables: { ...run.variables, salesbot_waiting_branch: waitBranch } })
                .eq("id", run.id);
              await log(supabaseAdmin, run, b, "wait", `aguardando ${waitingEvents.map((event) => event.type).join(" ou ")}`, waitBranch);
              return;
            }
            if (timerUntil) {
              // Pausas curtas (<= 25s) rodam inline: o cron só roda a cada minuto,
              // então segundos precisam ser respeitados dentro da própria execução.
              const remaining = (timerAtMs ?? 0) - Date.now();
              if (remaining <= SHORT_PAUSE_MAX_MS) {
                const nextAfterTimer = timerNextBlockId ?? b.next_block_id;
                const waitingVariables = { ...run.variables, salesbot_waiting_branch: waitBranch };
                const resumeVariables: Record<string, unknown> = { ...run.variables };
                delete resumeVariables.salesbot_waiting_branch;
                const resumedInline = await waitForDurableSalesbotTimer(supabaseAdmin, {
                  runId: run.id,
                  workspaceId: run.workspace_id,
                  currentBlockId: b.id,
                  nextBlockId: nextAfterTimer,
                  waitingUntil: timerUntil,
                  waitMs: Math.max(0, remaining),
                  waitingVariables,
                  resumeVariables,
                });
                if (!resumedInline) return;
                nextId = nextAfterTimer;
                await log(supabaseAdmin, run, b, "ok", `pausa curta concluída (${Math.round(Math.max(0, remaining) / 1000)}s)`, waitBranch);
                break;
              }
              await supabaseAdmin.from("salesbot_runs")
                .update({ status: "waiting_timer", waiting_until: timerUntil, current_block_id: b.id, variables: { ...run.variables, salesbot_waiting_branch: waitBranch } })
                .eq("id", run.id);
              await log(supabaseAdmin, run, b, "wait", `aguardando até ${timerUntil}`, waitBranch);
              return;
            }
          }

          const tipo = String(b.config.pausaTipo ?? "cronometro");
          if (tipo === "cronometro") {
            const ms = Math.max(computeCronometroMs(b.config), 1000);
            if (ms <= SHORT_PAUSE_MAX_MS) {
              const until = new Date(Date.now() + ms).toISOString();
              const resumedInline = await waitForDurableSalesbotTimer(supabaseAdmin, {
                runId: run.id,
                workspaceId: run.workspace_id,
                currentBlockId: b.id,
                nextBlockId: b.next_block_id,
                waitingUntil: until,
                waitMs: ms,
                waitingVariables: { ...run.variables },
                resumeVariables: { ...run.variables },
              });
              if (!resumedInline) return;
              await log(supabaseAdmin, run, b, "ok", `pausa curta concluída (${Math.round(ms / 1000)}s)`);
              break;
            }
            const until = new Date(Date.now() + ms).toISOString();
            await supabaseAdmin.from("salesbot_runs")
              .update({ status: "waiting_timer", waiting_until: until, current_block_id: b.id })
              .eq("id", run.id);
            await log(supabaseAdmin, run, b, "wait", `aguardando até ${until}`);
            return;
          }
          if (tipo === "lote-msgs") {
            const qtd = Math.max(2, Math.min(200, Number(b.config.pausaQtdMensagens ?? 3) || 3));
            const waitBranch = {
              blockId: b.id,
              waitingEvents: [{ type: "lote-msgs", nextBlockId: b.next_block_id, remaining: qtd }] satisfies WaitingSalesbotEvent[],
            };
            await supabaseAdmin.from("salesbot_runs")
              .update({ status: "waiting_message", waiting_until: null, current_block_id: b.id, variables: { ...run.variables, salesbot_waiting_branch: waitBranch } })
              .eq("id", run.id);
            await log(supabaseAdmin, run, b, "wait", `aguardando lote de ${qtd} mensagens do grupo`);
            return;
          }
          if (tipo === "msg-recebida") {
            const waitBranch = {
              blockId: b.id,
              waitingEvents: [{ type: "msg-recebida", nextBlockId: b.next_block_id }] satisfies WaitingSalesbotEvent[],
            };
            await supabaseAdmin.from("salesbot_runs")
              .update({ status: "waiting_message", waiting_until: null, current_block_id: b.id, variables: { ...run.variables, salesbot_waiting_branch: waitBranch } })
              .eq("id", run.id);
            await log(supabaseAdmin, run, b, "wait", "aguardando resposta do lead");
            return;
          }
          if (tipo === "exceto-expediente" || tipo === "exceto-fora-expediente") {
            const inHours = isBusinessHoursNow(bhCfg);
            const mayRunNow = (tipo === "exceto-expediente" && !inHours) || (tipo === "exceto-fora-expediente" && inHours);
            if (mayRunNow) {
              await log(supabaseAdmin, run, b, "ok", `fora da exceção (${tipo})`);
              break;
            }
            const until = (tipo === "exceto-expediente" ? nextBusinessHoursEnd(bhCfg) : nextBusinessHoursStart(bhCfg)).toISOString();
            await supabaseAdmin.from("salesbot_runs")
              .update({ status: "waiting_timer", waiting_until: until, current_block_id: b.id })
              .eq("id", run.id);
            await log(supabaseAdmin, run, b, "wait", `aguardando fim da exceção (${until})`);
            return;
          }
          if (tipo === "ate-expediente") {
            if (isBusinessHoursNow(bhCfg)) {
              await log(supabaseAdmin, run, b, "ok", "já está no expediente");
              break;
            }
            const until = nextBusinessHoursStart(bhCfg).toISOString();
            await supabaseAdmin.from("salesbot_runs")
              .update({ status: "waiting_timer", waiting_until: until, current_block_id: b.id })
              .eq("id", run.id);
            await log(supabaseAdmin, run, b, "wait", `aguardando início do expediente (${until})`);
            return;
          }
          if (tipo === "formulario-enviado") {
            const waitBranch = {
              blockId: b.id,
              waitingEvents: [{
                type: "formulario-enviado",
                nextBlockId: b.next_block_id,
                formularioId: typeof b.config.pausaFormularioId === "string" ? b.config.pausaFormularioId : undefined
              }] satisfies WaitingSalesbotEvent[],
            };
            await supabaseAdmin.from("salesbot_runs")
              .update({ status: "waiting_message", waiting_until: null, current_block_id: b.id, variables: { ...run.variables, salesbot_waiting_branch: waitBranch } })
              .eq("id", run.id);
            await log(supabaseAdmin, run, b, "wait", `aguardando envio do formulário ${b.config.pausaFormularioNome ?? b.config.pausaFormularioId ?? ""}`);
            return;
          }
          if (tipo === "ate-fora-expediente") {
            if (!isBusinessHoursNow(bhCfg)) {
              await log(supabaseAdmin, run, b, "ok", "já está fora do expediente");
              break;
            }
            const until = nextBusinessHoursEnd(bhCfg).toISOString();
            await supabaseAdmin.from("salesbot_runs")
              .update({ status: "waiting_timer", waiting_until: until, current_block_id: b.id })
              .eq("id", run.id);
            await log(supabaseAdmin, run, b, "wait", `aguardando fim do expediente (${until})`);
            return;
          }
          if (tipo === "video-aberto" || tipo === "video-fechado" || tipo === "audio-aberto" || tipo === "audio-fechado") {
            const mediaKind = tipo.startsWith("video") ? "video" : "audio";
            const lastMedia = findLatestSentMedia(run.variables.salesbot_last_sent_media, mediaKind);
            if (!lastMedia?.messageId) throw new Error("Envie a mídia neste fluxo antes de aguardar a confirmação do WhatsApp.");
            const waitBranch = {
              blockId: b.id,
              waitingEvents: [{
                type: tipo,
                nextBlockId: b.next_block_id,
                messageId: typeof lastMedia?.messageId === "string" ? lastMedia.messageId : null,
              }] satisfies WaitingSalesbotEvent[],
            };
            await supabaseAdmin.from("salesbot_runs")
              .update({ status: "waiting_message", waiting_until: null, current_block_id: b.id, variables: { ...run.variables, salesbot_waiting_branch: waitBranch } })
              .eq("id", run.id);
            await log(supabaseAdmin, run, b, "wait", `aguardando evento de mídia (${tipo})`, waitBranch);
            return;
          }
          await log(supabaseAdmin, run, b, "skipped", `pausa "${tipo}" ainda não implementada`);
          break;
        }

        case "condicao": {
          const conds = Array.isArray(b.config.condicoes)
            ? (b.config.condicoes as Array<Record<string, unknown>>)
            : [];
          const modoOu = String(b.config.condicaoModo ?? "e") === "ou";
          const falseNext = (b.config.falseNextBlockId as string | undefined) ?? null;
          if (modoOu) {
            // Cada condição tem seu próprio caminho: a primeira que bater define a saída.
            let matched: Record<string, unknown> | null = null;
            for (const c of conds) {
              const single = { ...b, config: { ...b.config, condicoes: [c], condicaoModo: "e" } } as BlockRow;
              if (await evalCondition(supabaseAdmin, run, lead, single)) { matched = c; break; }
            }
            if (matched) {
              nextId = (matched.nextBlockId as string | undefined) ?? nextId ?? null;
              await log(supabaseAdmin, run, b, "ok", "condição bateu", { branch: String(matched.id ?? "") });
            } else {
              nextId = falseNext;
              await log(supabaseAdmin, run, b, "ok", "nenhuma condição bateu", { branch: "false" });
            }
            break;
          }
          const passed = await evalCondition(supabaseAdmin, run, lead, b);
          if (!passed) {
            nextId = falseNext;
            await log(supabaseAdmin, run, b, "ok", "condição falhou", { branch: "false" });
          } else {
            await log(supabaseAdmin, run, b, "ok", "condição bateu", { branch: "true" });
          }
          break;
        }
        case "validacao": {
          const regras = Array.isArray(b.config.roleta)
            ? (b.config.roleta as Array<{
                id: string; label?: string; nextBlockId?: string;
                alvo?: string; campoId?: string; tipo?: string; valor?: string;
              }>)
            : [];
          if (regras.length > 0) {
            let matched: (typeof regras)[number] | null = null;
            for (const r of regras) {
              if (await evalValidacaoRegra(supabaseAdmin, run, lead, r)) { matched = r; break; }
            }
            if (matched) {
              nextId = matched.nextBlockId ?? null;
              await log(supabaseAdmin, run, b, "ok", `validação bateu em "${matched.label ?? matched.id}"`, { matchedRuleId: matched.id });
            } else {
              // "senão" = nextBlockId do bloco (default)
              await log(supabaseAdmin, run, b, "ok", "nenhuma regra bateu, saída 'senão'");
            }
          } else {
            // Legado: validacaoTipo/valor single-rule
            const passed = await runValidation(supabaseAdmin, run, lead, b);
            if (!passed) {
              const falseNext = (b.config.falseNextBlockId as string | undefined) ?? null;
              nextId = falseNext;
              await log(supabaseAdmin, run, b, "ok", "validação falhou (legado)", { branch: "false" });
            } else {
              await log(supabaseAdmin, run, b, "ok", "validação ok (legado)", { branch: "true" });
            }
          }
          break;
        }
        case "ir-etapa": {
          // Novo comportamento: apenas salta para outro bloco do bot (via nextBlockId).
          // A mudança de etapa do funil agora é feita pelo bloco de ação "mudar-status-lead".
          if (b.next_block_id) {
            await log(supabaseAdmin, run, b, "ok", `→ salto para bloco ${b.next_block_id}`);
          } else {
            await log(supabaseAdmin, run, b, "skipped", "sem bloco de destino");
          }
          break;
        }
        case "iniciar-salesbot": {
          const rawDestId = String(b.config.destinoBotId ?? "");
          if (!rawDestId) {
            await log(supabaseAdmin, run, b, "skipped", "destinoBotId vazio");
            break;
          }
          const destBotId = await resolveSalesbotId(supabaseAdmin, run.workspace_id, rawDestId);
          if (!destBotId) {
            await log(supabaseAdmin, run, b, "error", "salesbot de destino não encontrado neste workspace");
            break;
          }
          if (destBotId === run.salesbot_id) {
            await log(supabaseAdmin, run, b, "skipped", "loop: não inicia o próprio bot");
            break;
          }

          // Contexto de execução pai/filho
          const currentExec = run.variables._execution as ExecutionContext | undefined;
          let nextExec: ExecutionContext;
          try {
            if (currentExec) {
              nextExec = createChildContext(currentExec, run.id, "salesbot", run.salesbot_id);
            } else {
              // Se a run atual não tinha contexto, ela era a raiz (depth 0)
              const root = createRootContext(run.id, "salesbot", run.salesbot_id);
              nextExec = createChildContext(root, run.id, "salesbot", run.salesbot_id);
            }
          } catch (e) {
            await log(supabaseAdmin, run, b, "error", `Bloqueado: ${(e as Error).message}`);
            break;
          }

          // Cria run do outro bot em paralelo (não bloqueia o atual)
          try {
            await startSalesbotRun(supabaseAdmin, {
              workspaceId: run.workspace_id,
              salesbotId: destBotId,
              leadId: lead.id,
              initialVariables: {
                ...inheritedRunVariables(run.variables),
                started_by_bot: run.salesbot_id,
                _execution: nextExec
              },
            });

            await log(supabaseAdmin, run, b, "ok", `iniciou bot ${destBotId}`);
          } catch (e) {
            await log(supabaseAdmin, run, b, "error", slimSafeOperationalError(e));
          }
          break;
        }

        case "encerrar-bot": {
          // Ações opcionais configuradas no bloco (status da conversa,
          // iniciar outro Salesbot, iniciar Agente IA). Podem ser combinadas.
          const encerrarAcoes = Array.isArray(b.config.encerrarAcoes)
            ? (b.config.encerrarAcoes as Array<{
                tipo?: string; status?: string; botId?: string; botNome?: string;
                agentId?: string; agentNome?: string;
              }>)
            : [];
          let handoffAgentId = "";
          for (const acao of encerrarAcoes) {
            try {
              if (acao.tipo === "status-conversa") {
                const st = String(acao.status ?? "").toLowerCase();
                if (!["aberta", "lida", "fechada"].includes(st)) {
                  await log(supabaseAdmin, run, b, "skipped", "status da conversa inválido");
                  continue;
                }
                const { error } = await supabaseAdmin.from("leads")
                  .update({ conversation_status: st, updated_at: new Date().toISOString() })
                  .eq("id", run.lead_id)
                  .eq("workspace_id", run.workspace_id);
                await log(supabaseAdmin, run, b, error ? "error" : "ok",
                  error ? error.message : `status da conversa: ${st}`);
              } else if (acao.tipo === "iniciar-salesbot") {
                const destId = await resolveSalesbotId(
                  supabaseAdmin, run.workspace_id, String(acao.botId ?? ""),
                );
                if (!destId || destId === run.salesbot_id) {
                  await log(supabaseAdmin, run, b, "skipped", "salesbot de destino inválido");
                  continue;
                }
                // Contexto de execução pai/filho
                const currentExec = run.variables._execution as ExecutionContext | undefined;
                let nextExec: ExecutionContext;
                try {
                  if (currentExec) {
                    nextExec = createChildContext(currentExec, run.id, "salesbot", run.salesbot_id);
                  } else {
                    const root = createRootContext(run.id, "salesbot", run.salesbot_id);
                    nextExec = createChildContext(root, run.id, "salesbot", run.salesbot_id);
                  }
                } catch (e) {
                  await log(supabaseAdmin, run, b, "error", `Bloqueado: ${(e as Error).message}`);
                  continue;
                }

                await startSalesbotRun(supabaseAdmin, {
                  workspaceId: run.workspace_id,
                  salesbotId: destId,
                  leadId: lead.id,
                  initialVariables: {
                    ...inheritedRunVariables(run.variables),
                    started_by_bot: run.salesbot_id,
                    _execution: nextExec
                  },
                });
                await log(supabaseAdmin, run, b, "ok", `iniciou bot ${acao.botNome ?? destId}`);

              } else if (acao.tipo === "iniciar-ia") {
                const agId = String(acao.agentId ?? "");
                if (!agId) {
                  await log(supabaseAdmin, run, b, "skipped", "agente IA não configurado");
                  continue;
                }
                await assignConversationAgent(supabaseAdmin, run.workspace_id, run.lead_id, agId);
                handoffAgentId = agId;
                await log(supabaseAdmin, run, b, "ok", `Agente IA "${acao.agentNome ?? agId}" assumiu a conversa`);
              }
            } catch (e) {
              await log(supabaseAdmin, run, b, "error", slimSafeOperationalError(e));
            }
          }

          // Se um Agente IA estava em posse desta conversa, ele NÃO morre com o bot:
          // passa a responder no nível da conversa (leads.active_conversation_agent_id).
          const iaIdOnEnd = handoffAgentId
            || (typeof run.variables?.ia_agent_id === "string" ? String(run.variables.ia_agent_id) : "");
          if (iaIdOnEnd) {
            if (iaIdOnEnd !== handoffAgentId) {
              await assignConversationAgent(supabaseAdmin, run.workspace_id, run.lead_id, iaIdOnEnd);
            }
            // Handoff com contexto: se o cliente falou por último, o agente já responde.
            const h = await handoffToConversationAgent(supabaseAdmin, {
              workspaceId: run.workspace_id, leadId: run.lead_id,
              phone: lead.phone ?? "", agentId: iaIdOnEnd,
            });
            await log(supabaseAdmin, run, b, h.error ? "error" : "ok",
              h.error ?? `bot encerrado — Agente IA segue ativo (${h.reason})`);
          } else {

            await log(supabaseAdmin, run, b, "ok", "bot encerrado");
          }
          await supabaseAdmin.from("salesbot_runs")
            .update({ status: "finished", finished_at: new Date().toISOString() })
            .eq("id", run.id);
          return;
        }

        case "round-robin": {
          const opts = Array.isArray(b.config.roleta)
            ? (b.config.roleta as Array<{ id: string; label?: string; nextBlockId?: string }>)
            : [];
          const valid = opts.filter((o) => !!o.nextBlockId);
          if (!valid.length) {
            await log(supabaseAdmin, run, b, "skipped", "distribuição sem destinos conectados");
            break;
          }
          // Contador atômico no banco (tabela própria): não é sobrescrito pelo
          // autosave do editor e não sofre corrida entre leads simultâneos.
          const { data: rr, error: rrErr } = await supabaseAdmin.rpc("salesbot_rr_next", {
            _block_id: b.id,
            _size: valid.length,
          });
          if (rrErr || rr === null || rr === undefined) {
            throw new Error("Não foi possível reservar a próxima saída da distribuição.");
          }
          const pickIdx = Number(rr) % valid.length;
          const chosen = valid[pickIdx];
          nextId = chosen.nextBlockId ?? null;
          await log(supabaseAdmin, run, b, "ok", `distribuição → ${chosen.label ?? `opção ${pickIdx + 1}`}`, { pickIdx, chosenId: chosen.id });
          break;
        }

        case "acao": {
          const res = await runAction(supabaseAdmin, run, lead, b);
          if (res.ok) {
            await log(supabaseAdmin, run, b, "ok", res.message);
          } else {
            await log(supabaseAdmin, run, b, "error", res.message);
          }
          const webhookErrorNext =
            String(b.config.acaoTipo ?? "") === "webhook" && !res.ok && typeof b.config.webhookErrorNextBlockId === "string"
              ? b.config.webhookErrorNextBlockId
              : null;
          nextId = webhookErrorNext || b.next_block_id;
          advance = true;
          break;
        }
        case "iniciar-ia": {
          const agentId = String(b.config.iaAgentId ?? "");
          if (!agentId) {
            await log(supabaseAdmin, run, b, "skipped", "iniciar-ia sem agente configurado");
            break;
          }
          const maxTurnos = Math.max(0, Number(b.config.iaMaxTurnos ?? 0));
          const mensagemInicial = String(b.config.iaMensagemInicial ?? "").trim();
          const phone = lead.phone ?? "";
          if (mensagemInicial) {
            const t = interpolate(mensagemInicial, lead, run.variables);
            const s = await sendLeadWhatsappText(
              supabaseAdmin,
              run.workspace_id,
              run.lead_id,
              phone,
              t,
            );
            if (!s.ok) await log(supabaseAdmin, run, b, "error", s.error);
          } else {
            // Assume a conversa com o contexto já existente: responde na hora
            // apenas se a última fala foi do cliente; senão espera o cliente.
            const h = await handoffToConversationAgent(supabaseAdmin, {
              workspaceId: run.workspace_id, leadId: run.lead_id, phone, agentId,
            });
            await log(supabaseAdmin, run, b, h.error ? "error" : "ok", h.error ?? h.reason);
          }

          const vars: Record<string, unknown> = {
            ...(run.variables ?? {}),
            ia_agent_id: agentId,
            ia_agent_nome: String(b.config.iaAgentNome ?? ""),
            ia_max_turnos: maxTurnos,
            ia_turns_used: 0,
            ia_block_id: b.id,
          };
          // Agente IA → Encerrar bot: o Salesbot sai de cena agora e o agente
          // continua conduzindo a conversa até a própria programação dele encerrar.
          const nextAfterIa = b.next_block_id ? findBlockById(blocks, b.next_block_id) : null;
          const encerrarTemAcoes = !!nextAfterIa
            && Array.isArray((nextAfterIa.config as { encerrarAcoes?: unknown[] } | null)?.encerrarAcoes)
            && ((nextAfterIa.config as { encerrarAcoes?: unknown[] }).encerrarAcoes?.length ?? 0) > 0;
          if (nextAfterIa && nextAfterIa.type === "encerrar-bot" && !encerrarTemAcoes) {
            await assignConversationAgent(supabaseAdmin, run.workspace_id, run.lead_id, agentId);
            await supabaseAdmin.from("salesbot_runs")
              .update({ status: "finished", variables: vars, current_block_id: null, waiting_until: null, finished_at: new Date().toISOString() })
              .eq("id", run.id);
            await log(supabaseAdmin, run, b, "ok", `Agente IA "${b.config.iaAgentNome ?? agentId}" assumiu a conversa e o Salesbot foi encerrado`);
            return;
          }
          await supabaseAdmin.from("salesbot_runs")
            .update({ status: "waiting_message", variables: vars, waiting_until: null })
            .eq("id", run.id);
          await log(supabaseAdmin, run, b, "wait", `Agente IA "${b.config.iaAgentNome ?? agentId}" assumiu`);
          return;
        }

        case "enquete": {
          const pergunta = interpolate(String(b.config.enquetePergunta ?? "").trim(), lead, run.variables);
          const opcoesRaw = Array.isArray(b.config.enqueteOpcoes) ? (b.config.enqueteOpcoes as unknown[]) : [];
          const opcoes = opcoesRaw.map((o) => interpolate(String(o ?? "").trim(), lead, run.variables)).filter(Boolean);
          if (!pergunta || opcoes.length < 2) {
            await log(supabaseAdmin, run, b, "skipped", "enquete precisa de pergunta e ao menos 2 opções");
            break;
          }
          const groupJid = getSalesbotGroupJid(lead.phone, run.variables);
          if (!groupJid) {
            await log(supabaseAdmin, run, b, "error", "bloco enquete só funciona em bots de grupo (JID real do grupo ausente)");
            break;
          }
          try {
            const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
            const base = (process.env.EVOLUTION_BASE_URL ?? "").replace(/\/+$/, "");
            if (!encKey || !base) throw new Error("Ambiente Evolution não configurado");

            // Nunca fabrica JID nem usa simplesmente a sessão mais recente do
            // workspace. A enquete permanece na identidade/sessão real do grupo.
            const groupRoute = await resolveRuntimeWhatsappTarget(
              supabaseAdmin,
              run.workspace_id,
              run.lead_id,
              groupJid,
            );
            if (!groupRoute || groupRoute.remoteJid !== groupJid || !groupRoute.remoteJid.endsWith("@g.us")) {
              throw new Error("Sessão/JID real do grupo não pôde ser resolvido");
            }
            const sid = groupRoute.sessionId;
            const { data: creds } = await supabaseAdmin.rpc("get_evolution_credentials_service", { _session_id: sid, _key: encKey });
            const c = creds as { instance_name?: string; api_key?: string } | null;
            if (!c?.instance_name || !c.api_key) throw new Error("Credenciais Evolution indisponíveis");
            const g = await import("./evolution-groups.server");
            const selectable = b.config.enqueteMultipla ? opcoes.length : 1;
            const r = await g.sendGroupPoll(
              { baseUrl: base, apiKey: c.api_key, instance: c.instance_name },
              { groupJid, name: pergunta, options: opcoes, selectableCount: selectable },
            );
            if (r.ok) {
              await log(supabaseAdmin, run, b, "ok", "enquete enviada", { groupJid, opcoes: opcoes.length });
            } else {
              await log(supabaseAdmin, run, b, "error", r.error ?? "falha ao enviar enquete");
            }
          } catch (e) {
            await log(supabaseAdmin, run, b, "error", slimSafeOperationalError(e));
          }
          break;
        }
        default:
          await log(supabaseAdmin, run, b, "skipped", `bloco "${b.type}" ainda não implementado`);
      }
    } catch (e) {
      await log(supabaseAdmin, run, b, "error", slimSafeOperationalError(e));
      await supabaseAdmin.from("salesbot_runs")
        .update({ status: "error", last_error: slimSafeOperationalError(e), finished_at: new Date().toISOString() })
        .eq("id", run.id);
      return;
    }

    if (!advance) break;
    
    // DEBUG: print block execution
    

    
    // Se avançou, carregamos o próximo
    current = nextId ? findBlockById(blocks, nextId) : null;
  }

  if (!current) {
    await supabaseAdmin.from("salesbot_runs")
      .update({ status: "finished", finished_at: new Date().toISOString() })
      .eq("id", run.id);
  }
}

type GatilhoRow = {
  id?: string;
  kind: string;
  pipelineId?: string;
  stageId?: string;
  canal?: string;
  canalId?: string;
  tag?: string;
  palavraChave?: string;
  palavraChaveModo?: "contem" | "igual" | "comeca" | "regex";
  midiaTipo?: "qualquer" | "audio" | "imagem" | "video" | "documento";
  campoId?: string;
  campoNome?: string;
  campoValor?: string;
  campanhaId?: string;
  adAccountId?: string;
  trackingSiteId?: string;
  trackingEvento?: string;
  conversaoTipo?: string;
  trackingValorMin?: number;
  trackingUrlContem?: string;
  webhookUrl?: string;
  formularioId?: string;
  formularioOrigem?: "qualquer" | "mkton" | "externo" | "meta";

  atrasoDias?: number;
  atrasoHoras?: number;
  atrasoMin?: number;
  atrasoSeg?: number;
};

function computeDelaySecondsFromGatilho(g: GatilhoRow): number {
  const d = Math.max(0, Math.floor(Number(g.atrasoDias ?? 0)));
  const h = Math.max(0, Math.floor(Number(g.atrasoHoras ?? 0)));
  const m = Math.max(0, Math.floor(Number(g.atrasoMin ?? 0)));
  const s = Math.max(0, Math.floor(Number(g.atrasoSeg ?? 0)));
  return d * 86400 + h * 3600 + m * 60 + s;
}

function scopeMatchesLead(g: GatilhoRow, lead: { stage_id: string | null; pipeline_id: string | null; status?: string | null }): boolean {
  // Se o gatilho tem etapa/pipeline específica, o lead PRECISA estar nela independente do status.
  // Se o gatilho NÃO tem etapa/pipeline (gatilho global de conversa), ele só dispara para leads 'active'.
  const isGlobalTrigger = !g.stageId && !g.pipelineId;
  const isCrmStatusTrigger = g.kind === "crm-lead-ganho" || g.kind === "crm-lead-perdido";

  if (isGlobalTrigger && !isCrmStatusTrigger) {
    // Para gatilhos globais (ex: qualquer mensagem), o lead não pode estar em venda ganha/perdida
    if (lead.status && lead.status !== "active") return false;
  }

  if (g.stageId && g.stageId !== lead.stage_id) return false;
  if (g.pipelineId && g.pipelineId !== lead.pipeline_id) return false;
  return true;
}

/** Cria run para um lead. Se delaySeconds > 0, agenda em waiting_timer. */
export async function startSalesbotRun(
  supabaseAdmin: AnySb,
  params: {
    workspaceId: string;
    salesbotId: string;
    leadId: string;
    initialVariables?: Record<string, unknown>;
    delaySeconds?: number;
  },
): Promise<string | null> {
  const singleEntryRunId = await findPriorSingleEntrySalesbotRunId(supabaseAdmin, {
    workspaceId: params.workspaceId,
    salesbotId: params.salesbotId,
    leadId: params.leadId,
    trigger: typeof params.initialVariables?.trigger === "string"
      ? params.initialVariables.trigger
      : null,
  });
  if (singleEntryRunId) return singleEntryRunId;

  const existingRunId = await findActiveSalesbotRunId(supabaseAdmin, {
    workspaceId: params.workspaceId,
    salesbotId: params.salesbotId,
    leadId: params.leadId,
  });
  if (existingRunId) return existingRunId;

  const initialVars = { ...(params.initialVariables ?? {}) } as Record<string, any>;
  const delay = Math.max(0, Math.floor(params.delaySeconds ?? 0));
  
  // Garante que toda run tenha ExecutionContext
  let runId: string;
  if (!initialVars._execution) {
    runId = crypto.randomUUID();
    initialVars._execution = createRootContext(runId, "salesbot", params.salesbotId);
  } else {
    runId = crypto.randomUUID();
  }

  if (delay > 0) {
    const until = new Date(Date.now() + delay * 1000).toISOString();
    const { data: created, error } = await supabaseAdmin.from("salesbot_runs")
      .insert({
        id: runId,
        workspace_id: params.workspaceId,
        salesbot_id: params.salesbotId,
        lead_id: params.leadId,
        status: "waiting_timer",
        waiting_until: until,
        current_block_id: null,
        variables: initialVars,
      })
      .select("id").single();
    if (error) return null;
    return (created as { id: string }).id;
  }

  const { data: created, error } = await supabaseAdmin.from("salesbot_runs")
    .insert({
      id: runId,
      workspace_id: params.workspaceId,
      salesbot_id: params.salesbotId,
      lead_id: params.leadId,
      status: "running",
      variables: initialVars,
    })
    .select("id, workspace_id, salesbot_id, lead_id, status, variables").single();

  if (error) {
    console.error("[startSalesbotRun] Insert error:", error);
    return null;
  }
  const actualRun = created as RunRow;
  try {
    await executeRun(supabaseAdmin, actualRun as any);
  } catch (e) {
    await supabaseAdmin.from("salesbot_run_logs")
      .update({ status: "error", last_error: slimSafeOperationalError(e), finished_at: new Date().toISOString() })
      .eq("id", actualRun.id);
  }
  return actualRun.id;
}

/** Destrava runs aguardando envio de formulário. */
export async function resumeRunsOnFormSubmission(
  supabaseAdmin: AnySb,
  params: { workspaceId: string; leadId: string; formId: string },
): Promise<void> {
  const { data: runs } = await supabaseAdmin.from("salesbot_runs")
    .select("id, variables")
    .eq("workspace_id", params.workspaceId)
    .eq("lead_id", params.leadId)
    .eq("status", "waiting_message");
  const list = (runs ?? []) as Array<{ id: string; variables: Record<string, unknown> }>;
  for (const r of list) {
    const waitingBranch = (r.variables?.salesbot_waiting_branch ?? {}) as Record<string, unknown>;
    const waitingEvents = Array.isArray(waitingBranch.waitingEvents)
      ? waitingBranch.waitingEvents as WaitingSalesbotEvent[]
      : [];
    const matched = waitingEvents.find((event) =>
      event.type === "formulario-enviado"
      && (!event.formularioId || event.formularioId === params.formId),
    );
    if (!matched) continue;

    const vars: Record<string, unknown> = { ...(r.variables ?? {}), last_form_id: params.formId };
    delete vars.salesbot_waiting_branch;
    const { data: cur } = await supabaseAdmin.from("salesbot_runs")
      .select("current_block_id")
      .eq("id", r.id).maybeSingle();
    const c = cur as { current_block_id: string | null } | null;

    const nextId = matched.nextBlockId ?? (c?.current_block_id ? await (async () => {
      const { data: block } = await supabaseAdmin.from("salesbot_blocks")
        .select("next_block_id").eq("id", c.current_block_id).maybeSingle();
      return (block as { next_block_id: string | null } | null)?.next_block_id ?? null;
    })() : null);

    if (!nextId) {
      await supabaseAdmin.from("salesbot_runs")
        .update({ status: "finished", variables: vars, current_block_id: null, finished_at: new Date().toISOString() })
        .eq("id", r.id)
        .eq("status", "waiting_message");
      continue;
    }

    const { data: claimed } = await supabaseAdmin.from("salesbot_runs")
      .update({ status: "running", waiting_until: null, variables: vars, current_block_id: nextId })
      .eq("id", r.id)
      .eq("status", "waiting_message")
      .select("id");

    if (claimed && claimed.length > 0) {
      try { 
        const { data: runRow } = await supabaseAdmin.from("salesbot_runs").select("*").eq("id", r.id).single();
        if (runRow) await executeRun(supabaseAdmin, runRow as any); 


      } catch { /* logado */ }
    }
  }
}

/** Destrava runs aguardando mensagem do lead. */
export async function resumeRunsOnInboundMessage(
  supabaseAdmin: AnySb,
  params: { workspaceId: string; leadId: string; text: string; senderPhone?: string | null; senderName?: string | null } & InboundResumeOptions,
): Promise<void> {
  let inboundRunQuery = supabaseAdmin.from("salesbot_runs")
    .select("id, variables")
    .eq("workspace_id", params.workspaceId)
    .eq("lead_id", params.leadId)
    .eq("status", "waiting_message");
  if (params.onlyRunId) inboundRunQuery = inboundRunQuery.eq("id", params.onlyRunId);
  const { data: runs, error: inboundRunsError } = await inboundRunQuery;
  if (inboundRunsError) throw new Error("Não foi possível consultar as execuções aguardando mensagem.");
  const list = (runs ?? []) as Array<{ id: string; variables: Record<string, unknown> }>;
  for (const r of list) {
    // Grupos: guarda quem falou por último para permitir menção `{@participante}`.
    if (params.senderPhone) {
      r.variables = {
        ...(r.variables ?? {}),
        participante_telefone: String(params.senderPhone).replace(/\D/g, ""),
        participante_nome: params.senderName ?? "",
      };
    }
    const configuredEvents = Array.isArray(r.variables?.salesbot_waiting_branch)
      ? []
      : ((r.variables?.salesbot_waiting_branch as { waitingEvents?: unknown } | undefined)?.waitingEvents);
    if (!waitingEventsAcceptInbound(configuredEvents)) continue;
    // --- Modo Agente IA: se a run está em posse de um agente, deixamos ele responder ---
    const vars0 = (r.variables ?? {}) as Record<string, unknown>;
    const iaAgentId = typeof vars0.ia_agent_id === "string" ? vars0.ia_agent_id : "";
    if (iaAgentId) {
      const claimedIa = await claimSalesbotAiTurn(supabaseAdmin, {
        runId: r.id,
        workspaceId: params.workspaceId,
      });
      if (!claimedIa) continue;
      params.onAgentClaimed?.(r.id);

      const { data: leadRow } = await supabaseAdmin.from("leads")
        .select("phone").eq("id", params.leadId).eq("workspace_id", params.workspaceId).maybeSingle();
      const phone = (leadRow as { phone?: string } | null)?.phone ?? "";
      const maxTurnos = Number(vars0.ia_max_turnos ?? 0);
      const usedNow = Number(vars0.ia_turns_used ?? 0) + 1;
      const turn = await withSalesbotGuard(supabaseAdmin, { id: r.id, workspace_id: params.workspaceId },
        () => runAiAgentTurn(supabaseAdmin, params.workspaceId, params.leadId, phone, iaAgentId, params.text));
      if (!turn) continue;
      if (turn.error) {
        const restored = await supabaseAdmin.from("salesbot_runs")
          .update({ status: "waiting_message", variables: { ...vars0, last_message: params.text, ia_last_turn_error: "O turno de IA não foi concluído. Verifique o agente antes de retomar." } })
          .eq("id", r.id).eq("workspace_id", params.workspaceId).eq("status", "running").is("stopped_at", null);
        if (restored.error) throw new Error("Não foi possível registrar a interrupção do turno de IA.");
        continue;
      }
      const shouldHandoff = turn.handoff || (maxTurnos > 0 && usedNow >= maxTurnos);
      if (shouldHandoff) {
        const { data: cur } = await supabaseAdmin.from("salesbot_runs")
          .select("current_block_id").eq("id", r.id).maybeSingle();
        const curBlockId = (cur as { current_block_id: string | null } | null)?.current_block_id ?? null;
        let nextIdIa: string | null = null;
        if (curBlockId) {
          const { data: block } = await supabaseAdmin.from("salesbot_blocks")
            .select("next_block_id").eq("id", curBlockId).maybeSingle();
          nextIdIa = (block as { next_block_id: string | null } | null)?.next_block_id ?? null;
        }
        const cleaned: Record<string, unknown> = { ...vars0, last_message: params.text };
        delete cleaned.ia_agent_id;
        delete cleaned.ia_agent_nome;
        delete cleaned.ia_max_turnos;
        delete cleaned.ia_turns_used;
        delete cleaned.ia_block_id;
        if (!nextIdIa) {
          await supabaseAdmin.from("salesbot_runs")
            .update({ status: "finished", variables: cleaned, current_block_id: null, finished_at: new Date().toISOString() })
            .eq("id", r.id)
            .eq("status", "running");
        } else {
          const { data: advanced } = await supabaseAdmin.from("salesbot_runs")
            .update({ variables: cleaned, current_block_id: nextIdIa, waiting_until: null })
            .eq("id", r.id)
            .eq("status", "running")
            .select("id");

          if (advanced && advanced.length > 0) {
            try { 
              const { data: runRow } = await supabaseAdmin.from("salesbot_runs").select("*").eq("id", r.id).single();
              if (runRow) await executeRun(supabaseAdmin, runRow as any); 


            } catch { /* logado */ }
          }
        }
      } else {
        const kept: Record<string, unknown> = { ...vars0, last_message: params.text, ia_turns_used: usedNow };
        delete kept.ia_last_turn_error;
        await supabaseAdmin.from("salesbot_runs")
          .update({ variables: kept, status: "waiting_message" })
          .eq("id", r.id)
          .eq("status", "running");
      }
      continue;
    }

    const waitingBranch = (r.variables?.salesbot_waiting_branch ?? {}) as Record<string, unknown>;
    const vars: Record<string, unknown> = { ...(r.variables ?? {}), last_message: params.text };
    delete vars.salesbot_waiting_branch;
    const { data: cur } = await supabaseAdmin.from("salesbot_runs")
      .select("current_block_id, salesbot_id")
      .eq("id", r.id).maybeSingle();
    const c = cur as { current_block_id: string | null; salesbot_id: string } | null;
    const waitingEvents = Array.isArray(waitingBranch.waitingEvents)
      ? waitingBranch.waitingEvents as WaitingSalesbotEvent[]
      : [];
    // Pausa "lote-msgs" (grupos): só avança depois de acumular N mensagens de forma atômica via RPC.
    const batchEvent = waitingEvents.find((event) => event.type === "lote-msgs");
    if (batchEvent) {
      let nextIdLote: string | null = batchEvent.nextBlockId ?? null;
      if (!nextIdLote && c?.current_block_id) {
        const { data: block } = await supabaseAdmin.from("salesbot_blocks")
          .select("next_block_id").eq("id", c.current_block_id).maybeSingle();
        nextIdLote = (block as { next_block_id: string | null } | null)?.next_block_id ?? null;
      }

      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("salesbot_batch_decrement", {
        p_run_id: r.id,
        p_text: params.text,
        p_sender_phone: params.senderPhone ?? null,
        p_sender_name: params.senderName ?? null,
        p_next_block_id: nextIdLote,
      });

      if (rpcErr) {
        console.error("[lote-msgs] erro RPC:", rpcErr);
        continue;
      }

      if (rpcRes?.success && rpcRes?.completed) {
        try { 
          const { data: runRow } = await supabaseAdmin.from("salesbot_runs").select("*").eq("id", r.id).single();
          if (runRow) await executeRun(supabaseAdmin, runRow as any); 


        } catch { /* logado */ }
      }
      continue;
    }
    // Clique em botão: casa a resposta com o rótulo e segue o cabo daquele botão.
    const buttonEvent = waitingEvents.find((event) => event.type === "botao-clicado");
    if (buttonEvent) {
      const answer = normalizeButtonText(params.text ?? "");
      const options = Array.isArray(buttonEvent.options) ? buttonEvent.options : [];
      const chosen = options.find((o) => {
        const label = normalizeButtonText(o.label ?? "");
        return label.length > 0 && (answer === label || answer.includes(label));
      });
      vars.salesbot_botao_clicado = chosen?.label ?? params.text ?? "";
      let btnNext: string | null = chosen?.nextBlockId ?? buttonEvent.nextBlockId ?? null;
      if (!btnNext && c?.current_block_id) {
        const { data: block } = await supabaseAdmin.from("salesbot_blocks")
          .select("next_block_id").eq("id", c.current_block_id).maybeSingle();
        btnNext = (block as { next_block_id: string | null } | null)?.next_block_id ?? null;
      }
      if (!btnNext) {
        await supabaseAdmin.from("salesbot_runs")
          .update({ status: "finished", variables: vars, current_block_id: null, finished_at: new Date().toISOString() })
          .eq("id", r.id)
          .eq("status", "waiting_message");
        continue;
      }
      const { data: claimed } = await supabaseAdmin.from("salesbot_runs")
        .update({ status: "running", waiting_until: null, variables: vars, current_block_id: btnNext })
        .eq("id", r.id)
        .eq("status", "waiting_message")
        .select("id");
      if (claimed && claimed.length > 0) {
      try { 
        const { data: runRow } = await supabaseAdmin.from("salesbot_runs").select("*").eq("id", r.id).single();
        if (runRow) await executeRun(supabaseAdmin, runRow as any); 

      } catch { /* logado */ }
      }
      continue;
    }
    const inboundEvent = waitingEvents.find(
      (event) => event.type === "msg-recebida" || event.type === "lote-msgs");
    let nextId: string | null = typeof inboundEvent?.nextBlockId === "string"
      ? inboundEvent.nextBlockId
      : typeof waitingBranch.messageNextBlockId === "string" ? waitingBranch.messageNextBlockId : null;
    if (c?.current_block_id) {
      const { data: block } = await supabaseAdmin.from("salesbot_blocks")
        .select("next_block_id").eq("id", c.current_block_id).maybeSingle();
      nextId = nextId ?? ((block as { next_block_id: string | null } | null)?.next_block_id ?? null);
    }
    if (c?.current_block_id && !nextId) {
      await supabaseAdmin.from("salesbot_runs")
        .update({ status: "finished", variables: vars, current_block_id: null, finished_at: new Date().toISOString() })
        .eq("id", r.id)
        .eq("status", "waiting_message");
      continue;
    }
    const { data: claimed } = await supabaseAdmin.from("salesbot_runs")
      .update({ status: "running", waiting_until: null, variables: vars, current_block_id: nextId })
      .eq("id", r.id)
      .eq("status", "waiting_message")
      .select("id");
    if (claimed && claimed.length > 0) {
      try {
        const { data: runRow } = await supabaseAdmin.from("salesbot_runs").select("*").eq("id", r.id).single();
        if (runRow) await executeRun(supabaseAdmin, runRow as any);
      } catch { /* logado */ }
    }
  }
}

/** Retoma uma pausa de áudio/vídeo quando o provedor confirma visualização/leitura. */
export async function resumeRunsOnMediaEvent(
  supabaseAdmin: AnySb,
  params: { workspaceId: string; leadId: string; messageId: string; status: string },
): Promise<void> {
  const status = params.status.toLowerCase();
  const acceptedTypes = new Set<string>();

  if (status === "read") {
    acceptedTypes.add("video-aberto");
    acceptedTypes.add("audio-aberto");
  } else if (status === "played") {
    // Apenas áudio suporta played (reprodução real). 
    // Vídeo não tem evento real de "fechado" no provedor, então played de vídeo deve ser ignorado.
    acceptedTypes.add("audio-fechado");
  }

  if (acceptedTypes.size === 0) return;
  const { data: runs } = await supabaseAdmin.from("salesbot_runs")
    .select("id, current_block_id, variables")
    .eq("workspace_id", params.workspaceId)
    .eq("lead_id", params.leadId)
    .eq("status", "waiting_message");
  const list = (runs ?? []) as Array<{ id: string; current_block_id: string | null; variables?: Record<string, unknown> }>;
  for (const run of list) {
    const waitingBranch = (run.variables?.salesbot_waiting_branch ?? {}) as Record<string, unknown>;
    const waitingEvents = Array.isArray(waitingBranch.waitingEvents)
      ? waitingBranch.waitingEvents as WaitingSalesbotEvent[]
      : [];
    const matched = waitingEvents.find((event) =>
      acceptedTypes.has(event.type)
      && typeof event.messageId === "string" && !!event.messageId && event.messageId === params.messageId,
    );
    if (!matched) continue;

    const variables: Record<string, unknown> = { ...(run.variables ?? {}) };
    delete variables.salesbot_waiting_branch;
    let nextId = matched.nextBlockId;
    if (!nextId && run.current_block_id) {
      const { data: block } = await supabaseAdmin.from("salesbot_blocks")
        .select("next_block_id").eq("id", run.current_block_id).maybeSingle();
      nextId = (block as { next_block_id?: string | null } | null)?.next_block_id ?? null;
    }
    if (!nextId) {
      await supabaseAdmin.from("salesbot_runs").update({
        status: "finished", waiting_until: null, variables, current_block_id: null, finished_at: new Date().toISOString(),
      }).eq("id", run.id).eq("status", "waiting_message");
      continue;
    }
    const { data: claimed } = await supabaseAdmin.from("salesbot_runs").update({
      status: "running", waiting_until: null, variables, current_block_id: nextId,
    }).eq("id", run.id).eq("status", "waiting_message").select("id");

    if (claimed && claimed.length > 0) {
      try { await executeRun(supabaseAdmin, run.id); } catch { /* logado */ }
    }
  }
}

/** Cron: acorda runs cujo timer venceu. */
export async function tickWaitingTimers(supabaseAdmin: AnySb): Promise<{ processed: number }> {
  const nowIso = new Date().toISOString();

  // 1. Claim atômico das runs vencidas: muda de waiting_* -> running somente se ainda estiver vencida.
  // Isso evita que dois ticks concorrentes processem a mesma execução.
  const { data: claimed, error: claimErr } = await supabaseAdmin.from("salesbot_runs")
    .update({ status: "running", updated_at: nowIso })
    .in("status", ["waiting_timer", "waiting_message"])
    .lte("waiting_until", nowIso)
    .select("id, workspace_id, salesbot_id, lead_id, current_block_id, variables")
    .limit(100);

  if (claimErr) {
    console.error("[tick] erro ao reivindicar runs:", claimErr);
    return { processed: 0 };
  }

  const list = (claimed ?? []) as Array<RunRow & { waiting_until?: string | null }>;
  for (const r of list) {
    try {
      const waitingBranch = (r.variables?.salesbot_waiting_branch ?? {}) as Record<string, unknown>;
      const vars: Record<string, unknown> = { ...(r.variables ?? {}) };
      delete vars.salesbot_waiting_branch;

      let nextId: string | null = typeof waitingBranch.timerNextBlockId === "string" ? waitingBranch.timerNextBlockId : null;
      
      // Se a run tem current_block_id, o tick geralmente deve seguir pelo timerNextBlockId
      // ou pelo next_block_id do bloco atual se for um delay simples.
      if (r.current_block_id) {
        const { data: block } = await supabaseAdmin.from("salesbot_blocks")
          .select("next_block_id").eq("id", r.current_block_id).maybeSingle();
        nextId = nextId ?? ((block as { next_block_id: string | null } | null)?.next_block_id ?? null);
      }

      // Limpeza final do estado de espera agora que já estamos em 'running' (pelo claim)
      await supabaseAdmin.from("salesbot_runs")
        .update({ waiting_until: null, variables: vars, current_block_id: nextId })
        .eq("id", r.id);

      // Continua a execução
      await executeRun(supabaseAdmin, r.id);
    } catch (e) {
      console.error(`[tick] erro na run ${r.id}:`, e);
      await supabaseAdmin.from("salesbot_runs")
        .update({ 
          status: "error", 
          last_error: slimSafeOperationalError(e),
          finished_at: new Date().toISOString() 
        })
        .eq("id", r.id);
    }
  }
  return { processed: list.length };
}

/** Coleta os gatilhos de contingência de inatividade da árvore de objetivos. */
function collectInactivityFallbacks(tree?: ObjectiveTreeLike | null): ObjectiveFallbackLike[] {
  const out: ObjectiveFallbackLike[] = [];
  const walk = (n?: ObjectiveNodeLike) => {
    if (!n) return;
    (n.fallbacks ?? []).forEach((f) => { if (f?.kind === "inatividade") out.push(f); });
    (n.children ?? []).forEach(walk);
  };
  walk(tree?.root);
  return out;
}

type TrackingNodeLike = ObjectiveNodeLike & { id: string; tracking: NonNullable<ObjectiveNodeLike["tracking"]> };

function collectTrackingNodes(tree?: ObjectiveTreeLike | null): TrackingNodeLike[] {
  const out: TrackingNodeLike[] = [];
  const walk = (node?: ObjectiveNodeLike) => {
    if (!node) return;
    if (node.block === "tracking" && node.id && node.tracking?.siteId && node.tracking.event) {
      out.push(node as TrackingNodeLike);
    }
    (node.children ?? []).forEach(walk);
  };
  walk(tree?.root);
  return out;
}

/**
 * Confere os blocos de Tracking dos agentes ativos contra eventos realmente
 * recebidos pelo pixel do mesmo workspace/site e vinculados ao lead.
 */
export async function tickAiAgentTracking(supabaseAdmin: AnySb): Promise<{ processed: number }> {
  const { data: leadsData } = await supabaseAdmin.from("leads")
    .select("id,workspace_id,phone,custom_data,active_conversation_agent_id")
    .not("active_conversation_agent_id", "is", null)
    .eq("ai_paused", false)
    .limit(200);
  const leads = (leadsData ?? []) as Array<{
    id: string;
    workspace_id: string;
    phone: string | null;
    custom_data: Record<string, unknown> | null;
    active_conversation_agent_id: string;
  }>;
  const agentCache = new Map<string, ObjectiveTreeLike | null>();
  let processed = 0;

  for (const lead of leads) {
    const cacheKey = `${lead.workspace_id}:${lead.active_conversation_agent_id}`;
    if (!agentCache.has(cacheKey)) {
      const agent = await loadConversationAgent(supabaseAdmin, lead.workspace_id, lead.active_conversation_agent_id);
      const metadata = (agent?.metadata ?? {}) as { objective_tree?: ObjectiveTreeLike };
      agentCache.set(cacheKey, metadata.objective_tree ?? null);
    }
    const nodes = collectTrackingNodes(agentCache.get(cacheKey));
    if (!nodes.length) continue;

    const customData = { ...(lead.custom_data ?? {}) };
    const trackingState = {
      ...((customData["_ia_tracking"] as Record<string, { startedAt?: string; lastCheckedAt?: string; eventId?: number }> | undefined) ?? {}),
    };
    let changed = false;

    for (const node of nodes) {
      const tracking = node.tracking;
      const state = trackingState[node.id] ?? {};
      if (state.eventId) continue;
      const now = new Date();
      const startedAt = state.startedAt ?? now.toISOString();
      const everyMinutes = Math.max(1, Number(tracking.everyMinutes) || 5);
      if (state.lastCheckedAt && now.getTime() - new Date(state.lastCheckedAt).getTime() < everyMinutes * 60_000) continue;

      const eventName = tracking.event === "custom" ? tracking.customEvent : tracking.event;
      let query = supabaseAdmin.from("tracking_events")
        .select("id,event_name,page_url,page_path,created_at")
        .eq("workspace_id", lead.workspace_id)
        .eq("lead_id", lead.id)
        .eq("site_id", tracking.siteId)
        .eq("event_name", eventName)
        .gte("created_at", startedAt)
        .order("created_at", { ascending: false })
        .limit(1);
      if (tracking.match?.trim()) query = query.or(`page_url.ilike.%${tracking.match.trim()}%,page_path.ilike.%${tracking.match.trim()}%`);
      const { data: eventRows } = await query;
      const event = ((eventRows ?? []) as Array<{ id: number; event_name: string; page_url?: string | null; page_path?: string | null }>)[0];

      if (event) {
        trackingState[node.id] = { startedAt, lastCheckedAt: now.toISOString(), eventId: event.id };
        await executeAgentActions(supabaseAdmin, lead.workspace_id, lead.id, lead.phone ?? "", node.actions);
        if (lead.phone && tracking.onFoundMessage?.trim()) {
          await sendLeadWhatsappText(
            supabaseAdmin,
            lead.workspace_id,
            lead.id,
            lead.phone,
            tracking.onFoundMessage.trim(),
          );
        } else if (lead.phone) {
          await runAiAgentTurn(
            supabaseAdmin,
            lead.workspace_id,
            lead.id,
            lead.phone,
            lead.active_conversation_agent_id,
            `(sistema) O evento real "${event.event_name}" foi confirmado no site configurado. Continue para o próximo objetivo sem perguntar se o lead concluiu.`,
          );
        }
        await supabaseAdmin.from("lead_activities").insert({
          workspace_id: lead.workspace_id,
          lead_id: lead.id,
          type: "tracking_confirmed",
          payload: { agent_id: lead.active_conversation_agent_id, node_id: node.id, site_id: tracking.siteId, event_id: event.id, event_name: event.event_name },
        });
        processed++;
        changed = true;
        continue;
      }

      const limitMinutes = Math.max(0, Number(tracking.forMinutes) || 0);
      const expired = limitMinutes > 0 && now.getTime() - new Date(startedAt).getTime() >= limitMinutes * 60_000;
      trackingState[node.id] = { startedAt, lastCheckedAt: now.toISOString() };
      if (expired && tracking.onTimeout === "encerrar") {
        await supabaseAdmin.from("leads").update({ active_conversation_agent_id: null, ai_paused: true }).eq("id", lead.id).eq("workspace_id", lead.workspace_id);
      }
      changed = true;
    }

    if (changed) {
      customData["_ia_tracking"] = trackingState;
      await supabaseAdmin.from("leads").update({ custom_data: customData, updated_at: new Date().toISOString() }).eq("id", lead.id).eq("workspace_id", lead.workspace_id);
    }
  }
  return { processed };
}

/**
 * Cronômetro de contingência dos agentes IA: cobra o lead que ficou sem
 * responder e, esgotadas as tentativas, aplica o destino configurado
 * (continuar, avançar ou encerrar/passar pra humano).
 */
export async function tickAiAgentInactivity(supabaseAdmin: AnySb): Promise<{ processed: number }> {
  const { data: leadsData } = await supabaseAdmin.from("leads")
    .select("id, workspace_id, phone, custom_data, active_conversation_agent_id")
    .not("active_conversation_agent_id", "is", null)
    .eq("ai_paused", false)
    .limit(200);
  const leads = (leadsData ?? []) as Array<{
    id: string; workspace_id: string; phone: string | null;
    custom_data: Record<string, unknown> | null; active_conversation_agent_id: string;
  }>;

  let processed = 0;
  const agentCache = new Map<string, ObjectiveTreeLike | null>();

  for (const lead of leads) {
    if (!lead.phone) continue;
    const cacheKey = `${lead.workspace_id}:${lead.active_conversation_agent_id}`;
    if (!agentCache.has(cacheKey)) {
      const agent = await loadConversationAgent(supabaseAdmin, lead.workspace_id, lead.active_conversation_agent_id);
      const meta = (agent?.metadata ?? {}) as { objective_tree?: ObjectiveTreeLike };
      agentCache.set(cacheKey, meta.objective_tree ?? null);
    }
    const tree = agentCache.get(cacheKey) ?? null;
    const fb = collectInactivityFallbacks(tree)[0];
    if (!fb) continue;

    const minutes = Math.max(1, Number(fb.minutes) || 30);
    const maxAttempts = Math.max(1, Number(fb.attempts) || 2);

    const { data: lastMsg } = await supabaseAdmin.from("lead_activities")
      .select("type, occurred_at")
      .eq("workspace_id", lead.workspace_id)
      .eq("lead_id", lead.id)
      .in("type", ["message_in", "message_out"])
      .order("occurred_at", { ascending: false })
      .limit(1);
    const lastActivity = ((lastMsg ?? []) as Array<{ type: string; occurred_at: string }>)[0];
    const last = lastActivity
      ? { direction: lastActivity.type === "message_in" ? "in" : "out", received_at: lastActivity.occurred_at }
      : null;
    if (!last) continue;

    const state = ((lead.custom_data ?? {}) as Record<string, unknown>)["_ia_followup"] as
      | { agentId?: string; attempts?: number; lastAt?: string } | undefined;
    const sameAgent = state?.agentId === lead.active_conversation_agent_id;
    const attempts = sameAgent ? Number(state?.attempts) || 0 : 0;

    // Reset quando o lead respondeu depois da última cobrança.
    if (last.direction === "in") {
      if (attempts > 0) {
        const cd = { ...(lead.custom_data ?? {}) };
        delete (cd as Record<string, unknown>)["_ia_followup"];
        await supabaseAdmin.from("leads").update({ custom_data: cd }).eq("id", lead.id);
      }
      // conta o tempo desde a resposta do lead (ele espera o agente, não cobramos)
      continue;
    }

    const baseIso = sameAgent && state?.lastAt ? state.lastAt : last.received_at;
    const elapsedMin = (Date.now() - new Date(baseIso).getTime()) / 60000;
    if (elapsedMin < minutes) continue;

    if (attempts < maxAttempts) {
      const msg = fb.message?.trim();
      if (msg) {
        await sendLeadWhatsappText(
          supabaseAdmin,
          lead.workspace_id,
          lead.id,
          lead.phone,
          msg,
        );
      }
      else await runAiAgentTurn(
        supabaseAdmin, lead.workspace_id, lead.id, lead.phone, lead.active_conversation_agent_id,
        "(sistema) O lead está sem responder. Faça uma cobrança curta e educada retomando o objetivo atual.",
      );
      await supabaseAdmin.from("leads").update({
        custom_data: {
          ...(lead.custom_data ?? {}),
          _ia_followup: {
            agentId: lead.active_conversation_agent_id,
            attempts: attempts + 1,
            lastAt: new Date().toISOString(),
          },
        },
      }).eq("id", lead.id);
      processed++;
      continue;
    }

    // Tentativas esgotadas → aplica o destino configurado.
    const cd = { ...(lead.custom_data ?? {}) };
    delete (cd as Record<string, unknown>)["_ia_followup"];
    const patch: Record<string, unknown> = { custom_data: cd, updated_at: new Date().toISOString() };
    if (fb.goTo === "encerrar") {
      patch["active_conversation_agent_id"] = null;
      patch["ai_paused"] = true;
    }
    await supabaseAdmin.from("leads").update(patch).eq("id", lead.id);
    await supabaseAdmin.from("lead_activities").insert({
      workspace_id: lead.workspace_id,
      lead_id: lead.id,
      type: "ai_agent_fallback",
      payload: { kind: "inatividade", minutes, attempts: maxAttempts, goTo: fb.goTo ?? "ficar" },
    }).then(() => undefined, () => undefined);
    processed++;
  }

  return { processed };
}


/** Carrega bots ativos do workspace com seus gatilhos jsonb. */
async function loadActiveBotsWithGatilhos(
  supabaseAdmin: AnySb,
  workspaceId: string,
): Promise<Array<{ id: string; trigger: string | null; gatilhos: GatilhoRow[] }>> {
  const { data: bots } = await supabaseAdmin.from("salesbots")
    .select("id, trigger, gatilhos")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);
  return ((bots ?? []) as Array<{ id: string; trigger: string | null; gatilhos: unknown }>).map((b) => ({
    id: b.id,
    trigger: b.trigger,
    gatilhos: Array.isArray(b.gatilhos) ? (b.gatilhos as GatilhoRow[]) : [],
  }));
}

/** Dispatcher: mensagem inbound → cria run p/ bots com gatilho compatível
 * ou destrava runs aguardando resposta. */
export async function dispatchInboundMessage(
  supabaseAdmin: AnySb,
  params: {
    workspaceId: string;
    leadId: string;
    text: string;
    canal?: string;
    canalId?: string;
    mediaType?: "audio" | "imagem" | "video" | "documento" | null;
    isFirstMessage?: boolean;
    /** Grupos: telefone/nome de quem enviou a mensagem dentro do grupo. */
    senderPhone?: string | null;
    senderName?: string | null;
  },
): Promise<void> {
  const owned = await routeInboundAgentOwnership(supabaseAdmin, params, {
    resume: (options) => resumeRunsOnInboundMessage(supabaseAdmin, { ...params, ...options }),
    turn: (owner) => runAiAgentTurn(supabaseAdmin, params.workspaceId, params.leadId, owner.phone, owner.id, params.text, owner.version),
  });
  if (owned) return;

  const bots = await loadActiveBotsWithGatilhos(supabaseAdmin, params.workspaceId);
  if (!bots.length) return;

  const lead = await loadLead(supabaseAdmin, params.leadId, params.workspaceId);
  if (!lead) return;
  const canal = (params.canal ?? "whatsapp").toLowerCase();
  const text = params.text ?? "";

  const matchesChannel = (g: GatilhoRow) => {
    if (g.canal && g.canal !== "qualquer" && g.canal !== canal) return false;
    if (g.canalId && params.canalId && g.canalId !== params.canalId) return false;
    return true;
  };
  const matchesKeyword = (g: GatilhoRow) => {
    const kw = (g.palavraChave ?? "").trim();
    if (!kw) return false;
    const mode = g.palavraChaveModo ?? "contem";
    const t = text.toLowerCase();
    const k = kw.toLowerCase();
    try {
      switch (mode) {
        case "igual": return t.trim() === k;
        case "comeca": return t.startsWith(k);
        case "regex": return new RegExp(kw, "i").test(text);
        case "contem":
        default: return t.includes(k);
      }
    } catch { return false; }
  };
  const matchesMedia = (g: GatilhoRow) => {
    if (!params.mediaType) return false;
    const wanted = g.midiaTipo ?? "qualquer";
    return wanted === "qualquer" || wanted === params.mediaType;
  };

  for (const bot of bots) {
    let matched: GatilhoRow | null = null;
    if (bot.gatilhos.length > 0) {
      for (const g of bot.gatilhos) {
        if (!scopeMatchesLead(g, lead)) continue;
        if (!matchesChannel(g)) continue;
        if (g.kind === "palavra-chave") {
          if (matchesKeyword(g)) { matched = g; break; }
          continue;
        }
        if (g.kind === "midia-recebida") {
          if (matchesMedia(g)) { matched = g; break; }
          continue;
        }
        if (g.kind === "primeira-mensagem") {
          if (params.isFirstMessage) { matched = g; break; }
          continue;
        }
        if (g.kind === "social-dm-messenger") {
          if (canal === "messenger") { matched = g; break; }
          continue;
        }
        if (g.kind === "social-dm-instagram") {
          if (canal === "instagram") { matched = g; break; }
          continue;
        }
        if (g.kind === "mensagem-recebida") {
          // Check if it's "qualquer mensagem" (no keyword filter)
          const kw = (g.palavraChave ?? "").trim();
          if (!kw) {
            matched = g;
            break;
          }
          continue;
        }
        if (g.kind === "qualquer-conversa") {
          // A UI define este gatilho como "Nova conversa aberta (lead nunca falou antes)".
          // Portanto ele é de entrada única, não equivalente a "mensagem-recebida".
          if (params.isFirstMessage) {
            matched = g;
            break;
          }
          continue;
        }
      }
    } else {
      // Legacy support: Only fire if the legacy trigger string is explicitly "mensagem-recebida" or "qualquer-conversa"
      // and not empty. We no longer auto-fire empty triggers to avoid accidental activations.
      const t = (bot.trigger ?? "").trim().toLowerCase();
      if (t === "mensagem-recebida" || t === "qualquer-conversa") {
        // Gatilhos legados são globais, então respeitam o status 'active' apenas.
        if (lead.status === "active") {
          matched = { kind: t as any };
        }
      }
    }
    if (!matched) continue;

    await startSalesbotRun(supabaseAdmin, {
      workspaceId: params.workspaceId,
      salesbotId: bot.id,
      leadId: params.leadId,
      initialVariables: { last_message: text, trigger: matched.kind, canal },
      delaySeconds: computeDelaySecondsFromGatilho(matched),
    });
  }
}

/** Dispatcher: lead mudou de etapa. */
export async function dispatchStageChange(
  supabaseAdmin: AnySb,
  params: { workspaceId: string; leadId: string; newStageId: string; newPipelineId: string | null },
): Promise<void> {
  const bots = await loadActiveBotsWithGatilhos(supabaseAdmin, params.workspaceId);
  if (!bots.length) return;

  // Detecta ganho/perdido pelo nome da etapa.
  // IMPORTANTE: Pedido do Ruan - o status do lead NÃO muda automaticamente pelo nome da etapa.
  // O que define o comportamento é o gatilho configurado.
  // Por isso, removemos a lógica que inferia isWin/isLoss apenas pelo nome da etapa.
  // Se o usuário quer que uma etapa de 'venda perdida' execute algo, ele usa o gatilho 'movido-etapa' para aquela etapa.
  let stageName = "";
  try {
    const { data } = await supabaseAdmin
      .from("pipeline_stages")
      .select("name")
      .eq("id", params.newStageId)
      .eq("workspace_id", params.workspaceId)
      .maybeSingle();
    stageName = ((data as { name?: string } | null)?.name ?? "").toLowerCase();
  } catch { /* ignore */ }
  const isWin = false;
  const isLoss = false;

  for (const bot of bots) {
    for (const g of bot.gatilhos) {
      let shouldFire = false;
      if (g.kind === "movido-etapa") {
        if (g.stageId && g.stageId !== params.newStageId) continue;
        if (g.pipelineId && params.newPipelineId && g.pipelineId !== params.newPipelineId) continue;
        if (!g.stageId) continue;
        shouldFire = true;
      } else if (g.kind === "crm-lead-ganho" && isWin) {
        if (g.pipelineId && params.newPipelineId && g.pipelineId !== params.newPipelineId) continue;
        shouldFire = true;
      } else if (g.kind === "crm-lead-perdido" && isLoss) {
        if (g.pipelineId && params.newPipelineId && g.pipelineId !== params.newPipelineId) continue;
        shouldFire = true;
      }
      if (!shouldFire) continue;
      const runId = await startSalesbotRun(supabaseAdmin, {
        workspaceId: params.workspaceId,
        salesbotId: bot.id,
        leadId: params.leadId,
        initialVariables: { trigger: g.kind, stage_id: params.newStageId, stage_name: stageName },
        delaySeconds: computeDelaySecondsFromGatilho(g),
      });
      if (!runId) throw new Error(`Não foi possível iniciar o Salesbot ${bot.id} para a mudança de etapa.`);
      break;
    }
  }
}

/**
 * Dispatcher: entrada/saída/remoção/promoção de participante em grupo de WhatsApp.
 * O "lead" de um bot de grupo é o próprio grupo (phone = JID do grupo).
 */
export async function dispatchGroupParticipantEvent(
  supabaseAdmin: AnySb,
  params: {
    workspaceId: string;
    groupJid: string;
    participantPhone: string;
    participantName?: string | null;
    action: "add" | "leave" | "remove" | "promote" | "demote";
  },
): Promise<void> {
  const kind =
    params.action === "add" ? "grupo-novo-membro"
      : params.action === "leave" ? "grupo-membro-saiu"
        : params.action === "remove" ? "grupo-membro-removido"
          : params.action === "promote" ? "grupo-membro-promovido"
            : null;
  if (!kind) return;

  const bots = await loadActiveBotsWithGatilhos(supabaseAdmin, params.workspaceId);
  const matching = bots.filter((bot) => bot.gatilhos.some((g) => g.kind === kind));
  if (matching.length === 0) return;

  // Lead do grupo é identificado pelo JID real completo. Nunca fazemos
  // fallback para um campo numérico que possa coincidir com uma identidade X1.
  if (!params.groupJid.endsWith("@g.us")) return;
  const { data: leadRow } = await supabaseAdmin.from("leads")
    .select("id")
    .eq("workspace_id", params.workspaceId)
    .eq("phone", params.groupJid)
    .limit(1)
    .maybeSingle();
  const leadId = (leadRow as { id?: string } | null)?.id ?? null;
  if (!leadId) return;

  for (const bot of matching) {
    const g = bot.gatilhos.find((x) => x.kind === kind)!;
    await startSalesbotRun(supabaseAdmin, {
      workspaceId: params.workspaceId,
      salesbotId: bot.id,
      leadId,
      initialVariables: {
        trigger: kind,
        grupo_jid: params.groupJid,
        participante_telefone: params.participantPhone,
        participante_nome: params.participantName ?? "",
      },
      delaySeconds: computeDelaySecondsFromGatilho(g),
    });
  }
}

/** Dispatcher: formulário do CRM submetido. */

export async function dispatchFormSubmitted(
  supabaseAdmin: AnySb,
  params: { workspaceId: string; leadId: string | null; formId: string; origem?: "mkton" | "externo" | "meta" },
): Promise<void> {
  if (!params.leadId) return;
  const bots = await loadActiveBotsWithGatilhos(supabaseAdmin, params.workspaceId);
  if (!bots.length) return;
  const lead = await loadLead(supabaseAdmin, params.leadId, params.workspaceId);
  if (!lead) return;
  for (const bot of bots) {
    for (const g of bot.gatilhos) {
      if (g.kind !== "formulario-enviado") continue;
      // Filtra por formulário específico e/ou origem (MKTOn, site externo, Meta)
      if (g.formularioId && g.formularioId !== params.formId) continue;
      if (
        g.formularioOrigem &&
        g.formularioOrigem !== "qualquer" &&
        params.origem &&
        g.formularioOrigem !== params.origem
      ) continue;
      if (!scopeMatchesLead(g, lead)) continue;
      await startSalesbotRun(supabaseAdmin, {
        workspaceId: params.workspaceId,
        salesbotId: bot.id,
        leadId: params.leadId,
        initialVariables: { trigger: "formulario-enviado", form_id: params.formId, form_origem: params.origem ?? "mkton" },
        delaySeconds: computeDelaySecondsFromGatilho(g),
      });
      break;
    }
  }
}

/** Dispatcher: campo personalizado do lead alterado. */
export async function dispatchCustomFieldChanged(
  supabaseAdmin: AnySb,
  params: { workspaceId: string; leadId: string; fieldId: string; fieldName?: string; value?: string },
): Promise<void> {
  const bots = await loadActiveBotsWithGatilhos(supabaseAdmin, params.workspaceId);
  if (!bots.length) return;
  const lead = await loadLead(supabaseAdmin, params.leadId, params.workspaceId);
  if (!lead) return;
  const fname = (params.fieldName ?? "").toLowerCase();
  for (const bot of bots) {
    for (const g of bot.gatilhos) {
      if (g.kind !== "campo-alterado") continue;
      const wanted = (g.campoNome ?? "").toLowerCase().trim();
      const wantedId = (g.campoId ?? "").trim();
      if (wantedId && wantedId !== params.fieldId) continue;
      if (!wantedId && wanted && wanted !== fname) continue;
      if (g.campoValor && params.value && g.campoValor !== params.value) continue;
      if (!scopeMatchesLead(g, lead)) continue;
      await startSalesbotRun(supabaseAdmin, {
        workspaceId: params.workspaceId,
        salesbotId: bot.id,
        leadId: params.leadId,
        initialVariables: { trigger: "campo-alterado", field_id: params.fieldId, field_name: params.fieldName ?? "", value: params.value ?? "" },
        delaySeconds: computeDelaySecondsFromGatilho(g),
      });
      break;
    }
  }
}

/** Dispatcher: novo lead vindo de anúncio Meta. */
export async function dispatchMetaLeadAd(
  supabaseAdmin: AnySb,
  params: { workspaceId: string; leadId: string; campaignId?: string | null; adId?: string | null },
): Promise<void> {
  const bots = await loadActiveBotsWithGatilhos(supabaseAdmin, params.workspaceId);
  if (!bots.length) return;
  const lead = await loadLead(supabaseAdmin, params.leadId, params.workspaceId);
  if (!lead) return;
  for (const bot of bots) {
    for (const g of bot.gatilhos) {
      if (g.kind !== "trafego-lead-anuncio") continue;
      if (g.campanhaId && params.campaignId && g.campanhaId !== params.campaignId) continue;
      if (!scopeMatchesLead(g, lead)) continue;
      await startSalesbotRun(supabaseAdmin, {
        workspaceId: params.workspaceId,
        salesbotId: bot.id,
        leadId: params.leadId,
        initialVariables: {
          trigger: "trafego-lead-anuncio",
          campaign_id: params.campaignId ?? "",
          ad_id: params.adId ?? "",
        },
        delaySeconds: computeDelaySecondsFromGatilho(g),
      });
      break;
    }
  }
}

/** Dispatcher: webhook enviado pelo sistema para um serviço externo. */
export async function dispatchWebhookSent(
  supabaseAdmin: AnySb,
  params: { workspaceId: string; url: string; leadId?: string | null; status?: number },
): Promise<void> {
  const bots = await loadActiveBotsWithGatilhos(supabaseAdmin, params.workspaceId);
  if (!bots.length) return;
  const leadId = params.leadId ?? null;
  if (!leadId) return; // webhook-enviado só dispara em contexto de lead
  for (const bot of bots) {
    for (const g of bot.gatilhos) {
      if (g.kind !== "webhook-enviado") continue;
      if (g.webhookUrl && g.webhookUrl.trim() && g.webhookUrl.trim() !== params.url) continue;
      await startSalesbotRun(supabaseAdmin, {
        workspaceId: params.workspaceId,
        salesbotId: bot.id,
        leadId,
        initialVariables: { trigger: "webhook-enviado", url: params.url, status: String(params.status ?? "") },
        delaySeconds: computeDelaySecondsFromGatilho(g),
      });
      break;
    }
  }
}

/** Dispatcher: uma ou mais tags foram adicionadas ao lead. */
export async function dispatchTagAdded(
  supabaseAdmin: AnySb,
  params: { workspaceId: string; leadId: string; tags: string[] },
): Promise<void> {
  if (!params.tags.length) return;
  const bots = await loadActiveBotsWithGatilhos(supabaseAdmin, params.workspaceId);
  if (!bots.length) return;
  const lead = await loadLead(supabaseAdmin, params.leadId, params.workspaceId);
  if (!lead) return;
  const normalized = params.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  for (const bot of bots) {
    for (const g of bot.gatilhos) {
      if (g.kind !== "tag-adicionada") continue;
      const wanted = (g.tag ?? "").trim().toLowerCase();
      if (!wanted || !normalized.includes(wanted)) continue;
      if (!scopeMatchesLead(g, lead)) continue;
      await startSalesbotRun(supabaseAdmin, {
        workspaceId: params.workspaceId,
        salesbotId: bot.id,
        leadId: params.leadId,
        initialVariables: { trigger: "tag-adicionada", tag: wanted },
        delaySeconds: computeDelaySecondsFromGatilho(g),
      });
      break;
    }
  }
}

/** Dispatcher: novo lead criado. */
export async function dispatchLeadCreated(
  supabaseAdmin: AnySb,
  params: { workspaceId: string; leadId: string },
): Promise<void> {
  const bots = await loadActiveBotsWithGatilhos(supabaseAdmin, params.workspaceId);
  if (!bots.length) return;
  const lead = await loadLead(supabaseAdmin, params.leadId, params.workspaceId);
  if (!lead) return;
  for (const bot of bots) {
    for (const g of bot.gatilhos) {
      if (g.kind !== "crm-lead-criado") continue;
      if (!scopeMatchesLead(g, lead)) continue;
      await startSalesbotRun(supabaseAdmin, {
        workspaceId: params.workspaceId,
        salesbotId: bot.id,
        leadId: params.leadId,
        initialVariables: { trigger: "crm-lead-criado" },
        delaySeconds: computeDelaySecondsFromGatilho(g),
      });
      break;
    }
  }
}

/** Dispatcher: comentário ou menção em rede social (FB/IG). Cria run com
 *  initialVariables carregando comment_id/media_id/page_id p/ auto-reply. */
export async function dispatchSocialInteraction(
  supabaseAdmin: AnySb,
  params: {
    workspaceId: string;
    leadId: string;
    network: "facebook" | "instagram";
    kind: "comentario" | "mencao";
    text?: string | null;
    commentId?: string | null;
    mediaId?: string | null;
    pageId?: string | null;
    fromId?: string | null;
    fromName?: string | null;
    permalink?: string | null;
  },
): Promise<void> {
  const bots = await loadActiveBotsWithGatilhos(supabaseAdmin, params.workspaceId);
  if (!bots.length) return;
  const lead = await loadLead(supabaseAdmin, params.leadId, params.workspaceId);
  if (!lead) return;

  const wanted: GatilhoRow["kind"] =
    params.kind === "comentario"
      ? (params.network === "facebook" ? "social-comentario-facebook" : "social-comentario-instagram")
      : (params.network === "facebook" ? "social-mencao-facebook" : "social-mencao-instagram");

  for (const bot of bots) {
    for (const g of bot.gatilhos) {
      if (g.kind !== wanted) continue;
      if (!scopeMatchesLead(g, lead)) continue;
      await startSalesbotRun(supabaseAdmin, {
        workspaceId: params.workspaceId,
        salesbotId: bot.id,
        leadId: params.leadId,
        initialVariables: {
          trigger: wanted,
          canal: params.network,
          comment_id: params.commentId ?? "",
          media_id: params.mediaId ?? "",
          page_id: params.pageId ?? "",
          from_id: params.fromId ?? "",
          from_name: params.fromName ?? "",
          permalink: params.permalink ?? "",
          text: params.text ?? "",
        },
        delaySeconds: computeDelaySecondsFromGatilho(g),
      });
      break;
    }
  }
}



/**
 * Dispatcher: evento do pixel/tracking (KPI do site) chegou para um lead
 * identificado. Cobre os gatilhos da área "tracking".
 */
export async function dispatchTrackingEvent(
  supabaseAdmin: AnySb,
  params: {
    workspaceId: string;
    leadId: string;
    eventName: string;
    siteId?: string | null;
    value?: number | null;
    pageUrl?: string | null;
    pagePath?: string | null;
    isFirstVisit?: boolean;
    isHotVisit?: boolean;
  },
): Promise<void> {
  const bots = await loadActiveBotsWithGatilhos(supabaseAdmin, params.workspaceId);
  if (!bots.length) return;
  const lead = await loadLead(supabaseAdmin, params.leadId, params.workspaceId);
  if (!lead) return;

  const evt = (params.eventName ?? "").trim().toLowerCase();
  const url = `${params.pageUrl ?? ""} ${params.pagePath ?? ""}`.toLowerCase();

  for (const bot of bots) {
    for (const g of bot.gatilhos) {
      if (g.kind !== "tracking-conversao"
        && g.kind !== "tracking-visita-quente"
        && g.kind !== "tracking-primeiro-acesso"
        && g.kind !== "tracking-abandono-formulario") continue;

      if (g.kind === "tracking-primeiro-acesso" && !params.isFirstVisit) continue;
      if (g.kind === "tracking-visita-quente" && !params.isHotVisit) continue;
      if (g.kind === "tracking-abandono-formulario" && evt !== "form_abandon" && evt !== "abandono_formulario") continue;

      if (g.trackingSiteId && params.siteId && g.trackingSiteId !== params.siteId) continue;

      const wantedEvt = (g.trackingEvento ?? g.conversaoTipo ?? "").trim().toLowerCase();
      if (g.kind === "tracking-conversao") {
        if (!wantedEvt) continue;
        if (wantedEvt !== "qualquer" && wantedEvt !== evt) continue;
      } else if (wantedEvt && wantedEvt !== "qualquer" && wantedEvt !== evt) {
        continue;
      }

      const min = typeof g.trackingValorMin === "number" ? g.trackingValorMin : null;
      if (min !== null && min > 0 && (params.value ?? 0) < min) continue;

      const urlContem = (g.trackingUrlContem ?? "").trim().toLowerCase();
      if (urlContem && !url.includes(urlContem)) continue;

      if (!scopeMatchesLead(g, lead)) continue;

      await startSalesbotRun(supabaseAdmin, {
        workspaceId: params.workspaceId,
        salesbotId: bot.id,
        leadId: params.leadId,
        initialVariables: {
          trigger: g.kind,
          tracking_evento: params.eventName ?? "",
          tracking_valor: String(params.value ?? ""),
          tracking_url: params.pageUrl ?? "",
          tracking_pagina: params.pagePath ?? "",
        },
        delaySeconds: computeDelaySecondsFromGatilho(g),
      });
      break;
    }
  }
}

// SLIM_PROMPT_ONLY_V1

// SLIM_INBOUND_OWNER_V1

// SLIM_ERROR_LOG_BOUND_V1

// SLIM_WHATSAPP_ORIGIN_V1
