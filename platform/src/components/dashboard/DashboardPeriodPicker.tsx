import { useMemo, useState } from "react";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export type DashboardPeriod = {
  from: string | null; // YYYY-MM-DD
  to: string | null;   // YYYY-MM-DD
  label: string;
  preset: PresetKey;
};

export type PresetKey =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "90d"
  | "this_month"
  | "last_month"
  | "this_year"
  | "all"
  | "custom";

function ymd(d: Date) {
  const yr = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yr}-${m}-${dd}`;
}

function buildPreset(key: PresetKey): DashboardPeriod {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(today);
  switch (key) {
    case "today":
      return { from: ymd(today), to: ymd(today), label: "Hoje", preset: "today" };
    case "yesterday": {
      from.setDate(today.getDate() - 1);
      return { from: ymd(from), to: ymd(from), label: "Ontem", preset: "yesterday" };
    }
    case "7d":
      from.setDate(today.getDate() - 6);
      return { from: ymd(from), to: ymd(today), label: "Últimos 7 dias", preset: "7d" };
    case "30d":
      from.setDate(today.getDate() - 29);
      return { from: ymd(from), to: ymd(today), label: "Últimos 30 dias", preset: "30d" };
    case "90d":
      from.setDate(today.getDate() - 89);
      return { from: ymd(from), to: ymd(today), label: "Últimos 90 dias", preset: "90d" };
    case "this_month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: ymd(first), to: ymd(today), label: "Mês atual", preset: "this_month" };
    }
    case "last_month": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: ymd(first), to: ymd(last), label: "Mês passado", preset: "last_month" };
    }
    case "this_year": {
      const first = new Date(today.getFullYear(), 0, 1);
      return { from: ymd(first), to: ymd(today), label: "Este ano", preset: "this_year" };
    }
    case "all":
      return { from: null, to: null, label: "Todo o período", preset: "all" };
    case "custom":
    default:
      return { from: null, to: null, label: "Personalizado", preset: "custom" };
  }
}

export const DEFAULT_PERIOD: DashboardPeriod = buildPreset("30d");

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "30d", label: "Últimos 30 dias" },
  { key: "90d", label: "Últimos 90 dias" },
  { key: "this_month", label: "Mês atual" },
  { key: "last_month", label: "Mês passado" },
  { key: "this_year", label: "Este ano" },
  { key: "all", label: "Todo o período" },
];

function formatRange(period: DashboardPeriod) {
  if (period.preset !== "custom") return period.label;
  if (!period.from || !period.to) return "Personalizado";
  const [fy, fm, fd] = period.from.split("-");
  const [ty, tm, td] = period.to.split("-");
  return `${fd}/${fm}/${fy.slice(2)} → ${td}/${tm}/${ty.slice(2)}`;
}

interface Props {
  value: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
  className?: string;
}

export function DashboardPeriodPicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [range, setRange] = useState<{ from?: Date; to?: Date }>(() => ({
    from: value.from ? new Date(value.from + "T00:00:00") : undefined,
    to: value.to ? new Date(value.to + "T00:00:00") : undefined,
  }));

  const label = useMemo(() => formatRange(value), [value]);

  function pickPreset(k: PresetKey) {
    onChange(buildPreset(k));
    setShowCustom(false);
    setOpen(false);
  }

  function applyCustom() {
    if (!range.from || !range.to) return;
    onChange({
      from: ymd(range.from),
      to: ymd(range.to),
      label: "Personalizado",
      preset: "custom",
    });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5 text-xs font-medium", className)}
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          <span className="truncate max-w-[180px]">{label}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0" sideOffset={6}>
        <div className="flex">
          <div className="flex flex-col p-2 border-r min-w-[180px]">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => pickPreset(p.key)}
                className={cn(
                  "text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-accent transition-colors",
                  value.preset === p.key && "bg-accent font-medium",
                )}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setShowCustom((s) => !s)}
              className={cn(
                "text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-accent transition-colors",
                (showCustom || value.preset === "custom") && "bg-accent font-medium",
              )}
            >
              Personalizado…
            </button>
          </div>
          {(showCustom || value.preset === "custom") && (
            <div className="p-2 flex flex-col gap-2">
              <Calendar
                mode="range"
                selected={range as any}
                onSelect={(r: any) => setRange(r ?? {})}
                numberOfMonths={2}
                className="pointer-events-auto"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button size="sm" disabled={!range.from || !range.to} onClick={applyCustom}>
                  Aplicar
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
