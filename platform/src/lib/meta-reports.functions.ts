import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REPORT_PRESET_REGEX } from "@/lib/meta-report-presets";

const ReportInput = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(2).max(120),
  enabled: z.boolean().default(true),
  frequency: z.enum(["daily", "weekly", "biweekly", "monthly"]).default("daily"),
  preset: z.string().regex(REPORT_PRESET_REGEX, "Preset inválido").default("last_7d"),
  channels: z.array(z.enum(["email", "whatsapp"])).default(["whatsapp"]),
  recipientsEmail: z.array(z.string().email()).default([]),
  recipientsWhatsapp: z.array(z.string().regex(/^\d{10,15}$/, "Número inválido: use DDI+DDD+número, só dígitos.")).default([]),
  timezone: z.string().default("America/Sao_Paulo"),
  sendHourLocal: z.number().int().min(0).max(23).default(8),
  sendMinuteLocal: z.number().int().min(0).max(59).default(0),
  weeklyDay: z.number().int().min(0).max(6).default(1),
  includeAiSuggestions: z.boolean().default(true),
  titleTemplate: z.string().max(200).nullable().optional(),
  introText: z.string().max(1000).nullable().optional(),
  footerText: z.string().max(500).nullable().optional(),
  selectedKpis: z.array(z.string().max(80)).max(60).nullable().optional(),
});

async function assertMember(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, workspaceId: string, userId: string,
) {
  const { data, error } = await supabase.from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso ao workspace.");
}

export const listScheduledReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { data: rows, error } = await context.supabase
      .from("scheduled_reports").select("*")
      .eq("workspace_id", data.workspaceId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { reports: rows ?? [] };
  });

export const upsertScheduledReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReportInput.extend({ id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { computeNextRunAt } = await import("./meta-reports-core.server");
    // Bloqueia o próprio número do WhatsApp conectado (evitar auto-envio)
    if (data.recipientsWhatsapp.length > 0) {
      const { data: sess } = await context.supabase
        .from("whatsapp_web_sessions")
        .select("phone_number")
        .eq("workspace_id", data.workspaceId)
        .eq("status", "conectado");
      const own = new Set(
        ((sess ?? []) as Array<{ phone_number: string | null }>)
          .map((s) => (s.phone_number ?? "").replace(/\D/g, ""))
          .filter(Boolean),
      );
      const conflict = data.recipientsWhatsapp.find((n) => own.has(n.replace(/\D/g, "")));
      if (conflict) {
        throw new Error(`O número ${conflict} é o mesmo número da plataforma. Cadastre um número diferente para receber o relatório.`);
      }
    }
    const nextRun = computeNextRunAt(data.frequency, data.timezone, data.sendHourLocal, data.sendMinuteLocal, data.weeklyDay);
    const payload = {
      workspace_id: data.workspaceId,
      name: data.name, enabled: data.enabled,
      frequency: data.frequency, preset: data.preset,
      channels: data.channels,
      recipients_email: data.recipientsEmail,
      recipients_whatsapp: data.recipientsWhatsapp,
      timezone: data.timezone, send_hour_local: data.sendHourLocal, send_minute_local: data.sendMinuteLocal, weekly_day: data.weeklyDay,
      include_ai_suggestions: data.includeAiSuggestions,
      title_template: data.titleTemplate ?? null,
      intro_text: data.introText ?? null,
      footer_text: data.footerText ?? null,
      selected_kpis: data.selectedKpis ?? null,
      next_run_at: nextRun,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("scheduled_reports")
        .update(payload).eq("id", data.id).eq("workspace_id", data.workspaceId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("scheduled_reports")
      .insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteScheduledReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { error } = await context.supabase.from("scheduled_reports")
      .delete().eq("id", data.id).eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runScheduledReportNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { data: row, error } = await context.supabase
      .from("scheduled_reports").select("*")
      .eq("id", data.id).eq("workspace_id", data.workspaceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Relatório não encontrado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { executeReport } = await import("./meta-reports-core.server");
    const res = await executeReport(supabaseAdmin, {
      id: row.id, workspace_id: row.workspace_id, name: row.name, preset: row.preset,
      channels: row.channels, recipients_email: row.recipients_email,
      recipients_whatsapp: row.recipients_whatsapp,
      include_ai_suggestions: row.include_ai_suggestions,
      title_template: row.title_template,
      intro_text: row.intro_text,
      footer_text: row.footer_text,
      selected_kpis: Array.isArray(row.selected_kpis) ? (row.selected_kpis as string[]) : null,
    });
    await supabaseAdmin.from("scheduled_reports").update({
      last_run_at: new Date().toISOString(),
      last_status: res.error ? "error" : "ok",
      last_error: res.error ?? null,
    }).eq("id", row.id);
    return res;
  });

export const listScheduledReportRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid(), reportId: z.string().uuid(), limit: z.number().int().min(1).max(50).default(20) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { data: rows, error } = await context.supabase
      .from("scheduled_report_runs").select("*")
      .eq("workspace_id", data.workspaceId).eq("report_id", data.reportId)
      .order("ran_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error(error.message);
    return { runs: rows ?? [] };
  });

export const listAllReportRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { data: rows, error } = await context.supabase
      .from("scheduled_report_runs")
      .select("id, report_id, status, ran_at, error, channels_ok, name, preset, kind, recipients_whatsapp, totals")
      .eq("workspace_id", data.workspaceId)
      .order("ran_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error(error.message);
    // Preenche nome quando o registro é antigo (sem snapshot) buscando dos relatórios
    const missingIds = Array.from(new Set((rows ?? [])
      .filter((r) => !r.name && r.report_id)
      .map((r) => r.report_id as string)));
    let nameMap: Record<string, { name: string; preset: string | null }> = {};
    if (missingIds.length) {
      const { data: reps } = await context.supabase
        .from("scheduled_reports").select("id, name, preset").in("id", missingIds);
      nameMap = Object.fromEntries((reps ?? []).map((r: { id: string; name: string; preset: string | null }) => [r.id, { name: r.name, preset: r.preset }]));
    }
    const runs = (rows ?? []).map((r) => ({
      ...r,
      name: r.name ?? (r.report_id ? nameMap[r.report_id as string]?.name ?? "Relatório" : "Relatório rápido"),
      preset: r.preset ?? (r.report_id ? nameMap[r.report_id as string]?.preset ?? null : null),
    }));
    return { runs };
  });

export const getOwnConnectedWhatsappNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { data: rows } = await context.supabase
      .from("whatsapp_web_sessions").select("phone_number, status")
      .eq("workspace_id", data.workspaceId).eq("status", "conectado");
    const numbers = ((rows ?? []) as Array<{ phone_number: string | null }>)
      .map((r) => (r.phone_number ?? "").replace(/\D/g, ""))
      .filter(Boolean);
    return { numbers };
  });

