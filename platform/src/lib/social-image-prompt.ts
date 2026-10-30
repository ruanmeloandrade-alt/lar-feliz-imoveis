import { directCarouselPrompt, inferCarouselCount } from "@/lib/social-style-fidelity";

const MARKER_CAROUSEL_PROMPT_RE = /<<<MKTON_CAROUSEL_SLIDE_(\d+)>>>\s*([\s\S]*?)\s*<<<END_MKTON_CAROUSEL_SLIDE>>>/g;
const MARKDOWN_SLIDE_RE = /(?:^|\n)\s*\*{0,2}Slide\s+(\d+)\s*:\s*\*{0,2}\s*\n([\s\S]*?)(?=(?:\n\s*\*{0,2}Slide\s+\d+\s*:\s*\*{0,2})|$)/gi;
const EXACT_TEXT_LABEL_RE = /^(?:exact\s+text\s+to\s+render|exact\s+visible\s+text|visible\s+text|texto\s+exato\s+a\s+renderizar|texto\s+exato|texto\s+visível|texto\s+visivel|texto|headline|título|titulo)\s*:\s*["“]([^"”\n]{1,320})["”]/i;
const INLINE_EXACT_TEXT_RE = /(?:deve\s+(?:dizer|ler)|com\s+o\s+texto|text\s+that\s+reads|exact\s+text\s+(?:is|must\s+be))\s*:?\s*["“]([^"”\n]{1,320})["”]/gim;

function normalizeMarkdownLine(line: string): string {
  return line.replace(/\*/g, "").trim().replace(/^[-•]\s*/, "");
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLocaleLowerCase("pt-BR");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractExactImageTexts(prompt: string): string[] {
  const found: string[] = [];
  for (const line of prompt.split("\n")) {
    const match = normalizeMarkdownLine(line).match(EXACT_TEXT_LABEL_RE);
    const value = match?.[1]?.trim();
    if (value) found.push(value);
  }
  INLINE_EXACT_TEXT_RE.lastIndex = 0;
  for (const match of prompt.matchAll(INLINE_EXACT_TEXT_RE)) {
    const value = match[1]?.trim();
    if (value) found.push(value);
  }
  return dedupe(found);
}

function stripExactTextLabelLines(prompt: string): string {
  return prompt
    .split("\n")
    .filter((line) => !EXACT_TEXT_LABEL_RE.test(normalizeMarkdownLine(line)))
    .join("\n")
    .trim();
}

export type IdeogramPromptPlan = {
  prompt: string;
  magicPrompt: "AUTO" | "OFF";
  styleType: "AUTO" | "DESIGN";
  negativePrompt?: string;
  exactTexts: string[];
};

/**
 * Ideogram recommends natural-language, visually grounded prompts. When text must
 * appear in the image, the exact wording is placed early, quoted, and accompanied
 * by explicit placement/typography guidance. We keep Magic Prompt off only for
 * exact-copy jobs so our app does not allow a second rewriting step to change copy.
 */
export function prepareIdeogramPrompt(prompt: string): IdeogramPromptPlan {
  const source = prompt.trim();
  const exactTexts = extractExactImageTexts(source);
  if (!exactTexts.length) {
    return { prompt: source, magicPrompt: "AUTO", styleType: "AUTO", exactTexts: [] };
  }

  const exactDirective = exactTexts
    .map((text) => `Exact text to render, verbatim: "${text}".`)
    .join(" ");
  const visualPrompt = stripExactTextLabelLines(source);
  const directive = [
    exactDirective,
    "Place the quoted text prominently and legibly in the specified text area.",
    "Preserve spelling, accents, punctuation and capitalization exactly.",
    "Use strong contrast and a clean text area; keep the surrounding composition visually simple around the typography.",
    "Do not translate, paraphrase, duplicate, complete or add any other visible words, labels or logos.",
  ].join(" ");

  return {
    prompt: `${directive}\n\n${visualPrompt}`.trim(),
    magicPrompt: "OFF",
    styleType: "DESIGN",
    negativePrompt:
      "extra text, invented words, misspelled text, gibberish, malformed letters, unreadable typography, duplicated words, translated text, random labels, random logos, watermark, lorem ipsum, pseudo-text",
    exactTexts,
  };
}

function parseMarkerCarouselPrompts(prompt: string): string[] {
  MARKER_CAROUSEL_PROMPT_RE.lastIndex = 0;
  return Array.from(prompt.matchAll(MARKER_CAROUSEL_PROMPT_RE))
    .map((match) => ({ n: Number(match[1]), prompt: match[2]?.trim() ?? "" }))
    .filter((item) => Number.isFinite(item.n) && item.prompt)
    .sort((a, b) => a.n - b.n)
    .map((item) => item.prompt);
}

function parseMarkdownCarouselPrompts(prompt: string): string[] {
  MARKDOWN_SLIDE_RE.lastIndex = 0;
  const matches = Array.from(prompt.matchAll(MARKDOWN_SLIDE_RE));
  if (matches.length < 2) return [];

  const firstIndex = matches[0]?.index ?? 0;
  const preamble = prompt.slice(0, firstIndex).trim();
  return matches
    .map((match) => ({ n: Number(match[1]), body: match[2]?.trim() ?? "" }))
    .filter((item) => Number.isFinite(item.n) && item.body)
    .sort((a, b) => a.n - b.n)
    .map((item) => [preamble, `Slide ${item.n}:\n${item.body}`].filter(Boolean).join("\n\n"));
}

/**
 * Carrossel pode chegar refinado (marcadores), descrito slide a slide em Markdown,
 * ou como um briefing cru. No briefing cru criamos prompts independentes para evitar
 * pedir N variações da mesma imagem e perder storytelling/plot twist.
 */
export function parseCarouselPrompts(prompt: string): string[] {
  const marked = parseMarkerCarouselPrompts(prompt);
  if (marked.length) return marked;
  const markdown = parseMarkdownCarouselPrompts(prompt);
  if (markdown.length) return markdown;
  const count = inferCarouselCount(prompt, null);
  return Array.from({ length: count }, (_, index) => directCarouselPrompt(prompt, index, count));
}
