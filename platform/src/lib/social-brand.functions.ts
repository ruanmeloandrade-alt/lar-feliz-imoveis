import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FIELDS = [
  "company_name","segment","target_audience","products_services","differentials",
  "tone_of_voice","positioning","main_promise","audience_pains","audience_desires",
  "brand_colors","logo_url","visual_style","post_types","forbidden_words",
  "forbidden_themes","likes_examples","dislikes_examples","competitors_references",
  "instagram_goal","facebook_goal","tiktok_goal","linkedin_goal","organic_traffic_goal",
] as const;

export type BrandContext = Partial<Record<(typeof FIELDS)[number], string | null>>;

const patchShape = Object.fromEntries(
  FIELDS.map((f) => [f, z.string().max(4000).nullable().optional()]),
) as Record<(typeof FIELDS)[number], z.ZodOptional<z.ZodNullable<z.ZodString>>>;

const STORAGE_PREFIX = "storage:social-media:";

function extractStoredPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith(STORAGE_PREFIX)) return value.slice(STORAGE_PREFIX.length);
  try {
    const parsed = new URL(value);
    const marker = "/object/sign/social-media/";
    const idx = parsed.pathname.indexOf(marker);
    return idx >= 0 ? decodeURIComponent(parsed.pathname.slice(idx + marker.length)) : null;
  } catch {
    return null;
  }
}

export const getBrandContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("social_brand_context" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error && error.code !== "PGRST116") throw new Error(error.message);
    if (!row) return { context: null as BrandContext | null };

    const result = { ...(row as object) } as BrandContext;
    const storedPath = extractStoredPath(result.logo_url);
    if (storedPath) {
      const { data: signed, error: signError } = await context.supabase.storage
        .from("social-media")
        .createSignedUrl(storedPath, 86400);
      // Um logo legado/quebrado não pode derrubar a aba Marca inteira.
      // O restante do contexto continua utilizável e o usuário pode substituir o logo.
      if (signError || !signed?.signedUrl) {
        console.warn("[social-brand] Não foi possível abrir o logo salvo.", signError?.message ?? "sem signed URL");
        result.logo_url = null;
      } else {
        result.logo_url = signed.signedUrl;
      }
    }
    return { context: result };
  });

export const saveBrandContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspaceId: z.string().uuid(),
    patch: z.object(patchShape),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const patch: BrandContext = { ...data.patch };
    if (Object.prototype.hasOwnProperty.call(patch, "logo_url")) {
      const storedPath = extractStoredPath(patch.logo_url);
      if (storedPath) patch.logo_url = `${STORAGE_PREFIX}${storedPath}`;
    }

    const payload = {
      workspace_id: data.workspaceId,
      ...patch,
      updated_by: context.userId,
    };
    const { error } = await context.supabase
      .from("social_brand_context" as never)
      .upsert(payload as never, { onConflict: "workspace_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
