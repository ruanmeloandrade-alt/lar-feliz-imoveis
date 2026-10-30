// Widget público de agendamento exibido na tela de agradecimento do formulário.
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Loader2 } from "lucide-react";

interface DaySlots {
  date: string;
  slots: Array<{ label: string; startsAt: string }>;
}

interface Props {
  slug: string;
  workspaceSlug?: string | null;
  leadId?: string | null;
  label?: string | null;
  primary: string;
  /** Dados já preenchidos no formulário, quando disponíveis */
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

function formatDay(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00-03:00`);
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}

export function FormSchedulePicker({
  slug, workspaceSlug, leadId, label, primary, name, email, phone,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<DaySlots[]>([]);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = useMemo(
    () => `/api/public/agenda/${encodeURIComponent(slug)}`,
    [slug],
  );

  useEffect(() => {
    if (!open || days.length || loading) return;
    setLoading(true);
    setError(null);
    const qs = workspaceSlug ? `?workspace=${encodeURIComponent(workspaceSlug)}` : "";
    fetch(`${base}${qs}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) throw new Error(j?.error || "Não foi possível carregar os horários.");
        setDays(j.days ?? []);
        setActiveDay((j.days ?? [])[0]?.date ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, base, workspaceSlug, days.length, loading]);

  async function book(startsAt: string) {
    setBooking(startsAt);
    setError(null);
    try {
      const r = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceSlug: workspaceSlug ?? null,
          startsAt,
          leadId: leadId ?? null,
          name: name ?? null,
          email: email ?? null,
          phone: phone ?? null,
        }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Não foi possível agendar.");
      setConfirmed(j.startsAt as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBooking(null);
    }
  }

  if (confirmed) {
    return (
      <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
        <div className="flex items-center justify-center gap-2 font-semibold">
          <Check className="h-4 w-4" /> Call confirmada
        </div>
        <p className="mt-1 text-center">
          {new Date(confirmed).toLocaleString("pt-BR", {
            dateStyle: "full", timeStyle: "short", timeZone: "America/Sao_Paulo",
          })}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: primary }}
      >
        <CalendarDays className="h-4 w-4" />
        {label || "Agendar uma call"}
      </button>
    );
  }

  const current = days.find((d) => d.date === activeDay);

  return (
    <div className="mt-4 w-full text-left rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <CalendarDays className="h-4 w-4" style={{ color: primary }} />
        {label || "Agendar uma call"}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando horários…
        </div>
      )}

      {!loading && error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {!loading && !error && days.length === 0 && (
        <p className="mt-3 text-xs text-slate-500">Nenhum horário disponível no momento.</p>
      )}

      {!loading && days.length > 0 && (
        <>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {days.map((d) => (
              <button
                key={d.date}
                type="button"
                onClick={() => setActiveDay(d.date)}
                className={`shrink-0 rounded-md border px-3 py-1.5 text-xs capitalize ${
                  d.date === activeDay
                    ? "border-transparent text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
                style={d.date === activeDay ? { backgroundColor: primary } : undefined}
              >
                {formatDay(d.date)}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(current?.slots ?? []).map((s) => (
              <button
                key={s.startsAt}
                type="button"
                disabled={!!booking}
                onClick={() => book(s.startsAt)}
                className="rounded-md border border-slate-200 px-2 py-2 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50"
              >
                {booking === s.startsAt ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Extrai o primeiro valor preenchido de um tipo de campo (nome/e-mail/telefone). */
export function pickFormValue(
  campos: Array<{ id: string; kind: string }>,
  values: Record<string, string | number | boolean | null | undefined>,
  kind: string,
): string | null {
  for (const c of campos) {
    if (c.kind !== kind) continue;
    const v = values[c.id];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}
