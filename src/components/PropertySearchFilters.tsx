import { Search } from "lucide-react";
import {
  emptyPropertyFilters,
  type PropertyFilters,
} from "@/lib/property-filters";
export default function PropertySearchFilters({
  value,
  onChange,
  cities,
  neighborhoods,
  bedrooms,
  bathrooms,
  resultCount,
}: {
  value: PropertyFilters;
  onChange: (value: PropertyFilters) => void;
  cities: string[];
  neighborhoods: string[];
  bedrooms: number[];
  bathrooms: number[];
  resultCount: number;
}) {
  const set = (key: keyof PropertyFilters, next: string) =>
    onChange({
      ...value,
      [key]: next,
      ...(key === "city"
        ? { neighborhood: "", bedrooms: "", bathrooms: "" }
        : key === "neighborhood"
          ? { bedrooms: "", bathrooms: "" }
          : key === "bedrooms"
            ? { bathrooms: "" }
            : {}),
    });
  return (
    <div
      className="vs-property-search"
      role="search"
      aria-label="Buscar imóveis"
    >
      <div className="vs-search-compact">
        <label className="vs-search-query">
          <span>Buscar imóvel</span>
          <div>
            <Search size={15} />
            <input
              type="search"
              aria-label="Buscar imóvel"
              placeholder="Empreendimento ou palavra-chave"
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
          <select
            aria-label="Bairro do imóvel"
            value={value.neighborhood}
            onChange={(e) => set("neighborhood", e.target.value)}
            disabled={!neighborhoods.length}
          >
            <option value="">Todos os bairros</option>
            {neighborhoods.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Quartos</span>
          <select
            aria-label="Quartos"
            value={value.bedrooms}
            onChange={(e) => set("bedrooms", e.target.value)}
          >
            <option value="">Qualquer</option>
            {bedrooms.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Banheiros</span>
          <select
            aria-label="Banheiros"
            value={value.bathrooms}
            onChange={(e) => set("bathrooms", e.target.value)}
          >
            <option value="">Qualquer</option>
            {bathrooms.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="vs-search-summary">
        <p role="status">
          {resultCount}{" "}
          {resultCount === 1 ? "imóvel encontrado" : "imóveis encontrados"}
        </p>
        <button
          type="button"
          onClick={() => onChange({ ...emptyPropertyFilters })}
        >
          Limpar filtros
        </button>
      </div>
    </div>
  );
}
