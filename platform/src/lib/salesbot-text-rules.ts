/** Regras com texto literal, compartilhadas pelo executor e pelo simulador. */
export function matchPlainSalesbotRule(
  tipo: string,
  reference: string,
  value: string,
): boolean | undefined {
  const options = reference
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (tipo === "igual") return reference.length > 0 && value === reference;
  if (tipo === "igual-lista") return options.length > 0 && options.includes(value);
  if (tipo === "contem-lista") {
    const text = value.toLocaleLowerCase();
    return options.some((phrase) => text.includes(phrase.toLocaleLowerCase()));
  }
  if (tipo === "resposta-igual") {
    let end = value.length;
    while (end > 0 && ".! ".includes(value[end - 1])) end--;
    return (
      reference.length > 0 &&
      value.slice(0, end).toLocaleLowerCase() === reference.toLocaleLowerCase()
    );
  }
  return undefined;
}
