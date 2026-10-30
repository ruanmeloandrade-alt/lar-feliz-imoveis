import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderTrafficReportPdf } from "../meta-report-pdf.server";

const panel = readFileSync("src/components/meta/MetaReportsPanelV2.tsx", "utf8");
const publicPanel = readFileSync("src/components/meta/MetaReportsPanel.tsx", "utf8");
const functions = readFileSync("src/lib/meta-reports.functions.ts", "utf8");
const core = readFileSync("src/lib/meta-reports-core.server.ts", "utf8");
const pdfFunctions = readFileSync("src/lib/meta-report-pdf.functions.ts", "utf8");

describe("Gestor de Tráfego Task 15 — relatórios agendados", () => {
  it("mantém o import público do painel e habilita WhatsApp + e-mail", () => {
    expect(publicPanel).toContain("MetaReportsPanelV2 as MetaReportsPanel");
    expect(panel).toContain('type Channel = "whatsapp" | "email"');
    expect(panel).toContain('toggleChannel("whatsapp")');
    expect(panel).toContain('toggleChannel("email")');
    expect(panel).toContain("recipientsEmail: emails");
    expect(panel).toContain("recipientsWhatsapp: phones");
  });

  it("reaproveita o executor real já existente para os dois canais", () => {
    expect(functions).toContain('channels: z.array(z.enum(["email", "whatsapp"]))');
    expect(core).toContain('row.channels.includes("email")');
    expect(core).toContain('row.channels.includes("whatsapp")');
    expect(core).toContain("await sendEmail(row.recipients_email, subject, html)");
    expect(core).toContain("await sendWhatsApp(supabase, row.workspace_id, row.recipients_whatsapp, text)");
  });

  it("gera PDF real a partir do mesmo relatório sem dependência externa", () => {
    const pdf = renderTrafficReportPdf({ title: "Resumo Meta", text: "Investido: R$ 100\nLeads: 10" });
    const decoded = Buffer.from(pdf).toString("latin1");
    expect(decoded.startsWith("%PDF-1.4")).toBe(true);
    expect(decoded).toContain("xref");
    expect(decoded).toContain("/Type /Catalog");
    expect(pdfFunctions).toContain("renderReport(supabaseAdmin");
    expect(panel).toContain("exportScheduledReportPdf");
  });

  it("registra entrega parcial por canal sem transformar falha em sucesso", () => {
    expect(core).toContain('status: error ? (okCh.length ? "partial" : "error") : "ok"');
    expect(core).toContain("channels_ok: okCh");
    expect(panel).toContain("Entrega parcial/falhou");
  });
});
