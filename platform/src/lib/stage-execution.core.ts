import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { normalizeTrigger, type ExecutionConfig, type ExecutionCondition } from "./crm-mock";

export type StageLeadRules = {
  timezone?: string;
  sourceId?: string | null;
  whatsappSessionId?: string | null;
  assigneeId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  value?: number | null;
  tags: string[];
  attributes?: Record<string, unknown>;
  businessHours?: { days?: Array<{ enabled: boolean; start: string; end: string }> };
  customFields: Array<{ id: string; name: string; displayValue: string }>;
};
export const STAGE_TIMER_KINDS = ["daily", "exact-datetime", "hours-before-field"];
export function stageReminderTarget(
  exec: ExecutionConfig | undefined,
  lead: StageLeadRules,
): string | undefined {
  const spec = normalizeTrigger(exec?.trigger);
  return spec.kind === "hours-before-field"
    ? lead.customFields.find((f) =>
        spec.fieldId
          ? f.id === spec.fieldId
          : f.name.trim().toLocaleLowerCase() === spec.fieldName?.trim().toLocaleLowerCase(),
      )?.displayValue
    : undefined;
}
export function stageActionStamp(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .filter(([k, value]) => k !== "applyToExisting" && value !== undefined)
              .map(([k, value]) => [k, canonical(value)]),
          )
        : v;
  return JSON.stringify(canonical(value));
}
export function stageDate(value: string, timezone = "America/Sao_Paulo"): number {
  const raw = String(value ?? "").trim();
  if (!raw) return NaN;
  try {
    return /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw)
      ? new Date(raw).getTime()
      : fromZonedTime(raw, timezone).getTime();
  } catch {
    return NaN;
  }
}
export function stageDueAt(
  exec: ExecutionConfig | undefined,
  lead?: StageLeadRules,
  now = Date.now(),
): number | null {
  const base = Number(exec?.delayMinutes ?? 0);
  if (!Number.isFinite(base) || base < 0) return null;
  const spec = normalizeTrigger(exec?.trigger),
    timezone = lead?.timezone || "America/Sao_Paulo";
  let at = now;
  if (spec.kind === "daily") {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(spec.time)) return null;
    const day = formatInTimeZone(now, timezone, "yyyy-MM-dd");
    at = stageDate(`${day}T${spec.time}:00`, timezone);
    if (at <= now) {
      const next = new Date(day + "T12:00:00Z");
      next.setUTCDate(next.getUTCDate() + 1);
      at = stageDate(`${next.toISOString().slice(0, 10)}T${spec.time}:00`, timezone);
    }
  } else if (spec.kind === "exact-datetime") {
    at = stageDate(spec.at, timezone);
    if (at < now) return null;
  } else if (spec.kind === "hours-before-field") {
    const field = lead?.customFields.find((f) =>
      spec.fieldId
        ? f.id === spec.fieldId
        : f.name.trim().toLowerCase() === spec.fieldName?.trim().toLowerCase(),
    );
    const target = stageDate(field?.displayValue ?? "", timezone);
    if (!Number.isFinite(target) || target <= now || !Number.isFinite(spec.hours) || spec.hours < 0)
      return null;
    at = Math.max(now, target - spec.hours * 3_600_000);
  }
  return Number.isFinite(at) ? at + base * 60_000 : null;
}
export function stageTimerKey(
  actionId: string,
  leadId: string,
  stageId: string,
  exec: ExecutionConfig | undefined,
  lead: StageLeadRules,
  at: number,
): string {
  const spec = normalizeTrigger(exec?.trigger);
  // Field reminders retain the field target even when it is already inside the reminder period.
  const target = stageReminderTarget(exec, lead);
  return `${actionId}:timer:${leadId}:${stageId}:${spec.kind}:${target || new Date(at).toISOString()}`;
}
const hm = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};
export function stageInsideWindow(
  exec: ExecutionConfig | undefined,
  lead?: StageLeadRules,
  now = Date.now(),
): boolean {
  if (!exec?.active || exec.active === "always") return true;
  const parts = formatInTimeZone(now, lead?.timezone || "America/Sao_Paulo", "i|HH:mm").split("|");
  const day = Number(parts[0]) % 7,
    current = hm(parts[1]);
  const windows =
    exec.active === "business-hours"
      ? (
          lead?.businessHours?.days ??
          Array.from({ length: 7 }, (_, d) => ({
            enabled: d > 0 && d < 6,
            start: "09:00",
            end: "18:00",
          }))
        ).flatMap((d, i) => (d.enabled ? [{ days: [i], from: d.start, to: d.end }] : []))
      : exec.activeWindows?.length
        ? exec.activeWindows
        : exec.activeWindow
          ? [exec.activeWindow]
          : [];
  if (!windows.length) return false;
  return windows.some((w) => {
    const start = hm(w.from),
      end = hm(w.to);
    if (start <= end) return w.days.includes(day) && current >= start && current < end;
    return (
      (w.days.includes(day) && current >= start) ||
      (w.days.includes((day + 6) % 7) && current < end)
    );
  });
}
export function stageMatchesCondition(c: ExecutionCondition, lead: StageLeadRules): boolean {
  if (c.field === "no-tag") return lead.tags.length === 0;
  let raw: unknown;
  if (c.field === "tag") raw = lead.tags;
  else if (c.field === "assignee") raw = lead.assigneeId;
  else if (c.field === "custom-field")
    raw = lead.customFields.find((f) =>
      c.customFieldId ? f.id === c.customFieldId : f.name === c.customFieldNome,
    )?.displayValue;
  else if (["name", "email", "phone", "value"].includes(c.field)) raw = lead[c.field as "name"];
  else if (c.field === "source") raw = lead.sourceId;
  else raw = lead.attributes?.[c.field];
  const expected = String(c.value ?? "")
    .trim()
    .toLocaleLowerCase();
  if (c.field === "value") {
    const a = Number(raw ?? 0),
      b = Number(c.value);
    return c.op === "gt" ? a > b : c.op === "lt" ? a < b : c.op === "neq" ? a !== b : a === b;
  }
  const values = (Array.isArray(raw) ? raw : [raw]).map((v) => String(v ?? "").toLocaleLowerCase());
  if (c.op === "contains") return values.some((v) => v.includes(expected));
  if (c.op === "in" || c.op === "not-in") {
    const accepted = expected.split(",").map((v) => v.trim());
    const found = values.some((v) => accepted.includes(v));
    return c.op === "in" ? found : !found;
  }
  const equal = values.includes(expected);
  return c.op === "neq" ? !equal : equal;
}
