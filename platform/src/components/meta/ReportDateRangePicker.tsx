import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  REPORT_PRESETS, CUSTOM_PRESET_RE, reportPresetLabel,
} from "@/lib/meta-report-presets";

export function ReportDateRangePicker({
  preset, onChange, className,
}: {
  preset: string;
  onChange: (p: string) => void;
  className?: string;
}) {
  const custom = preset.match(CUSTOM_PRESET_RE);
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState(custom?.[1] ?? "");
  const [until, setUntil] = useState(custom?.[2] ?? "");

  const isCustom = !!custom;
  const selectValue = isCustom ? "custom" : preset;

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "custom") {
            setOpen(true);
            const today = new Date().toISOString().slice(0, 10);
            if (!since) setSince(today);
            if (!until) setUntil(today);
          } else {
            onChange(v);
          }
        }}
        className="px-3 py-2 rounded-md border border-border bg-background text-xs font-medium"
      >
        {REPORT_PRESETS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
      </select>
      {isCustom && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3 py-2 rounded-md border border-border bg-background text-xs font-medium hover:bg-muted"
          title="Editar período personalizado"
        >
          {reportPresetLabel(preset)}
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Período personalizado</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">De</span>
              <input
                type="date"
                value={since}
                max={until || undefined}
                onChange={(e) => setSince(e.target.value)}
                className="px-3 py-2 rounded-md border border-border bg-background text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Até</span>
              <input
                type="date"
                value={until}
                min={since || undefined}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setUntil(e.target.value)}
                className="px-3 py-2 rounded-md border border-border bg-background text-sm"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              size="sm"
              disabled={!since || !until || since > until}
              onClick={() => {
                onChange(`custom:${since}:${until}`);
                setOpen(false);
              }}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
