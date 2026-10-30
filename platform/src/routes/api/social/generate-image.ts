// Streaming SSE image generation. Authenticated, workspace-scoped and restricted to super_admin.
// Image generation is an internal MarketOn capability; customers keep text AI + manual media upload.
import { createFileRoute } from "@tanstack/react-router";
import { verifyBearer, assertWorkspaceMember } from "@/lib/ai-agent/auth-bearer.server";
import { INTEGRATION_VAULT_UNAVAILABLE_MESSAGE, integrationVaultFailure } from "@/lib/integration-vault";
import { parseCarouselPrompts, prepareIdeogramPrompt } from "@/lib/social-image-prompt";

type Provider = "gemini" | "ideogram" | "recraft" | "freepik";
const ALL_PROVIDERS: Provider[] = ["ideogram", "freepik", "recraft", "gemini"];
const MAX_STYLE_REFERENCE_BYTES = 10 * 1024 * 1024;
type StyleReference = { blob: Blob; filename: string };

function sseFinal(b64: string): Response {
  const body = `event: image_generation.completed\ndata: ${JSON.stringify({ type: "image_generation.completed", b64_json: b64 })}\n\n`;
  return new Response(body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
function sseCarousel(images: string[]): Response {
  const body = `event: image_generation.carrossel_completed\ndata: ${JSON.stringify({ type: "carrossel_completed", images })}\n\n`;
  return new Response(body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
async function urlToB64(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao baixar imagem gerada (${r.status})`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function normalizedAspect(value?: string) {
  if (value === "4:5" || value === "9:16" || value === "16:9") return value;
  return "1:1";
}
function extensionForBlob(blob: Blob): string {
  if (blob.type === "image/jpeg") return "jpg";
  if (blob.type === "image/webp") return "webp";
  return "png";
}
async function assertSuperAdmin(supabase: any, userId: string) {
  const [{ data: profile, error: profileError }, { data: dbRoles, error: rolesError }] = await Promise.all([
    supabase.from("platform_profiles").select("roles").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (profileError && rolesError) throw new Error("Não foi possível validar a permissão administrativa.");
  const profileRoles = Array.isArray(profile?.roles) ? profile.roles.map(String) : [];
  const roles = new Set([
    ...profileRoles,
    ...((dbRoles ?? []) as Array<{ role?: string }>).map((row) => String(row.role ?? "")),
  ]);
  if (!roles.has("super_admin")) throw new Error("Geração de imagem por IA é restrita ao super_admin.");
}
async function loadBrandStyleReferences(supabase: any, workspaceId: string, brandId?: string | null): Promise<StyleReference[]> {
  if (!brandId) return [];
  const { data: brand, error: brandError } = await supabase.from("social_brand_context").select("id").eq("workspace_id", workspaceId).eq("id", brandId).maybeSingle();
  if (brandError) throw new Error(`Não foi possível validar a marca selecionada: ${brandError.message}`);
  if (!brand) throw new Error("A marca selecionada não pertence a este workspace.");
  const { data: rows, error } = await supabase.from("social_brand_references").select("id,storage_path,label").eq("workspace_id", workspaceId).eq("is_active", true).eq("status", "ready").eq("sentiment", "like").not("storage_path", "is", null).limit(3);
  if (error) throw new Error(`Não foi possível carregar as referências visuais da marca: ${error.message}`);
  const refs = (rows ?? []) as Array<{ id: string; storage_path: string; label?: string | null }>;
  if (!refs.length) return [];
  const loaded: StyleReference[] = [];
  let totalBytes = 0;
  for (const ref of refs) {
    const { data: blob, error: downloadError } = await supabase.storage.from("social-media").download(ref.storage_path);
    if (downloadError || !blob) throw new Error(`A referência visual "${ref.label ?? ref.id}" está ativa, mas não pôde ser lida do storage.`);
    if (!/^image\/(png|jpeg|webp)$/i.test(blob.type || "")) throw new Error(`A referência visual "${ref.label ?? ref.id}" não está em PNG, JPEG ou WebP.`);
    if (totalBytes + blob.size > MAX_STYLE_REFERENCE_BYTES) break;
    totalBytes += blob.size;
    loaded.push({ blob, filename: `style-ref-${loaded.length + 1}.${extensionForBlob(blob)}` });
  }
  if (refs.length && !loaded.length) throw new Error("As referências visuais ativas ultrapassam o limite de 10 MB aceito pelo Ideogram. Reduza o tamanho das referências.");
  return loaded;
}
async function generateIdeogramBatch(args: { apiKey: string; prompt: string; aspect: string; count: number; styleReferences?: StyleReference[] }): Promise<string[]> {
  const plan = prepareIdeogramPrompt(args.prompt);
  const form = new FormData();
  form.set("prompt", plan.prompt);
  form.set("aspect_ratio", args.aspect.replace(":", "x"));
  form.set("rendering_speed", "DEFAULT");
  form.set("magic_prompt", plan.magicPrompt);
  form.set("style_type", plan.styleType);
  form.set("num_images", String(Math.max(1, Math.min(4, args.count))));
  if (plan.negativePrompt) form.set("negative_prompt", plan.negativePrompt);
  for (const ref of args.styleReferences ?? []) form.append("style_reference_images", ref.blob, ref.filename);
  const upstream = await fetch("https://api.ideogram.ai/v1/ideogram-v3/generate", { method: "POST", headers: { "Api-Key": args.apiKey }, body: form });
  if (!upstream.ok) {
    const t = await upstream.text().catch(() => "");
    throw new Error(`Ideogram ${upstream.status}: ${t.slice(0, 500)}`);
  }
  const json = (await upstream.json()) as { data?: Array<{ url?: string }> };
  const urls = (json.data ?? []).map((i) => i.url).filter((u): u is string => Boolean(u));
  if (!urls.length) throw new Error("Ideogram não retornou imagem.");
  return Promise.all(urls.map(urlToB64));
}

export const Route = createFileRoute("/api/social/generate-image")({
  server: { handlers: { POST: async ({ request }) => {
    let ctx;
    try { ctx = await verifyBearer(request); } catch (e) { return new Response((e as Error).message, { status: 401 }); }
    const body = (await request.json().catch(() => null)) as { workspaceId?: string; prompt?: string; provider?: Provider; size?: string; aspectRatio?: string; carousel?: boolean; imageCount?: number; brandId?: string | null } | null;
    if (!body?.workspaceId || !body?.prompt?.trim()) return new Response("workspaceId e prompt são obrigatórios.", { status: 400 });
    try {
      await assertWorkspaceMember(ctx.supabase, body.workspaceId, ctx.userId);
      await assertSuperAdmin(ctx.supabase, ctx.userId);
    } catch (e) { return new Response((e as Error).message, { status: 403 }); }

    const { data: integrations } = await ctx.supabase.from("integrations").select("provider,status").eq("workspace_id", body.workspaceId).in("provider", ALL_PROVIDERS);
    const connected = new Set(((integrations ?? []) as Array<{ provider: string; status: string }>).filter((r) => r.status === "connected").map((r) => r.provider as Provider));
    let chosen: Provider | null = body.provider ?? null;
    if (chosen && !connected.has(chosen)) return new Response(`Provider ${chosen} não está conectado neste workspace.`, { status: 409 });
    if (!chosen) chosen = ALL_PROVIDERS.find((p) => connected.has(p)) ?? null;
    if (!chosen) return new Response("Nenhum motor de imagem conectado. Adicione sua API Key em Integrações.", { status: 409 });
    const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!encKey) return new Response(INTEGRATION_VAULT_UNAVAILABLE_MESSAGE, { status: 503 });
    const { data: sec, error: secErr } = await ctx.supabase.rpc("get_integration_secret", { _workspace_id: body.workspaceId, _provider: chosen, _key: encKey });
    if (secErr) { integrationVaultFailure("get_integration_secret:image", secErr.message); return new Response(INTEGRATION_VAULT_UNAVAILABLE_MESSAGE, { status: 503 }); }
    const apiKey = (sec as { api_key?: string; apiKey?: string } | null)?.api_key ?? (sec as { api_key?: string; apiKey?: string } | null)?.apiKey;
    if (!apiKey) return new Response(`API Key de ${chosen} não encontrada. Configure em Integrações.`, { status: 409 });
    const aspect = normalizedAspect(body.aspectRatio);
    const isCarousel = body.carousel === true;
    const carouselPrompts = isCarousel ? parseCarouselPrompts(body.prompt.trim()) : [];
    const requestedImages = carouselPrompts.length || Math.max(1, Math.min(20, Number.isFinite(body.imageCount) ? Math.floor(body.imageCount as number) : isCarousel ? 6 : 1));
    try {
      if (chosen === "ideogram") {
        const styleReferences = await loadBrandStyleReferences(ctx.supabase, body.workspaceId, body.brandId);
        const images: string[] = [];
        if (carouselPrompts.length) {
          for (const slidePrompt of carouselPrompts) {
            const batch = await generateIdeogramBatch({ apiKey, prompt: slidePrompt, aspect, count: 1, styleReferences });
            if (!batch[0]) throw new Error("Ideogram não retornou uma das imagens do carrossel.");
            images.push(batch[0]);
          }
        } else {
          let remaining = requestedImages;
          while (remaining > 0) {
            const batchSize = Math.min(4, remaining);
            const batch = await generateIdeogramBatch({ apiKey, prompt: body.prompt.trim(), aspect, count: batchSize, styleReferences });
            images.push(...batch.slice(0, batchSize));
            remaining -= batchSize;
          }
        }
        if (!images.length) return new Response("Ideogram não retornou imagem.", { status: 502 });
        return images.length > 1 ? sseCarousel(images) : sseFinal(images[0]);
      }
      if (chosen === "gemini") {
        const prompts = carouselPrompts.length ? carouselPrompts : [body.prompt.trim()];
        const images: string[] = [];
        for (const imagePrompt of prompts) {
          const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: imagePrompt }] }], generationConfig: { responseModalities: ["IMAGE"] } }) });
          if (!upstream.ok) return new Response((await upstream.text().catch(() => "")) || `Gemini ${upstream.status}`, { status: upstream.status });
          const json = (await upstream.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }> };
          const b64 = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
          if (!b64) return new Response("Gemini não retornou imagem.", { status: 502 });
          images.push(b64);
        }
        return images.length > 1 ? sseCarousel(images) : sseFinal(images[0]);
      }
      const rawSize = body.size ?? (aspect === "9:16" || aspect === "4:5" ? "1024x1792" : aspect === "16:9" ? "1792x1024" : "1024x1024");
      const openaiSize = rawSize === "1792x1024" ? "1792x1024" : rawSize === "1024x1792" ? "1024x1792" : "1024x1024";
      const prompts = carouselPrompts.length ? carouselPrompts : [body.prompt.trim()];
      const images: string[] = [];
      for (const imagePrompt of prompts) {
        if (chosen === "recraft") {
          const upstream = await fetch("https://external.api.recraft.ai/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ prompt: imagePrompt, model: "recraftv3", size: openaiSize, style: "digital_illustration", n: 1 }) });
          if (!upstream.ok) return new Response(`Recraft ${upstream.status}: ${(await upstream.text().catch(() => "")).slice(0, 500)}`, { status: upstream.status });
          const json = (await upstream.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
          const item = json.data?.[0];
          const b64 = item?.b64_json ?? (item?.url ? await urlToB64(item.url) : null);
          if (!b64) return new Response("Recraft não retornou imagem.", { status: 502 });
          images.push(b64);
          continue;
        }
        const freepikAspect = aspect === "16:9" ? "widescreen_16_9" : aspect === "9:16" ? "social_story_9_16" : aspect === "4:5" ? "social_4_5" : "square_1_1";
        const upstream = await fetch("https://api.freepik.com/v1/ai/text-to-image/flux-dev", { method: "POST", headers: { "x-freepik-api-key": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ prompt: imagePrompt, aspect_ratio: freepikAspect, num_images: 1 }) });
        if (!upstream.ok) return new Response(`Freepik ${upstream.status}: ${(await upstream.text().catch(() => "")).slice(0, 500)}`, { status: upstream.status });
        const json = (await upstream.json()) as { data?: Array<{ base64?: string; url?: string }> };
        const item = json.data?.[0];
        const b64 = item?.base64 ?? (item?.url ? await urlToB64(item.url) : null);
        if (!b64) return new Response("Freepik não retornou imagem.", { status: 502 });
        images.push(b64);
      }
      return images.length > 1 ? sseCarousel(images) : sseFinal(images[0]);
    } catch (err) { return new Response(`Falha ao gerar imagem: ${(err as Error).message}`, { status: 500 }); }
  } } },
});
