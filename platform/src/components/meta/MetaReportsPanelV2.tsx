import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, FileDown, History, Loader2, Mail, MessageCircle, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  deleteScheduledReport,
  getOwnConnectedWhatsappNumbers,
  listScheduledReportRuns,
  listScheduledReports,
  runScheduledReportNow,
  upsertScheduledReport,
} from "@/lib/meta-reports.functions";
import { exportScheduledReportPdf } from "@/lib/meta-report-pdf.functions";
import { reportPresetLabel } from "@/lib/meta-report-presets";
import { ReportDateRangePicker } from "@/components/meta/ReportDateRangePicker";
import { getUserTimeZone } from "@/lib/preferences";

type Channel = "whatsapp" | "email";
type Frequency = "daily" | "weekly" | "biweekly" | "monthly";
type Form = {
  id?: string;
  name: string;
  enabled: boolean;
  frequency: Frequency;
  preset: string;
  channels: Channel[];
  recipientsWhatsapp: string;
  recipientsEmail: string;
  timezone: string;
  sendHourLocal: number;
  sendMinuteLocal: number;
  weeklyDay: number;
  includeAiSuggestions: boolean;
};

const frequencies: Array<{ value: Frequency; label: string }> = [
  { value: "daily", label: "Diário" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "monthly", label: "Mensal" },
];
const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const defaultForm = (): Form => ({
  name: "",
  enabled: true,
  frequency: "daily",
  preset: "yesterday",
  channels: ["whatsapp"],
  recipientsWhatsapp: "",
  recipientsEmail: "",
  timezone: typeof window === "undefined" ? "America/Sao_Paulo" : getUserTimeZone(),
  sendHourLocal: 8,
  sendMinuteLocal: 0,
  weeklyDay: 1,
  includeAiSuggestions: true,
});

function normalizePhone(value: string) { return value.replace(/\D/g, ""); }
function splitPhones(value: string) { return value.split(/[,\s]+/).map(normalizePhone).filter(Boolean); }
function splitEmails(value: string) { return value.split(/[,;\s]+/).map((v) => v.trim().toLowerCase()).filter(Boolean); }
function pad2(value: number) { return String(value).padStart(2, "0"); }

