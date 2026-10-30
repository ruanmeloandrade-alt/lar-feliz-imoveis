import { createElement } from "react";
import { IdeasGridFinalization as IdeasGridFinalizationBase } from "./IdeasGridFinalization.tsx";
import { supabase } from "@/integrations/supabase/client";
import { signedUrlFor } from "@/lib/social-stream";
import { toast } from "sonner";

type IdeaPayload = {
  title: string;
  caption: string;
  hashtags: string[];
  pinned_comment: string;
};

type IdeaMetadata = {
  format?: string | null;
  image_path?: string | null;
  slides?: Array<{ image_path?: string | null }> | null;
};

type IdeaRow = {
  title: string;
  copy_suggestion?: string | null;
  metadata?: IdeaMetadata | null;
};

type Props = {
  workspaceId: string | null;
  onUse: (idea: IdeaPayload) => void;
};

function pickIdeaRow(rows: IdeaRow[], idea: IdeaPayload): IdeaRow | null {
  if (!rows.length) return null;
  const caption = idea.caption.trim();
  return rows.find((row) => (row.copy_suggestion ?? "").trim() === caption) ?? rows[0] ?? null;
}

function mediaPaths(meta: IdeaMetadata | null | undefined): string[] {
  if (!meta) return [];
  if (meta.format === "carrossel") {
    const slides = (meta.slides ?? [])
      .map((slide) => slide.image_path?.trim())
      .filter((value): value is string => Boolean(value));
    if (slides.length) return slides;
  }
  return meta.image_path?.trim() ? [meta.image_path.trim()] : [];
}

async function resolveIdeaFiles(workspaceId: string, idea: IdeaPayload): Promise<{ files: File[]; format: string | null }> {
  const { data, error } = await supabase
    .from("social_ideas")
    .select("title,copy_suggestion,metadata")
    .eq("workspace_id", workspaceId)
    .eq("title", idea.title)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);

  const row = pickIdeaRow((data ?? []) as unknown as IdeaRow[], idea);
  const meta = row?.metadata ?? null;
  const paths = mediaPaths(meta);
  if (!paths.length) return { files: [], format: meta?.format ?? null };

  const files = await Promise.all(
    paths.map(async (path, index) => {
      const url = await signedUrlFor(path, 60 * 15);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Falha ao carregar a mídia ${index + 1} (${response.status}).`);
      const blob = await response.blob();
      const ext = blob.type.includes("jpeg") ? "jpg" : blob.type.includes("webp") ? "webp" : "png";
      return new File([blob], `ideia-${index + 1}.${ext}`, { type: blob.type || "image/png" });
    }),
  );
  return { files, format: meta?.format ?? null };
}

function injectIntoPostCreator(files: File[], format: string | null) {
  if (!files.length || typeof document === "undefined" || typeof DataTransfer === "undefined") return;

  let attempts = 0;
  const tryInject = () => {
    attempts += 1;
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="file"][accept="image/*,video/*"]'),
    ).filter((input) => !input.disabled);

    if (!inputs.length) {
      if (attempts < 30) window.setTimeout(tryInject, 50);
      return;
    }

    const target = format === "story" || format === "reels" ? (inputs[1] ?? inputs[0]) : inputs[0];
    const dt = new DataTransfer();
    files.slice(0, 10).forEach((file) => dt.items.add(file));
    target.files = dt.files;
    target.dispatchEvent(new Event("change", { bubbles: true }));
  };

  window.setTimeout(tryInject, 0);
}

export function IdeasGridFinalization(props: Props) {
  const onUse = async (idea: IdeaPayload) => {
    let resolved: { files: File[]; format: string | null } = { files: [], format: null };
    if (props.workspaceId) {
      try {
        resolved = await resolveIdeaFiles(props.workspaceId, idea);
      } catch (error) {
        toast.warning(`O texto foi carregado, mas não foi possível anexar a arte: ${(error as Error).message}`);
      }
    }

    props.onUse(idea);
    if (resolved.files.length) {
      injectIntoPostCreator(resolved.files, resolved.format);
      if (resolved.files.length > 1) toast.success(`${resolved.files.length} imagens do carrossel carregadas no Agendar Post.`);
      else toast.success("Arte da ideia carregada no Agendar Post.");
    }
  };

  return createElement(IdeasGridFinalizationBase, { ...props, onUse });
}
