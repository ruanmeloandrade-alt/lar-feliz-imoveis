import {vanessaPropertySchema} from "./vanessa-property";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canonicalCategory, cleanCategoryLabel } from "@/lib/product-categories";
import { productDetailsFromRow, productDetailsPatch, type ProductDetails } from "@/lib/product-import-details";

type AnySb = { from: (t: string) => any };

async function loadActiveWorkspace(supabase: AnySb, userId: string): Promise<string> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  const wsId = (prof as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!wsId) throw new Error("Workspace ativo não encontrado.");
  return wsId;
}

/** Categorias já usadas no workspace — base para reaproveitar a grafia oficial. */
async function loadWorkspaceCategories(sb: AnySb, wsId: string): Promise<string[]> {
  const { data } = await sb.from("products").select("category").eq("workspace_id", wsId);
  const out: string[] = [];
  for (const r of (data ?? []) as Array<{ category: string | null }>) {
    const label = cleanCategoryLabel(r.category ?? "");
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}


export interface DbProduct extends ProductDetails {
  id: string;
  catalogId: string;
  sku: string;
  name: string;
  description: string;
  image: string;
  price: number;
  promoPrice?: number;
  stock: number;
  category: string;
  active: boolean;
}

export interface DbCatalog {
  id: string;
  name: string;
  description: string;
  cover: string;
  products: DbProduct[];
}

const productInput = z.object({
  property: vanessaPropertySchema.optional(),
  id: z.string().uuid().optional(),
  catalogId: z.string().uuid(),
  sku: z.string().default(""),
  name: z.string().min(1),
  description: z.string().default(""),
  image: z.string().default(""),
  price: z.number().min(0).default(0),
  promoPrice: z.number().min(0).nullable().optional(),
  stock: z.number().int().default(0),
  costPrice: z.number().min(0).nullable().optional(),
  minStock: z.number().int().min(0).nullable().optional(),
  unit: z.string().optional(),
  stockKnown: z.boolean().optional(),
  category: z.string().default(""),
  active: z.boolean().default(true),
});

/** Catálogos + produtos do workspace ativo (fonte única para CRM, bots e agentes). */
export const listProductCatalogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DbCatalog[]> => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);

    const { data: cats } = await sb
      .from("product_catalogs")
      .select("id, name, description, cover")
      .eq("workspace_id", wsId)
      .order("created_at");
    const { data: prods } = await sb
      .from("products")
      .select("id, catalog_id, sku, name, description, image, price, promo_price, stock, category, active, cost_price, minimum_stock, unit, stock_known, import_snapshot, public_property")
      .eq("workspace_id", wsId)
      .order("created_at");

    const byCatalog = new Map<string, DbProduct[]>();
    for (const p of (prods ?? []) as any[]) {
      const item: DbProduct = {
        ...productDetailsFromRow(p),
        id: p.id,
        catalogId: p.catalog_id,
        sku: p.sku ?? "",
        name: p.name,
        description: p.description ?? "",
        image: p.image ?? "",
        price: Number(p.price ?? 0),
        promoPrice: p.promo_price == null ? undefined : Number(p.promo_price),
        stock: Number(p.stock ?? 0),
        category: p.category ?? "",
        active: !!p.active,
      };
      const arr = byCatalog.get(item.catalogId) ?? [];
      arr.push(item);
      byCatalog.set(item.catalogId, arr);
    }

    return ((cats ?? []) as any[]).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? "",
      cover: c.cover ?? "",
      products: byCatalog.get(c.id) ?? [],
    }));
  });

