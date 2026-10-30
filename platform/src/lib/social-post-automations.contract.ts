export type SocialCommentMatchMode = "any" | "contains" | "equals";

export function normalizeSocialComment(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function socialCommentMatches(mode: SocialCommentMatchMode, keywords: string[], text: string | null | undefined) {
  if (mode === "any") return true;
  const incoming = normalizeSocialComment(text);
  const keys = keywords.map(normalizeSocialComment).filter(Boolean);
  if (!incoming || !keys.length) return false;
  return mode === "equals"
    ? keys.some((key) => incoming === key)
    : keys.some((key) => incoming.includes(key));
}
