import { createElement, useEffect } from "react";
import { CampaignsDialog as CampaignsDialogBase } from "./CampaignsDialog.tsx";

export type { PostItem, PostDraft } from "./CampaignsDialog.tsx";

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
  variant?: "modal" | "page";
};

const START = "<<<MKTON_CAROUSEL_SLIDE_";
const END = "<<<END_MKTON_CAROUSEL_SLIDE>>>";
const RE = /<<<MKTON_CAROUSEL_SLIDE_(\d+)>>>\s*([\s\S]*?)\s*<<<END_MKTON_CAROUSEL_SLIDE>>>/g;

let desiredCarouselCount = 6;

function resizeCarouselPrompt(prompt: string, count: number): string {
  const parsed = Array.from(prompt.matchAll(RE))
    .map((match) => ({ n: Number(match[1]), prompt: match[2]?.trim() ?? "" }))
    .filter((item) => item.prompt)
    .sort((a, b) => a.n - b.n);
  if (!parsed.length) return prompt;

  const wanted = Math.max(2, Math.min(20, count));
  const slides = parsed.slice(0, wanted);
  while (slides.length < wanted) {
    const index = slides.length;
    const source = parsed[Math.min(index, parsed.length - 1)]?.prompt ?? parsed[0].prompt;
    slides.push({
      n: index + 1,
      prompt: `${source}\n\nSLIDE ${index + 1} DE ${wanted}: mantenha a mesma identidade visual do carrossel, mas crie uma composição, enquadramento e foco claramente diferentes dos slides anteriores. Não repita layout nem elementos na mesma posição.`,
    });
  }

  return slides
    .map((slide, index) => `${START}${index + 1}>>>\n${slide.prompt}\n${END}`)
    .join("\n\n");
}

function readVisibleCarouselCount() {
  if (typeof document === "undefined") return desiredCarouselCount;
  const candidates = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="number"][min="2"][max="20"]'))
    .filter((input) => input.offsetParent !== null);
  const input = candidates[candidates.length - 1];
  const value = Number(input?.value ?? desiredCarouselCount);
  if (Number.isFinite(value)) desiredCarouselCount = Math.max(2, Math.min(20, Math.floor(value)));
  return desiredCarouselCount;
}

export function CampaignsDialog(props: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const originalFetch = window.fetch.bind(window);
    const captureCount = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      const text = button.textContent ?? "";
      if (/Aprimorar para|Gerar Imagem|Aprimorar Posts do Conjunto/i.test(text)) readVisibleCarouselCount();
    };
    document.addEventListener("pointerdown", captureCount, true);

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes("/api/social/generate-image") || typeof init?.body !== "string") {
        return originalFetch(input, init);
      }
      try {
        const body = JSON.parse(init.body) as { carousel?: boolean; imageCount?: number; prompt?: string };
        if (body.carousel === true) {
          const count = readVisibleCarouselCount();
          body.imageCount = count;
          if (typeof body.prompt === "string") body.prompt = resizeCarouselPrompt(body.prompt, count);
          return originalFetch(input, { ...init, body: JSON.stringify(body) });
        }
      } catch {
        // Se não for JSON do gerador, mantém a requisição original.
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;

    return () => {
      document.removeEventListener("pointerdown", captureCount, true);
      window.fetch = originalFetch;
    };
  }, []);

  return createElement(CampaignsDialogBase, props);
}