export const saveProductCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        description: z.string().default(""),
        cover: z.string().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (data.id) {
      const { error } = await sb
        .from("product_catalogs")
        .update({ name: data.name, description: data.description, cover: data.cover })
        .eq("id", data.id)
        .eq("workspace_id", wsId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await sb
      .from("product_catalogs")
      .insert({ workspace_id: wsId, name: data.name, description: data.description, cover: data.cover })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const deleteProductCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb.from("product_catalogs").delete().eq("id", data.id).eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => productInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    // Reaproveita a grafia oficial da categoria já usada no workspace,
    // para o produto entrar no mesmo grupo das métricas.
    const known = await loadWorkspaceCategories(sb, wsId);
    const patch = {
      ...productDetailsPatch(data),
      catalog_id: data.catalogId,
      sku: data.sku,
      name: data.name,
      description: data.description,
      image: data.image,
      price: data.price,
      promo_price: data.promoPrice ?? null,
      stock: data.stock,
      category: canonicalCategory(data.category, known),
      active: data.active,
    };

    if (data.id) {
      const { error } = await sb.from("products").update(patch).eq("id", data.id).eq("workspace_id", wsId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await sb
      .from("products")
      .insert({ workspace_id: wsId, ...patch })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb.from("products").delete().eq("id", data.id).eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Importa vários produtos de uma vez (CSV/planilha) para um catálogo. */
export const bulkUpsertProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ catalogId: z.string().uuid(), products: z.array(productInput.omit({ catalogId: true })).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    if (!data.products.length) return { inserted: 0 };
    const known = await loadWorkspaceCategories(sb, wsId);
    const rows = data.products.map((p) => {
      const category = canonicalCategory(p.category, known);
      if (category && !known.includes(category)) known.push(category);
      return {
        workspace_id: wsId,
        catalog_id: data.catalogId,
        sku: p.sku,
        name: p.name,
        description: p.description,
        image: p.image,
        price: p.price,
        promo_price: p.promoPrice ?? null,
        stock: p.stock,
        ...productDetailsPatch(p),
        category,
        active: p.active,
      };
    });

    const { error } = await sb.from("products").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

/* ---------------- Vínculo lead ↔ produto ---------------- */

export const linkLeadProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        productId: z.string().uuid(),
        kind: z.enum(["interesse", "comprou"]).default("interesse"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb
      .from("lead_products")
      .upsert(
        { workspace_id: wsId, lead_id: data.leadId, product_id: data.productId, kind: data.kind },
        { onConflict: "lead_id,product_id,kind" },
      );
    if (error) throw new Error(error.message);

    await sb.from("lead_activities").insert({
      workspace_id: wsId,
      lead_id: data.leadId,
      type: "produto_vinculado",
    });

    return { ok: true };
  });

export const unlinkLeadProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: z.string().uuid(), productId: z.string().uuid(), kind: z.string().default("interesse") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb
      .from("lead_products")
      .delete()
      .eq("workspace_id", wsId)
      .eq("lead_id", data.leadId)
      .eq("product_id", data.productId)
      .eq("kind", data.kind);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Leads ligados a um produto — usado na aba Produtos para ver quem quer/comprou. */
export const listProductLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { data: links } = await sb
      .from("lead_products")
      .select("kind, lead_id, leads(id, name, phone, email, value, stage_id)")
      .eq("workspace_id", wsId)
      .eq("product_id", data.productId);
    return ((links ?? []) as any[]).map((l) => ({
      kind: l.kind as string,
      id: l.leads?.id ?? l.lead_id,
      name: l.leads?.name ?? "Lead",
      phone: l.leads?.phone ?? null,
      email: l.leads?.email ?? null,
      value: Number(l.leads?.value ?? 0),
    }));
  });

/* ---------------- Categorias ---------------- */

/**
 * Renomeia / funde categorias do workspace. Todos os produtos da categoria
 * de origem passam a apontar para a grafia de destino, mantendo o vínculo
 * único usado nas métricas.
 */
export const renameProductCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ from: z.string().min(1), to: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { categoryKey } = await import("@/lib/product-categories");

    const known = await loadWorkspaceCategories(sb, wsId);
    const target = canonicalCategory(data.to, known.filter((c) => categoryKey(c) !== categoryKey(data.from)));
    const fromKey = categoryKey(data.from);

    const { data: rows } = await sb
      .from("products")
      .select("id, category")
      .eq("workspace_id", wsId);
    const ids = ((rows ?? []) as Array<{ id: string; category: string | null }>)
      .filter((r) => categoryKey(r.category ?? "") === fromKey)
      .map((r) => r.id);
    if (!ids.length) return { updated: 0, category: target };

    const { error } = await sb
      .from("products")
      .update({ category: target })
      .eq("workspace_id", wsId)
      .in("id", ids);
    if (error) throw new Error(error.message);
    return { updated: ids.length, category: target };
  });
