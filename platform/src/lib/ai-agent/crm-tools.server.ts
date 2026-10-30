import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

type CrmToolsContext = {
  supabase: SupabaseClient;
  workspaceId: string;
};

function displayValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const parsed = value as { display?: unknown; raw?: unknown };
    if (typeof parsed.display === "string") return parsed.display;
    if (Array.isArray(parsed.raw)) return parsed.raw.map(String).join(", ");
  }
  return String(value);
}

export function buildCrmTools({ supabase, workspaceId }: CrmToolsContext) {
  return {
    list_custom_fields: tool({
      description: "Lista os campos personalizados disponíveis neste CRM. Use para descobrir os IDs e nomes antes de consultar ou atualizar um valor.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("lead_custom_fields")
          .select("id,name,field_type,options")
          .eq("workspace_id", workspaceId)
          .order("name");
        if (error) throw new Error(error.message);
        return { fields: data ?? [] };
      },
    }),
    get_lead_custom_fields: tool({
      description: "Consulta todos os campos personalizados e valores atuais de um lead deste workspace.",
      inputSchema: z.object({ leadId: z.string().uuid() }),
      execute: async ({ leadId }) => {
        const { data: lead } = await supabase.from("leads").select("id,name")
          .eq("workspace_id", workspaceId).eq("id", leadId).maybeSingle();
        if (!lead) throw new Error("Lead não encontrado neste workspace.");
        const { data, error } = await supabase.from("lead_custom_field_values")
          .select("value,lead_custom_fields(id,name,field_type)")
          .eq("workspace_id", workspaceId).eq("lead_id", leadId);
        if (error) throw new Error(error.message);
        return {
          lead,
          values: (data ?? []).map((row) => ({
            field: row.lead_custom_fields,
            value: displayValue(row.value),
          })),
        };
      },
    }),
    set_lead_custom_field: tool({
      description: "Define o valor de um campo personalizado para um lead. Só use após identificar corretamente lead e campo. Esta ação é automática e atualiza o CRM imediatamente.",
      inputSchema: z.object({
        leadId: z.string().uuid(),
        fieldId: z.string().uuid(),
        value: z.string(),
      }),
      needsApproval: false,

      execute: async ({ leadId, fieldId, value }) => {
        const [{ data: lead }, { data: field }] = await Promise.all([
          supabase.from("leads").select("id").eq("workspace_id", workspaceId).eq("id", leadId).maybeSingle(),
          supabase.from("lead_custom_fields").select("id,name").eq("workspace_id", workspaceId).eq("id", fieldId).maybeSingle(),
        ]);
        if (!lead) throw new Error("Lead não encontrado neste workspace.");
        if (!field) throw new Error("Campo personalizado não encontrado neste workspace.");
        const { error } = await supabase.from("lead_custom_field_values").upsert({
          workspace_id: workspaceId,
          lead_id: leadId,
          field_id: fieldId,
          value: { display: value, raw: [value] },
          updated_at: new Date().toISOString(),
        }, { onConflict: "lead_id,field_id" });
        if (error) throw new Error(error.message);
        return { ok: true, leadId, fieldId, fieldName: field.name, value };
      },
    }),

    list_products: tool({
      description:
        "Lista os produtos dos catálogos do CRM (nome, preço, promoção, estoque e categoria). Use antes de oferecer ou vincular um produto a um lead.",
      inputSchema: z.object({ search: z.string().optional() }),
      execute: async ({ search }) => {
        let q = supabase
          .from("products")
          .select("id,name,description,price,promo_price,stock,category,active,product_catalogs(name)")
          .eq("workspace_id", workspaceId)
          .eq("active", true)
          .limit(60);
        if (search) q = q.ilike("name", `%${search}%`);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return {
          products: (data ?? []).map((p: Record<string, any>) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            price: Number(p.price ?? 0),
            promoPrice: p.promo_price == null ? null : Number(p.promo_price),
            stock: p.stock,
            category: p.category,
            catalog: p.product_catalogs?.name ?? null,
          })),
        };
      },
    }),

    link_product_to_lead: tool({
      description:
        "Registra que o lead demonstrou interesse (kind=interesse) ou comprou (kind=comprou) um produto do catálogo. Exige aprovação.",
      inputSchema: z.object({
        leadId: z.string().uuid(),
        productId: z.string().uuid(),
        kind: z.enum(["interesse", "comprou"]).default("interesse"),
      }),
      needsApproval: true,
      execute: async ({ leadId, productId, kind }) => {
        const [{ data: lead }, { data: product }] = await Promise.all([
          supabase.from("leads").select("id").eq("workspace_id", workspaceId).eq("id", leadId).maybeSingle(),
          supabase.from("products").select("id,name").eq("workspace_id", workspaceId).eq("id", productId).maybeSingle(),
        ]);
        if (!lead) throw new Error("Lead não encontrado neste workspace.");
        if (!product) throw new Error("Produto não encontrado neste workspace.");
        const { error } = await supabase
          .from("lead_products")
          .upsert({ workspace_id: workspaceId, lead_id: leadId, product_id: productId, kind }, { onConflict: "lead_id,product_id,kind" });
        if (error) throw new Error(error.message);
        return { ok: true, leadId, product: (product as { name: string }).name, kind };
      },
    }),

    get_lead_overview: tool({
      description:
        "Visão 360º do lead: dados básicos, empresa vinculada, produtos de interesse/comprados, formulários preenchidos e últimas atividades.",
      inputSchema: z.object({ leadId: z.string().uuid() }),
      execute: async ({ leadId }) => {
        const { data: lead } = await supabase
          .from("leads")
          .select("id,name,phone,email,value,stage_id,company_id")
          .eq("workspace_id", workspaceId)
          .eq("id", leadId)
          .maybeSingle();
        if (!lead) throw new Error("Lead não encontrado neste workspace.");
        const l = lead as Record<string, any>;

        const [companyRes, productsRes, formsRes, actsRes] = await Promise.all([
          l.company_id
            ? supabase.from("companies").select("id,name,site").eq("id", l.company_id).maybeSingle()
            : Promise.resolve({ data: null } as { data: unknown }),
          supabase
            .from("lead_products")
            .select("kind,products(name,price,promo_price)")
            .eq("workspace_id", workspaceId)
            .eq("lead_id", leadId),
          supabase
            .from("crm_form_submissions")
            .select("submitted_at,values,crm_forms(nome)")
            .eq("workspace_id", workspaceId)
            .eq("lead_id", leadId)
            .order("submitted_at", { ascending: false })
            .limit(5),
          supabase
            .from("lead_activities")
            .select("type,occurred_at")
            .eq("workspace_id", workspaceId)
            .eq("lead_id", leadId)
            .order("occurred_at", { ascending: false })
            .limit(10),
        ]);

        return {
          lead: { id: l.id, name: l.name, phone: l.phone, email: l.email, value: Number(l.value ?? 0) },
          company: companyRes.data ?? null,
          products: ((productsRes.data ?? []) as Record<string, any>[]).map((r) => ({
            kind: r.kind,
            name: r.products?.name,
            price: Number(r.products?.promo_price ?? r.products?.price ?? 0),
          })),
          forms: ((formsRes.data ?? []) as Record<string, any>[]).map((f) => ({
            form: f.crm_forms?.nome ?? "Formulário",
            submittedAt: f.submitted_at,
            values: f.values,
          })),
          activities: actsRes.data ?? [],
        };
      },
    }),
  };
}