function downloadBase64(filename: string, mimeType: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ChannelCard({ active, icon, title, description, onClick }: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition ${active ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/40"}`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">{icon}{title}{active && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{description}</div>
    </button>
  );
}

export function MetaReportsPanelV2({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listScheduledReports);
  const saveFn = useServerFn(upsertScheduledReport);
  const deleteFn = useServerFn(deleteScheduledReport);
  const runFn = useServerFn(runScheduledReportNow);
  const historyFn = useServerFn(listScheduledReportRuns);
  const ownNumbersFn = useServerFn(getOwnConnectedWhatsappNumbers);
  const pdfFn = useServerFn(exportScheduledReportPdf);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(defaultForm());
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const reportsQ = useQuery({
    queryKey: ["meta-reports", workspaceId],
    queryFn: () => listFn({ data: { workspaceId } }),
  });
  const ownNumbersQ = useQuery({
    queryKey: ["meta-reports-own-numbers", workspaceId],
    queryFn: () => ownNumbersFn({ data: { workspaceId } }),
    staleTime: 60_000,
  });
  const historyQ = useQuery({
    queryKey: ["meta-report-runs", workspaceId, historyFor],
    queryFn: () => historyFn({ data: { workspaceId, reportId: historyFor!, limit: 20 } }),
    enabled: Boolean(historyFor),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Dê um nome ao relatório.");
      if (form.channels.length === 0) throw new Error("Selecione ao menos um canal de entrega.");
      const phones = splitPhones(form.recipientsWhatsapp);
      const emails = splitEmails(form.recipientsEmail);
      if (form.channels.includes("whatsapp") && phones.length === 0) throw new Error("Adicione ao menos um destinatário de WhatsApp.");
      if (form.channels.includes("email") && emails.length === 0) throw new Error("Adicione ao menos um destinatário de e-mail.");
      const own = new Set(ownNumbersQ.data?.numbers ?? []);
      const conflict = phones.find((phone) => own.has(phone));
      if (conflict) throw new Error(`O número ${conflict} é o mesmo número conectado à plataforma.`);
      await saveFn({ data: {
        workspaceId,
        id: form.id,
        name: form.name.trim(),
        enabled: form.enabled,
        frequency: form.frequency,
        preset: form.preset,
        channels: form.channels,
        recipientsEmail: emails,
        recipientsWhatsapp: phones,
        timezone: form.timezone,
        sendHourLocal: form.sendHourLocal,
        sendMinuteLocal: form.sendMinuteLocal,
        weeklyDay: form.weeklyDay,
        includeAiSuggestions: form.includeAiSuggestions,
        titleTemplate: null,
        introText: null,
        footerText: null,
        selectedKpis: null,
      } });
    },
    onSuccess: () => {
      toast.success("Relatório salvo com os canais selecionados.");
      setOpen(false);
      setForm(defaultForm());
      qc.invalidateQueries({ queryKey: ["meta-reports", workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runMut = useMutation({
    mutationFn: (id: string) => runFn({ data: { workspaceId, id } }),
    onSuccess: (result) => {
      if (result.error) toast.warning(`Entrega parcial/falhou: ${result.error}`);
      else toast.success(`Relatório entregue${result.email && result.whatsapp ? " por WhatsApp e e-mail" : result.email ? " por e-mail" : " por WhatsApp"}.`);
      qc.invalidateQueries({ queryKey: ["meta-reports", workspaceId] });
      qc.invalidateQueries({ queryKey: ["meta-report-runs", workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pdfMut = useMutation({
    mutationFn: (id: string) => pdfFn({ data: { workspaceId, reportId: id } }),
    onSuccess: (result) => {
      downloadBase64(result.filename, result.mimeType, result.base64);
      toast.success("PDF gerado com os dados atuais do relatório.");
    },
    onError: (error: Error) => toast.error(`PDF: ${error.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { workspaceId, id } }),
    onSuccess: () => {
      toast.success("Relatório removido.");
      qc.invalidateQueries({ queryKey: ["meta-reports", workspaceId] });
    },
  });

  const reports = reportsQ.data?.reports ?? [];
  const toggleChannel = (channel: Channel) => setForm((current) => ({
    ...current,
    channels: current.channels.includes(channel)
      ? current.channels.filter((item) => item !== channel)
      : [...current.channels, channel],
  }));

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-semibold">Relatórios agendados</div>
            <div className="text-[11px] text-muted-foreground">WhatsApp e e-mail usam o mesmo relatório; PDF pode ser exportado a qualquer momento.</div>
          </div>
        </div>
        <Button size="sm" onClick={() => { setForm(defaultForm()); setOpen(true); }}><Plus className="mr-1 h-3.5 w-3.5" /> Novo relatório</Button>
      </div>

      {reportsQ.isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</div>
      ) : reports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum relatório agendado.</div>
      ) : (
        <div className="divide-y divide-border">
          {reports.map((report) => {
            const channels = Array.isArray(report.channels) ? report.channels as string[] : [];
            const emails = Array.isArray(report.recipients_email) ? report.recipients_email as string[] : [];
            const phones = Array.isArray(report.recipients_whatsapp) ? report.recipients_whatsapp as string[] : [];
            const historyOpen = historyFor === report.id;
            return (
              <div key={report.id} className="py-3">
                <div className="flex items-start gap-3">
                  <Switch checked={report.enabled} onCheckedChange={async (enabled) => {
                    await saveFn({ data: {
                      workspaceId,
                      id: report.id,
                      name: report.name,
                      enabled,
                      frequency: report.frequency as Frequency,
                      preset: report.preset,
                      channels: channels.filter((c): c is Channel => c === "whatsapp" || c === "email"),
                      recipientsEmail: emails,
                      recipientsWhatsapp: phones,
                      timezone: report.timezone,
                      sendHourLocal: report.send_hour_local,
                      sendMinuteLocal: report.send_minute_local ?? 0,
                      weeklyDay: report.weekly_day,
                      includeAiSuggestions: report.include_ai_suggestions,
                      titleTemplate: report.title_template ?? null,
                      introText: report.intro_text ?? null,
                      footerText: report.footer_text ?? null,
                      selectedKpis: Array.isArray(report.selected_kpis) ? report.selected_kpis as string[] : null,
                    } });
                    qc.invalidateQueries({ queryKey: ["meta-reports", workspaceId] });
                  }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{report.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{frequencies.find((item) => item.value === report.frequency)?.label ?? report.frequency}</span>
                      <span>· {pad2(report.send_hour_local)}:{pad2(report.send_minute_local ?? 0)}</span>
                      <span>· {reportPresetLabel(report.preset)}</span>
                      {channels.includes("whatsapp") && <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{phones.length}</span>}
                      {channels.includes("email") && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{emails.length}</span>}
                    </div>
                    {report.last_run_at && <div className="mt-1 text-[10px] text-muted-foreground">Último envio: {new Date(report.last_run_at).toLocaleString("pt-BR")} · {report.last_status === "error" ? `erro: ${report.last_error ?? "não detalhado"}` : "OK"}</div>}
                  </div>
                  <Button variant="ghost" size="icon" title="Enviar agora" onClick={() => runMut.mutate(report.id)} disabled={runMut.isPending}><Play className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" title="Exportar PDF" onClick={() => pdfMut.mutate(report.id)} disabled={pdfMut.isPending}><FileDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" title="Histórico" onClick={() => setHistoryFor(historyOpen ? null : report.id)}><History className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => {
                    setForm({
                      id: report.id,
                      name: report.name,
                      enabled: report.enabled,
                      frequency: report.frequency as Frequency,
                      preset: report.preset,
                      channels: channels.filter((c): c is Channel => c === "whatsapp" || c === "email"),
                      recipientsWhatsapp: phones.join(", "),
                      recipientsEmail: emails.join(", "),
                      timezone: report.timezone,
                      sendHourLocal: report.send_hour_local,
                      sendMinuteLocal: report.send_minute_local ?? 0,
                      weeklyDay: report.weekly_day,
                      includeAiSuggestions: report.include_ai_suggestions,
                    });
                    setOpen(true);
                  }}>Editar</Button>
                  <Button variant="ghost" size="icon" className="text-destructive" title="Excluir" onClick={() => { if (confirm("Excluir relatório?")) deleteMut.mutate(report.id); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {historyOpen && (
                  <div className="ml-10 mt-3 space-y-2 border-l border-border pl-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Histórico de entregas</div>
                    {historyQ.isLoading ? <div className="text-xs text-muted-foreground">Carregando…</div> : (historyQ.data?.runs ?? []).length === 0 ? <div className="text-xs text-muted-foreground">Nenhum envio registrado.</div> : (historyQ.data?.runs ?? []).map((run) => (
                      <div key={run.id} className="text-xs text-muted-foreground">
                        {new Date(run.ran_at).toLocaleString("pt-BR")} · {run.status} · {(run.channels_ok ?? []).join(" + ") || "nenhum canal confirmado"}{run.error ? ` · ${run.error}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Editar relatório" : "Novo relatório agendado"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Resumo diário de mídia" /></div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Frequência</Label><select className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value as Frequency })}>{frequencies.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
              <div><Label>Período dos dados</Label><ReportDateRangePicker preset={form.preset} onChange={(preset) => setForm({ ...form, preset })} /></div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Horário</Label><Input type="time" value={`${pad2(form.sendHourLocal)}:${pad2(form.sendMinuteLocal)}`} onChange={(event) => { const [hour, minute] = event.target.value.split(":").map(Number); setForm({ ...form, sendHourLocal: hour || 0, sendMinuteLocal: minute || 0 }); }} /></div>
              {(form.frequency === "weekly" || form.frequency === "biweekly") && <div><Label>Dia</Label><select className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={form.weeklyDay} onChange={(event) => setForm({ ...form, weeklyDay: Number(event.target.value) })}>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></div>}
            </div>

            <div>
              <Label>Canais de entrega</Label>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <ChannelCard active={form.channels.includes("whatsapp")} icon={<MessageCircle className="h-4 w-4" />} title="WhatsApp" description="Envia o resumo textual pelo número Evolution conectado." onClick={() => toggleChannel("whatsapp")} />
                <ChannelCard active={form.channels.includes("email")} icon={<Mail className="h-4 w-4" />} title="E-mail" description="Envia o mesmo conteúdo em HTML pelo Resend configurado na Vanessa Simoni." onClick={() => toggleChannel("email")} />
              </div>
            </div>

            {form.channels.includes("whatsapp") && <div><Label>Destinatários WhatsApp</Label><Input value={form.recipientsWhatsapp} onChange={(event) => setForm({ ...form, recipientsWhatsapp: event.target.value })} placeholder="5511999999999, 5522999999999" /><div className="mt-1 text-[10px] text-muted-foreground">DDI + DDD + número. O número conectado à plataforma é bloqueado.</div></div>}
            {form.channels.includes("email") && <div><Label>Destinatários de e-mail</Label><Input value={form.recipientsEmail} onChange={(event) => setForm({ ...form, recipientsEmail: event.target.value })} placeholder="gestor@empresa.com, diretoria@empresa.com" /><div className="mt-1 text-[10px] text-muted-foreground">Separe múltiplos e-mails por vírgula, espaço ou ponto e vírgula.</div></div>}

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div><div className="text-sm font-medium">Análise da IA</div><div className="text-[11px] text-muted-foreground">Inclui sugestões no conteúdo usando os dados do mesmo período.</div></div>
              <Switch checked={form.includeAiSuggestions} onCheckedChange={(includeAiSuggestions) => setForm({ ...form, includeAiSuggestions })} />
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
              PDF não é um canal separado: ele usa exatamente o mesmo período/KPIs do relatório e pode ser exportado pelo botão de arquivo na lista. O envio agendado continua nos canais selecionados acima.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>{saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar relatório</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
