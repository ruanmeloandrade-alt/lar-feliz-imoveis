import { Search, SlidersHorizontal } from "lucide-react";
import {
  emptyPropertyFilters,
  type PropertyFilters,
} from "@/lib/property-filters";
export default function PropertySearchFilters({
  value,
  onChange,
  cities,
  resultCount,
}: {
  value: PropertyFilters;
  onChange: (value: PropertyFilters) => void;
  cities: string[];
  resultCount: number;
}) {
  const set = (key: keyof PropertyFilters, next: string) =>
    onChange({ ...value, [key]: next });
  return (
    <div
      className="vs-property-search"
      role="search"
      aria-label="Buscar imóveis"
    >
      <div className="vs-search-caption">
        <span>
          <SlidersHorizontal size={15} />
          Encontre um imóvel para você
        </span>
        <button
          type="button"
          onClick={() => onChange({ ...emptyPropertyFilters })}
        >
          Limpar filtros
        </button>
      </div>
      <div className="vs-search-main">
        <label className="vs-search-query">
          <span>Buscar imóvel</span>
          <div>
            <Search size={16} />
            <input
              type="search"
              aria-label="Buscar imóvel"
              placeholder="Nome do empreendimento ou palavra-chave"
              maxLength={160}
              value={value.query}
              onChange={(e) => set("query", e.target.value)}
            />
          </div>
        </label>
        <label>
          <span>Cidade</span>
          <select
            aria-label="Cidade do imóvel"
            value={value.city}
            onChange={(e) => set("city", e.target.value)}
          >
            <option value="">Todas as cidades</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Bairro</span>
          <input
            aria-label="Bairro do imóvel"
            placeholder="Digite o bairro"
            maxLength={160}
            value={value.neighborhood}
            onChange={(e) => set("neighborhood", e.target.value)}
          />
        </label>
      </div>
      <div className="vs-search-rooms">
        {(
          [
            ["bedrooms", "Quartos"],
            ["bathrooms", "Banheiros"],
            ["kitchens", "Cozinhas"],
            ["living_rooms", "Salas"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <select
              aria-label={label}
              value={value[key]}
              onChange={(e) => set(key, e.target.value)}
            >
              <option value="">Qualquer quantidade</option>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={String(n)}>
                  {n} ou mais
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="vs-search-count" role="status">
        {resultCount}{" "}
        {resultCount === 1 ? "imóvel encontrado" : "imóveis encontrados"}
      </p>
    </div>
  );
}