export const runAdhocReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    name: z.string().min(1).max(120).default("Relatório rápido"),
    preset: z.string().regex(REPORT_PRESET_REGEX, "Preset inválido").default("last_7d"),
    recipientsWhatsapp: z.array(z.string().regex(/^\d{10,15}$/, "Número inválido: use DDI+DDD+número, só dígitos.")).min(1),
    includeAiSuggestions: z.boolean().default(true),
    titleTemplate: z.string().max(200).nullable().optional(),
    introText: z.string().max(1000).nullable().optional(),
    footerText: z.string().max(500).nullable().optional(),
    selectedKpis: z.array(z.string().max(80)).max(60).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { data: sess } = await context.supabase
      .from("whatsapp_web_sessions").select("phone_number")
      .eq("workspace_id", data.workspaceId).eq("status", "conectado");
    const own = new Set(
      ((sess ?? []) as Array<{ phone_number: string | null }>)
        .map((s) => (s.phone_number ?? "").replace(/\D/g, "")).filter(Boolean),
    );
    const conflict = data.recipientsWhatsapp.find((n) => own.has(n.replace(/\D/g, "")));
    if (conflict) {
      throw new Error(`O número ${conflict} é o mesmo número da plataforma. Use um número diferente.`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { executeReport } = await import("./meta-reports-core.server");
    const row = {
      id: "adhoc",
      workspace_id: data.workspaceId,
      name: data.name,
      preset: data.preset,
      channels: ["whatsapp"],
      recipients_email: [],
      recipients_whatsapp: data.recipientsWhatsapp,
      include_ai_suggestions: data.includeAiSuggestions,
      title_template: data.titleTemplate ?? null,
      intro_text: data.introText ?? null,
      footer_text: data.footerText ?? null,
      selected_kpis: data.selectedKpis ?? null,
    };
    const res = await executeReport(supabaseAdmin, row);
    if (res.error && !res.whatsapp) return { ok: false, error: res.error };
    return { ok: true, totals: res.totals, warning: res.error ?? null };
  });

export const previewReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    name: z.string().min(1).max(120).default("Relatório"),
    preset: z.string().regex(REPORT_PRESET_REGEX, "Preset inválido").default("last_7d"),
    includeAiSuggestions: z.boolean().default(true),
    titleTemplate: z.string().max(200).nullable().optional(),
    introText: z.string().max(1000).nullable().optional(),
    footerText: z.string().max(500).nullable().optional(),
    selectedKpis: z.array(z.string().max(80)).max(60).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { renderReport } = await import("./meta-reports-core.server");
    const row = {
      id: "preview",
      workspace_id: data.workspaceId,
      name: data.name,
      preset: data.preset,
      channels: [],
      recipients_email: [],
      recipients_whatsapp: [],
      include_ai_suggestions: data.includeAiSuggestions,
      title_template: data.titleTemplate ?? null,
      intro_text: data.introText ?? null,
      footer_text: data.footerText ?? null,
      selected_kpis: data.selectedKpis ?? null,
    };
    const { subject, html, text, totals } = await renderReport(supabaseAdmin, row);
    return { subject, html, text, totals };
  });

