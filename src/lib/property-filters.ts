import type { Property } from "@/types/property";
export type PropertyFilters = {
  query: string;
  city: string;
  neighborhood: string;
  bedrooms: string;
  bathrooms: string;
  kitchens: string;
  living_rooms: string;
};
export const emptyPropertyFilters: PropertyFilters = {
  query: "",
  city: "",
  neighborhood: "",
  bedrooms: "",
  bathrooms: "",
  kitchens: "",
  living_rooms: "",
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
    if (
      neighborhood &&
      !normalize(
        [property.neighborhood, property.address].filter(Boolean).join(" "),
      ).includes(neighborhood)
    )
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
    for (const key of [
      "bedrooms",
      "bathrooms",
      "kitchens",
      "living_rooms",
    ] as const) {
      if (!filters[key]) continue;
      const value = property[key],
        minimum = Number(filters[key]);
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        !Number.isFinite(minimum) ||
        minimum < 1 ||
        value < minimum
      )
        return false;
    }
    return true;
  });
}
