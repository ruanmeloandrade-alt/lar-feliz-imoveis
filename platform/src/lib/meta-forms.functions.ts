// Lista os formulários de Lead Ads (Instant Forms) das páginas conectadas ao
// workspace, para vincular a um formulário do CRM.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH = "v21.0";

export interface MetaLeadForm {
  id: string;
  name: string;
  status: string | null;
  pageId: string;
  pageName: string | null;
}

export interface MetaLeadFormsResult {
  forms: MetaLeadForm[];
  /** Diagnóstico por página, para explicar quando nada é retornado. */
  diagnostics: Array<{ pageId: string; pageName: string | null; ok: boolean; error?: string }>;
  pagesCount: number;
}

export const listMetaLeadForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<MetaLeadFormsResult> => {
    const encKey = process.env['INTEGRATION_ENCRYPTION_KEY'];
    if (!encKey) throw new Error("Integração Meta indisponível (chave de criptografia ausente).");

    let wsId = data.workspaceId;
    if (!wsId) {
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("current_workspace_id")
        .eq("id", context.userId)
        .maybeSingle();
      wsId = (prof as { current_workspace_id?: string } | null)?.current_workspace_id ?? undefined;
    }
    if (!wsId) throw new Error("Workspace ativo não encontrado.");

    // Autorização: precisa ser membro do workspace antes de usar o admin.
    const { data: mem } = await context.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", wsId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!mem) throw new Error("Sem permissão neste workspace.");

    const { data: pages } = await context.supabase
      .from("meta_pages")
      .select("page_id, page_name")
      .eq("workspace_id", wsId);

    const rows = (pages ?? []) as Array<{ page_id: string; page_name: string | null }>;
    if (!rows.length) {
      return { forms: [], diagnostics: [], pagesCount: 0 };
    }

    // A função get_meta_page_token não é executável pelo papel authenticated,
    // então lemos o token com o cliente de serviço (após validar a permissão).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const out: MetaLeadForm[] = [];
    const diagnostics: MetaLeadFormsResult["diagnostics"] = [];

    for (const p of rows) {
      const { data: tok, error: tokErr } = await supabaseAdmin.rpc("get_meta_page_token", {
        _workspace_id: wsId,
        _page_id: p.page_id,
        _key: encKey,
      } as never);
      if (tokErr || !tok) {
        diagnostics.push({
          pageId: p.page_id,
          pageName: p.page_name,
          ok: false,
          error: tokErr?.message ?? "Token da página indisponível. Reconecte a Meta em Integrações.",
        });
        continue;
      }
      const url = new URL(`https://graph.facebook.com/${GRAPH}/${p.page_id}/leadgen_forms`);
      url.searchParams.set("access_token", String(tok));
      url.searchParams.set("fields", "id,name,status");
      url.searchParams.set("limit", "100");
      try {
        const r = await fetch(url.toString());
        const j = (await r.json()) as {
          data?: Array<{ id: string; name?: string; status?: string }>;
          error?: { message?: string; code?: number };
        };
        if (!r.ok || j.error) {
          diagnostics.push({
            pageId: p.page_id,
            pageName: p.page_name,
            ok: false,
            error: j.error?.message ?? `Meta respondeu ${r.status}.`,
          });
          continue;
        }
        for (const f of j.data ?? []) {
          out.push({
            id: f.id,
            name: f.name ?? f.id,
            status: f.status ?? null,
            pageId: p.page_id,
            pageName: p.page_name ?? null,
          });
        }
        diagnostics.push({ pageId: p.page_id, pageName: p.page_name, ok: true });
      } catch (e) {
        diagnostics.push({
          pageId: p.page_id,
          pageName: p.page_name,
          ok: false,
          error: e instanceof Error ? e.message : "Falha ao consultar a Meta.",
        });
      }
    }
    return { forms: out, diagnostics, pagesCount: rows.length };
  });
