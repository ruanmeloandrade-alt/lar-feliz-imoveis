export const SOCIAL_CAROUSEL_PROMPT_START = "<<<MKTON_CAROUSEL_SLIDE_";
export const SOCIAL_CAROUSEL_PROMPT_END = "<<<END_MKTON_CAROUSEL_SLIDE>>>";
export const SOCIAL_CAROUSEL_PROMPT_RE = /<<<MKTON_CAROUSEL_SLIDE_(\d+)>>>\s*([\s\S]*?)\s*<<<END_MKTON_CAROUSEL_SLIDE>>>/g;

export function parseSocialCarouselPrompts(prompt: string): Array<{ n: number; prompt: string }> {
  return Array.from(prompt.matchAll(SOCIAL_CAROUSEL_PROMPT_RE))
    .map((match) => ({ n: Number(match[1]), prompt: match[2]?.trim() ?? "" }))
    .filter((item) => Number.isFinite(item.n) && item.prompt)
    .sort((a, b) => a.n - b.n);
}
