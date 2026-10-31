export function publicPropertyExtras(value) {
  const data =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    neighborhood:
      typeof data.neighborhood === "string"
        ? data.neighborhood.trim().slice(0, 160) || null
        : null,
  };
}
