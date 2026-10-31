export function publicPropertyExtras(value) {
  const data =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const count = (v) =>
    Number.isSafeInteger(v) && v >= 0 && v <= 100 ? v : null;
  return {
    neighborhood:
      typeof data.neighborhood === "string"
        ? data.neighborhood.trim().slice(0, 160) || null
        : null,
    kitchens: count(data.kitchens),
    living_rooms: count(data.living_rooms),
  };
}
