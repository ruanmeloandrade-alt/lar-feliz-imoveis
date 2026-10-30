import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizeOptions, type AutomationOptions, type ExternalProvider } from "./external-automations-events";

type AnySb = { from: (t: string) => any; rpc?: (...a: unknown[]) => unknown };

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  const wsId = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!wsId) throw new Error("Workspace ativo não encontrado.");
  return wsId;
}

const providerSchema = z.enum(["n8n", "make", "zapier", "custom"]);

export interface ExternalAutomationDTO {
  id: string;
  provider: ExternalProvider;
  status: string;
  outboundUrl: string | null;
  selectedEvents: string[];
  inboundToken: string;
  inboundSecret: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  options: AutomationOptions;
}

function toDTO(row: Record<string, unknown>): ExternalAutomationDTO {
  return {
    id: row.id as string,
    provider: row.provider as ExternalProvider,
    status: (row.status as string) ?? "disconnected",
    outboundUrl: (row.outbound_url as string | null) ?? null,
    selectedEvents: Array.isArray(row.selected_events) ? (row.selected_events as string[]) : [],
    inboundToken: row.inbound_token as string,
    inboundSecret: row.inbound_secret as string,
    lastSuccessAt: (row.last_success_at as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    options: normalizeOptions((row.metadata as Record<string, unknown> | null)?.options, row.provider as ExternalProvider),
  };
}

/** Lê a config atual do workspace para um provider (ou null). */
export const getExternalAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ provider: providerSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: row } = await sb
      .from("external_automations")
      .select("*")
      .eq("workspace_id", wsId)
      .eq("provider", data.provider)
      .maybeSingle();
    return row ? toDTO(row as Record<string, unknown>) : null;
  });

/** Cria ou atualiza a config (upsert por workspace+provider). */
export const upsertExternalAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    provider: providerSchema,
    outboundUrl: z.string().url().nullable().optional(),
    selectedEvents: z.array(z.string()).max(200).optional(),
    connected: z.boolean().optional(),
    options: z.object({
      signOutbound: z.boolean(),
      authHeaderName: z.string().max(80),
      authHeaderValue: z.string().max(500),
      extraHeaders: z.array(z.object({ key: z.string().max(80), value: z.string().max(500) })).max(10),
      retries: z.number().min(0).max(3),
      requireInboundSignature: z.boolean(),
    }).partial().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { generateInboundToken, generateSecret } = await import("./external-automations.server");

    const { data: existing } = await sb
      .from("external_automations")
      .select("*")
      .eq("workspace_id", wsId)
      .eq("provider", data.provider)
      .maybeSingle();

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.outboundUrl !== undefined) patch.outbound_url = data.outboundUrl;
    if (data.selectedEvents !== undefined) patch.selected_events = data.selectedEvents;
    if (data.connected !== undefined) patch.status = data.connected ? "connected" : "disconnected";
    if (data.options !== undefined) {
      const prevMeta = ((existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
      patch.metadata = { ...prevMeta, options: normalizeOptions({ ...(prevMeta.options as object ?? {}), ...data.options }, data.provider) };
    }

    if (existing) {
      const { data: updated, error } = await sb
        .from("external_automations")
        .update(patch)
        .eq("id", (existing as { id: string }).id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return toDTO(updated as Record<string, unknown>);
    }

    const { data: inserted, error } = await sb
      .from("external_automations")
      .insert({
        workspace_id: wsId,
        provider: data.provider,
        outbound_url: data.outboundUrl ?? null,
        selected_events: data.selectedEvents ?? [],
        status: data.connected ? "connected" : "disconnected",
        inbound_token: generateInboundToken(),
        inbound_secret: generateSecret(),
        metadata: { options: normalizeOptions(data.options ?? {}, data.provider) },
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return toDTO(inserted as Record<string, unknown>);
  });

/** Regenera token+secret inbound (invalida webhook anterior). */
export const rotateExternalAutomationSecrets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ provider: providerSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { generateInboundToken, generateSecret } = await import("./external-automations.server");
    const { data: row, error } = await sb
      .from("external_automations")
      .update({
        inbound_token: generateInboundToken(),
        inbound_secret: generateSecret(),
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", wsId)
      .eq("provider", data.provider)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Config não encontrada. Salve primeiro.");
    return toDTO(row as Record<string, unknown>);
  });

/** Dispara um evento de teste para validar a integração. */
export const testExternalAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    provider: providerSchema,
    event: z.string().max(80).optional(),
    payloadJson: z.string().max(20000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { dispatchExternalEvent } = await import("./external-automations.server");
    let payload: Record<string, unknown> = { message: "Ping de teste do Vanessa Simoni", ts: new Date().toISOString() };
    if (data.payloadJson && data.payloadJson.trim()) {
      try {
        const parsed = JSON.parse(data.payloadJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
        else throw new Error("O JSON de teste precisa ser um objeto.");
      } catch (e) {
        throw new Error(e instanceof Error ? `JSON inválido: ${e.message}` : "JSON inválido.");
      }
    }
    await dispatchExternalEvent({
      workspaceId: wsId,
      event: data.event?.trim() || "mkton.test",
      provider: data.provider,
      payload,
      force: true,
    });
    return { ok: true };
  });

/** Remove a configuração do provider (desconecta de vez). */
export const deleteExternalAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ provider: providerSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb
      .from("external_automations")
      .delete()
      .eq("workspace_id", wsId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Últimos logs da automação (in + out). */
export const listExternalAutomationLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    provider: providerSchema,
    limit: z.number().min(1).max(200).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: rows } = await sb
      .from("external_automation_logs")
      .select("id, direction, event, http_status, status, error, occurred_at, payload")
      .eq("workspace_id", wsId)
      .eq("provider", data.provider)
      .order("occurred_at", { ascending: false })
      .limit(data.limit ?? 50);
    return (rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      direction: r.direction as string,
      event: r.event as string,
      httpStatus: (r.http_status as number | null) ?? null,
      status: r.status as string,
      error: (r.error as string | null) ?? null,
      occurredAt: r.occurred_at as string,
      payloadJson: r.payload ? JSON.stringify(r.payload) : null,
    }));
  });
