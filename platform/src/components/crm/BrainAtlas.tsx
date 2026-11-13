import { FileText, Link2, Megaphone, ShieldBan, Upload } from "lucide-react";
import { BrainModel, BrainModelCredit, brainRegions, type BrainRegion } from "./BrainModel";

export { brainRegions, type BrainRegion };

const regionIcons = {
  text: FileText,
  document: Upload,
  url: Link2,
  promotion: Megaphone,
  blocked: ShieldBan,
};

export function BrainAtlas({ selected, counts, onSelect }: {
  selected: BrainRegion;
  counts: Record<BrainRegion, number>;
  onSelect: (region: BrainRegion) => void;
}) {
  return (
    <section aria-label="Mapa do Cérebro da IA" className="min-w-0 space-y-3">
      <BrainModel selected={selected} onSelect={onSelect} />
      <nav aria-label="Regiões do Cérebro" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {brainRegions.map(region => {
          const Icon = regionIcons[region.id];
          const count = counts[region.id];
          return (
            <button
              key={region.id}
              type="button"
              aria-pressed={selected === region.id}
              aria-controls="brain-region-editor"
              onClick={() => onSelect(region.id)}
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
      <BrainModelCredit />
    </section>
  );
}
