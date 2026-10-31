import { parseMoneyCents } from "./slim-money.core";
export function normalizedSitePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  let result = value.trim().startsWith("+")
    ? digits
    : digits.length === 10 || digits.length === 11
      ? "55" + digits
      : digits;
  if (!/^[1-9][0-9]{9,14}$/.test(result) || /^([0-9])\1+$/.test(result))
    throw Error("Informe seu WhatsApp com DDD.");
  return "+" + result;
}
export function declaredSiteFacts(
  messages: Array<{ role: string; content: string }>,
  cities: string[],
) {
  const out: Record<string, string | number> = {};
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  for (const m of messages) {
    if (m.role !== "user") continue;
    const text = m.content;
    const age =
      /(?:eu\s+)?tenho\s+(\d{1,3})\s+anos\b|minha\s+idade\s*(?:e|é|:)?\s*(\d{1,3})\b/i.exec(text);
    if (age) {
      const n = Number(age[1] ?? age[2]);
      if (n >= 0 && n <= 120 && !/\bn[aã]o\s*$/i.test(text.slice(0, age.index))) out.age = n;
    }
    const plain = norm(text);
    const mentionedCities = cities.filter((city) => plain.includes(norm(city)));
    if (mentionedCities.length && !/\bn[aã]o\b/i.test(text)) out.city = mentionedCities.join(" / ");
    const beds =
      /(?:quero|procuro|busco|preciso|com)\s+(\d{1,2})\s*(?:quartos|dormit[oó]rios)/i.exec(text);
    if (beds && !/\bn[aã]o\b/i.test(text) && Number(beds[1]) > 0 && Number(beds[1]) <= 20)
      out.bedrooms = Number(beds[1]);
    const budget =
      /(?:at[eé]|or[cç]amento(?:\s+de)?|posso pagar)\s*:?\s*(?:R\$\s*)?(\d[\d.,]*)\s*(milh[aã]o|milh[oõ]es|mil)?/i.exec(
        text,
      );
    if (budget) {
      try {
        const multiplier = budget[2]?.startsWith("milh") ? 1000000 : budget[2] === "mil" ? 1000 : 1;
        const n =
          multiplier === 1
            ? parseMoneyCents(budget[1]) / 100
            : Number(budget[1].replace(",", ".")) * multiplier;
        if (
          Number.isFinite(n) &&
          n >= 0 &&
          n <= 1000000000 &&
          (multiplier !== 1 || n >= 1000 || /or[cç]amento|posso pagar|r\$/i.test(text))
        )
          out.budget = n;
      } catch {}
    }
  }
  return out;
}
