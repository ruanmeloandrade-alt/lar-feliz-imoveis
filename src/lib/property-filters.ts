import type { Property } from "@/types/property";
export type PropertyFilters = {
  query: string;
  city: string;
  neighborhood: string;
  bedrooms: string;
  bathrooms: string;
};
export const emptyPropertyFilters: PropertyFilters = {
  query: "",
  city: "",
  neighborhood: "",
  bedrooms: "",
  bathrooms: "",
};
const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function filterProperties(
  properties: Property[],
  filters: PropertyFilters,
): Property[] {
  const words = normalize(filters.query).split(/\s+/).filter(Boolean),
    city = normalize(filters.city),
    neighborhood = normalize(filters.neighborhood);
  return properties.filter((property) => {
    if (city && normalize(property.city) !== city) return false;
    if (neighborhood && normalize(property.neighborhood) !== neighborhood)
      return false;
    const text = normalize(
      [
        property.title,
        property.description,
        property.city,
        property.neighborhood,
        property.address,
      ]
        .filter(Boolean)
        .join(" "),
    );
    if (!words.every((word) => text.includes(word))) return false;
    for (const key of ["bedrooms", "bathrooms"] as const) {
      if (!filters[key]) continue;
      const value = property[key],
        selected = Number(filters[key]);
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        !Number.isFinite(selected) ||
        selected < 0 ||
        value !== selected
      )
        return false;
    }
    return true;
  });
}
export function propertyFilterOptions(
  properties: Property[],
  filters: PropertyFilters,
) {
  const cities = Array.from(
    new Set(properties.map((p) => p.city?.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const cityRows = filterProperties(properties, {
    ...emptyPropertyFilters,
    city: filters.city,
  });
  const neighborhoods = Array.from(
    new Set(
      cityRows
        .map((p) => p.neighborhood?.trim())
        .filter((name): name is string => !!name),
    ),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const areaRows = filterProperties(cityRows, {
    ...emptyPropertyFilters,
    neighborhood: filters.neighborhood,
  });
  const counts = (rows: Property[], key: "bedrooms" | "bathrooms") =>
    Array.from(
      new Set(
        rows
          .map((p) => p[key])
          .filter(
            (n): n is number =>
              typeof n === "number" && Number.isSafeInteger(n) && n >= 0,
          ),
      ),
    ).sort((a, b) => a - b);
  return {
    cities,
    neighborhoods,
    bedrooms: counts(areaRows, "bedrooms"),
    bathrooms: counts(
      filterProperties(areaRows, {
        ...emptyPropertyFilters,
        bedrooms: filters.bedrooms,
      }),
      "bathrooms",
    ),
  };
}
