import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REPORT_PRESET_REGEX } from "@/lib/meta-report-presets";

async function assertMember(supabase: any, workspaceId: string, userId: string) {
  const { data, error } = await supabase.from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso ao workspace.");
}

function safeFilename(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "relatorio-mkton";
}

export const exportScheduledReportPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    workspaceId: z.string().uuid(),
    reportId: z.string().uuid(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { data: row, error } = await context.supabase.from("scheduled_reports")
      .select("*")
      .eq("id", data.reportId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Relatório não encontrado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { renderReport } = await import("./meta-reports-core.server");
    const { reportPdfBase64 } = await import("./meta-report-pdf.server");
    const rendered = await renderReport(supabaseAdmin, {
      id: row.id,
      workspace_id: row.workspace_id,
      name: row.name,
      preset: row.preset,
      channels: row.channels ?? [],
      recipients_email: row.recipients_email ?? [],
      recipients_whatsapp: row.recipients_whatsapp ?? [],
      include_ai_suggestions: row.include_ai_suggestions,
      title_template: row.title_template,
      intro_text: row.intro_text,
      footer_text: row.footer_text,
      selected_kpis: Array.isArray(row.selected_kpis) ? row.selected_kpis : null,
    });
    return {
      filename: `${safeFilename(row.name)}-${new Date().toISOString().slice(0, 10)}.pdf`,
      mimeType: "application/pdf",
      base64: reportPdfBase64({ title: rendered.subject, text: rendered.text }),
    };
  });

export const exportAdhocReportPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    workspaceId: z.string().uuid(),
    name: z.string().min(1).max(120).default("Relatório rápido"),
    preset: z.string().regex(REPORT_PRESET_REGEX).default("last_7d"),
    includeAiSuggestions: z.boolean().default(true),
    titleTemplate: z.string().max(200).nullable().optional(),
    introText: z.string().max(1000).nullable().optional(),
    footerText: z.string().max(500).nullable().optional(),
    selectedKpis: z.array(z.string().max(80)).max(60).nullable().optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { renderReport } = await import("./meta-reports-core.server");
    const { reportPdfBase64 } = await import("./meta-report-pdf.server");
    const rendered = await renderReport(supabaseAdmin, {
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
    });
    return {
      filename: `${safeFilename(data.name)}-${new Date().toISOString().slice(0, 10)}.pdf`,
      mimeType: "application/pdf",
      base64: reportPdfBase64({ title: rendered.subject, text: rendered.text }),
    };
  });
