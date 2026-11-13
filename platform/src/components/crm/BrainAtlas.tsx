import { useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Link2, Megaphone, ShieldBan, Upload } from "lucide-react";
import { BrainModel, brainPinsPerView, brainRegions, type BrainPin, type BrainRegion } from "./BrainModel";

export { brainRegions, type BrainRegion };

const regionIcons = {
  text: FileText,
  document: Upload,
  url: Link2,
  promotion: Megaphone,
  blocked: ShieldBan,
};

export function BrainAtlas({ selected, counts, onSelect, onConfigure, pins, onOpenPin }: {
  selected: BrainRegion;
  counts: Record<BrainRegion, number>;
  onSelect: (region: BrainRegion) => void;
  onConfigure: (region: BrainRegion) => void;
  pins: BrainPin[];
  onOpenPin: (pin: BrainPin) => void;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(pins.length / brainPinsPerView);
  const visiblePage = Math.min(page, Math.max(0, pageCount - 1));
  const offset = visiblePage * brainPinsPerView;

  return (
    <section aria-label="Mapa do Cérebro da IA" className="mx-auto w-full min-w-0 max-w-5xl space-y-4">
      <BrainModel selected={selected} pins={pins.slice(offset, offset + brainPinsPerView)} onSelect={onSelect} onOpenPin={onOpenPin} />
      {pageCount > 1 && (
        <nav aria-label="Páginas de pinos" className="flex items-center justify-center gap-3 text-sm">
          <button type="button" aria-label="Pinos anteriores" disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)} className="rounded-md border p-2 disabled:opacity-40"><ChevronLeft size={16} /></button>
          <span aria-live="polite">{offset + 1}–{Math.min(offset + brainPinsPerView, pins.length)} de {pins.length} registros</span>
          <button type="button" aria-label="Próximos pinos" disabled={visiblePage >= pageCount - 1} onClick={() => setPage(visiblePage + 1)} className="rounded-md border p-2 disabled:opacity-40"><ChevronRight size={16} /></button>
        </nav>
      )}
      <nav aria-label="Regiões do Cérebro" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {brainRegions.map(region => {
          const Icon = regionIcons[region.id];
          const count = counts[region.id];
          return (
            <button
              key={region.id}
              type="button"
              aria-pressed={selected === region.id}
              aria-haspopup="dialog"
              onClick={() => onConfigure(region.id)}
              className="flex min-h-14 items-center gap-2 rounded-xl border border-[#e7dde1] bg-white px-3 py-2 text-left text-sm text-[#30232b] hover:bg-[#fbf2f5] aria-pressed:border-[#bc2153] aria-pressed:bg-[#ffe6ef] aria-pressed:shadow-sm"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#472438]" style={{ color: region.color }}>
                <Icon size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0 font-semibold">
                {region.label}
                <span className="block text-xs font-normal text-[#655861]">{count} {count === 1 ? "registro" : "registros"}</span>
              </span>
            </button>
          );
        })}
      </nav>
    </section>
  );
}
