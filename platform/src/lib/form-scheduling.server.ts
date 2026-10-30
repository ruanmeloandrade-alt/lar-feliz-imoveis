// Agendamento de call a partir da tela de agradecimento do formulário.
// Gera os horários livres (com base nas tarefas/reuniões já existentes no
// workspace) e grava a reunião como tarefa do CRM, opcionalmente enviando
// o evento para o Google Agenda do workspace.

import type { FormScheduling } from "@/lib/forms.functions";

type AnySb = { from: (t: string) => any; rpc?: (fn: string, args: unknown) => any };

/** Fuso usado nas agendas (Brasil). */
const TZ_OFFSET = "-03:00";

export interface SchedulingConfig {
  durationMin: number;
  daysAhead: number;
  workStart: string;
  workEnd: string;
  weekdaysOnly: boolean;
  eventTitle: string;
  meetingUrl: string | null;
  syncGoogle: boolean;
}

export function normalizeScheduling(input?: FormScheduling | null): SchedulingConfig {
  const s = input ?? {};
  const time = (v: unknown, fallback: string) =>
    typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : fallback;
  return {
    durationMin: Math.min(240, Math.max(10, Number(s.durationMin) || 30)),
    daysAhead: Math.min(90, Math.max(1, Number(s.daysAhead) || 14)),
    workStart: time(s.workStart, "09:00"),
    workEnd: time(s.workEnd, "18:00"),
    weekdaysOnly: s.weekdaysOnly !== false,
    eventTitle: (s.eventTitle && String(s.eventTitle).slice(0, 160)) || "Call agendada pelo formulário",
    meetingUrl: s.meetingUrl ? String(s.meetingUrl).slice(0, 2000) : null,
    syncGoogle: s.syncGoogle !== false,
  };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toIso(dateKey: string, hhmm: string): string {
  return new Date(`${dateKey}T${hhmm}:00${TZ_OFFSET}`).toISOString();
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export interface DaySlots {
  /** YYYY-MM-DD no fuso do calendário */
  date: string;
  slots: Array<{ label: string; startsAt: string }>;
}

/** Monta a grade de horários livres para os próximos dias. */
export async function buildSlots(
  admin: AnySb,
  workspaceId: string,
  cfg: SchedulingConfig,
): Promise<DaySlots[]> {
  const now = Date.now();
  const horizonEnd = new Date(now + cfg.daysAhead * 24 * 3600 * 1000).toISOString();

  const { data: busyRows } = await admin
    .from("tasks")
    .select("start_at, end_at, status")
    .eq("workspace_id", workspaceId)
    .neq("status", "cancelada")
    .gte("end_at", new Date(now).toISOString())
    .lte("start_at", horizonEnd)
    .limit(1000);

  const busy = ((busyRows ?? []) as Array<{ start_at: string; end_at: string }>).map((b) => ({
    start: new Date(b.start_at).getTime(),
    end: new Date(b.end_at).getTime(),
  }));

  const out: DaySlots[] = [];
  for (let i = 0; i < cfg.daysAhead; i++) {
    // dia local (fuso do calendário)
    const dayRef = new Date(now + i * 24 * 3600 * 1000);
    const local = new Date(dayRef.getTime() - 3 * 3600 * 1000);
    const dateKey = ymd(local);
    const weekday = new Date(`${dateKey}T12:00:00${TZ_OFFSET}`).getUTCDay();
    if (cfg.weekdaysOnly && (weekday === 0 || weekday === 6)) continue;

    const startMin = minutes(cfg.workStart);
    const endMin = minutes(cfg.workEnd);
    const slots: DaySlots["slots"] = [];
    for (let m = startMin; m + cfg.durationMin <= endMin; m += cfg.durationMin) {
      const hhmm = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      const startsAt = toIso(dateKey, hhmm);
      const startMs = new Date(startsAt).getTime();
      const endMs = startMs + cfg.durationMin * 60_000;
      if (startMs < now + 30 * 60_000) continue; // mínimo 30 min de antecedência
      const conflict = busy.some((b) => startMs < b.end && endMs > b.start);
      if (conflict) continue;
      slots.push({ label: hhmm, startsAt });
    }
    if (slots.length) out.push({ date: dateKey, slots: slots.slice(0, 40) });
    if (out.length >= 30) break;
  }
  return out;
}

export interface BookArgs {
  workspaceId: string;
  formId: string;
  formName: string;
  leadId?: string | null;
  startsAt: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  note?: string | null;
}

/** Cria a reunião no CRM (e no Google Agenda, quando conectado). */
export async function bookFormMeeting(
  admin: AnySb,
  cfg: SchedulingConfig,
  args: BookArgs,
): Promise<{ ok: true; taskId: string; startsAt: string; endsAt: string; googleSynced: boolean }> {
  const startMs = new Date(args.startsAt).getTime();
  if (!Number.isFinite(startMs)) throw new Error("Horário inválido.");
  if (startMs < Date.now() + 5 * 60_000) throw new Error("Escolha um horário futuro.");
  const endsAt = new Date(startMs + cfg.durationMin * 60_000).toISOString();
  const startsAt = new Date(startMs).toISOString();

  // Conflito de agenda
  const { data: clash } = await admin
    .from("tasks")
    .select("id")
    .eq("workspace_id", args.workspaceId)
    .neq("status", "cancelada")
    .lt("start_at", endsAt)
    .gt("end_at", startsAt)
    .limit(1);
  if ((clash ?? []).length) throw new Error("Esse horário acabou de ser reservado. Escolha outro.");

  const who = [args.name, args.email, args.phone].filter(Boolean).join(" · ");
  const participants = args.email
    ? [{ name: args.name ?? args.email, email: args.email }]
    : [];

  const { data: row, error } = await admin
    .from("tasks")
    .insert({
      workspace_id: args.workspaceId,
      lead_id: args.leadId ?? null,
      title: `${cfg.eventTitle}${args.name ? ` — ${args.name}` : ""}`.slice(0, 160),
      description: `Agendado pelo formulário "${args.formName}".${who ? `\n${who}` : ""}${args.note ? `\n${args.note}` : ""}`,
      kind: "reuniao",
      status: "pendente",
      start_at: startsAt,
      end_at: endsAt,
      meeting_url: cfg.meetingUrl,
      participants,
      external_source: "form_scheduling",
      external_id: args.formId,
      google_sync_status: cfg.syncGoogle ? "pending" : "off",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const taskId = (row as { id: string }).id;

  let googleSynced = false;
  if (cfg.syncGoogle) {
    try {
      const { createGoogleCalendarEvent } = await import("@/lib/google-calendar.server");
      const eventId = await createGoogleCalendarEvent(admin, args.workspaceId, {
        summary: `${cfg.eventTitle}${args.name ? ` — ${args.name}` : ""}`,
        description: `Agendado pelo formulário "${args.formName}".${who ? `\n${who}` : ""}`,
        startsAt,
        endsAt,
        attendeeEmail: args.email ?? null,
        meetingUrl: cfg.meetingUrl,
      });
      googleSynced = !!eventId;
      await admin
        .from("tasks")
        .update({ google_sync_status: eventId ? "synced" : "error", google_event_id: eventId ?? null })
        .eq("id", taskId);
    } catch (err) {
      console.error("[form-scheduling] google sync:", err);
      await admin.from("tasks").update({ google_sync_status: "error" }).eq("id", taskId);
    }
  }

  if (args.leadId) {
    await admin.from("lead_activities").insert({
      workspace_id: args.workspaceId,
      lead_id: args.leadId,
      type: "note",
      payload: {
        text: `📅 Call agendada pelo formulário "${args.formName}" para ${new Date(startsAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`,
        source: "form_scheduling",
        task_id: taskId,
      },
      occurred_at: new Date().toISOString(),
    });
  }

  return { ok: true, taskId, startsAt, endsAt, googleSynced };
}
