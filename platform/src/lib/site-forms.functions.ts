// Integração "meu site": lista sites conectados no Tracking, lê os
// formulários da página e importa como formulário do CRM (origem externa).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeSlug } from "@/lib/forms.functions";

type AnySb = { from: (t: string) => any };

async function activeWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  const id = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!id) throw new Error("Workspace ativo não encontrado.");
  return id;
}

export interface ConnectedSite {
  id: string;
  name: string;
  domain: string;
  verified: boolean;
}

/** Sites já cadastrados no módulo Tracking do workspace ativo. */
export const listConnectedSites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ sites: ConnectedSite[] }> => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const { data, error } = await sb
      .from("tracking_sites")
      .select("id, name, domain, verified")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { sites: (data ?? []) as ConnectedSite[] };
  });

/** Remove um site conectado (mesma lista usada no módulo Tracking). */
export const removeConnectedSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ siteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const { error } = await sb
      .from("tracking_sites")
      .delete()
      .eq("id", data.siteId)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/** Lê a página informada e devolve os formulários detectados. */
export const scanSiteForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ url: z.string().min(3).max(2000) }).parse(d))
  .handler(async ({ data }) => {
    const { normalizeSiteUrl, scanSite } = await import("@/lib/site-forms.server");
    const url = normalizeSiteUrl(data.url);
    return await scanSite(url);
  });

const ImportFieldSchema = z.object({
  name: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  kind: z.enum(["text", "email", "phone", "value", "select", "file", "custom"]),
  required: z.boolean().optional(),
  options: z.array(z.string().max(120)).max(40).optional(),
});

/** Cria um formulário do CRM (origem externa) a partir do que foi lido no site. */
export const importSiteForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        nome: z.string().min(1).max(120),
        siteUrl: z.string().min(3).max(2000),
        campos: z.array(ImportFieldSchema).min(1).max(40),
        autoCriarLead: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await activeWorkspace(sb, context.userId);
    const { normalizeSiteUrl } = await import("@/lib/site-forms.server");
    const siteUrl = normalizeSiteUrl(data.siteUrl);

    const campos = data.campos.map((c) => ({
      id: c.name,
      label: c.label,
      kind: c.kind,
      required: c.required ?? false,
      ...(c.options && c.options.length > 0 ? { options: c.options } : {}),
    }));

    const base = normalizeSlug(data.nome) || "form-site";
    let slug = `${base}-${Math.random().toString(36).slice(2, 8)}`;
    for (let i = 0; i < 5; i++) {
      const { data: exists } = await sb.from("crm_forms").select("id").eq("slug", slug).maybeSingle();
      if (!exists) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 8)}`;
    }

    const { data: inserted, error } = await sb
      .from("crm_forms")
      .insert({
        workspace_id: wsId,
        slug,
        nome: data.nome,
        descricao: `Importado do site ${siteUrl}`,
        campos,
        branding: {},
        origem: "externo",
        auto_criar_lead: data.autoCriarLead ?? true,
      })
      .select("id, slug, ingest_token")
      .maybeSingle();
    if (error) throw new Error(error.message);

    const row = inserted as { id: string; slug: string; ingest_token: string | null };
    return { id: row.id, slug: row.slug, ingestToken: row.ingest_token };
  });
