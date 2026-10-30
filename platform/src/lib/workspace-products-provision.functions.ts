import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

const productSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  image: z.string().default(""),
  price: z.number().min(0),
  promoPrice: z.number().min(0).nullable().optional(),
  stock: z.number().int().default(0),
  category: z.string().default(""),
  active: z.boolean().default(true),
});

const catalogSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  cover: z.string().default(""),
  products: z.array(productSchema).min(1),
});

const inputSchema = z.object({
  workspaceSlug: z.string().min(1),
  catalogs: z.array(catalogSchema).min(1),
});

/**
 * Rota administrativa canônica para materializar catálogos/produtos em um workspace conhecido.
 *
 * Regras:
 * - somente super_admin;
 * - resolve o workspace pelo slug, nunca por ID chutado;
 * - catálogo é idempotente por (workspace_id, name);
 * - produto é idempotente por (workspace_id, sku);
 * - não apaga produtos/catálogos fora do payload;
 * - atualização preserva vínculo estável via SKU.
 */
export const provisionWorkspaceProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;

    const { data: isSuperAdmin, error: roleError } = await sb.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (isSuperAdmin !== true) throw new Error("Apenas super_admin pode provisionar produtos por slug.");

    const normalizedSlug = data.workspaceSlug.trim().toLowerCase();
    const { data: workspace, error: workspaceError } = await sb
      .from("workspaces")
      .select("id,name,slug")
      .eq("slug", normalizedSlug)
      .maybeSingle();
    if (workspaceError) throw new Error(workspaceError.message);
    if (!workspace?.id) throw new Error(`Workspace não encontrado: ${normalizedSlug}`);

    const workspaceId = String(workspace.id);
    const createdCatalogs: string[] = [];
    const updatedCatalogs: string[] = [];
    const createdProducts: string[] = [];
    const updatedProducts: string[] = [];

    for (const catalog of data.catalogs) {
      const { data: existingCatalog, error: existingCatalogError } = await sb
        .from("product_catalogs")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("name", catalog.name)
        .maybeSingle();
      if (existingCatalogError) throw new Error(existingCatalogError.message);

      let catalogId: string;
      if (existingCatalog?.id) {
        catalogId = String(existingCatalog.id);
        const { error } = await sb
          .from("product_catalogs")
          .update({ description: catalog.description, cover: catalog.cover })
          .eq("workspace_id", workspaceId)
          .eq("id", catalogId);
        if (error) throw new Error(error.message);
        updatedCatalogs.push(catalog.name);
      } else {
        const { data: insertedCatalog, error } = await sb
          .from("product_catalogs")
          .insert({
            workspace_id: workspaceId,
            name: catalog.name,
            description: catalog.description,
            cover: catalog.cover,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        catalogId = String(insertedCatalog.id);
        createdCatalogs.push(catalog.name);
      }

      for (const product of catalog.products) {
        const { data: existingProduct, error: existingProductError } = await sb
          .from("products")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("sku", product.sku)
          .maybeSingle();
        if (existingProductError) throw new Error(existingProductError.message);

        const patch = {
          catalog_id: catalogId,
          sku: product.sku,
          name: product.name,
          description: product.description,
          image: product.image,
          price: product.price,
          promo_price: product.promoPrice ?? null,
          stock: product.stock,
          category: product.category || catalog.name,
          active: product.active,
        };

        if (existingProduct?.id) {
          const { error } = await sb
            .from("products")
            .update(patch)
            .eq("workspace_id", workspaceId)
            .eq("id", existingProduct.id);
          if (error) throw new Error(error.message);
          updatedProducts.push(product.sku);
        } else {
          const { error } = await sb.from("products").insert({
            workspace_id: workspaceId,
            ...patch,
          });
          if (error) throw new Error(error.message);
          createdProducts.push(product.sku);
        }
      }
    }

    return {
      ok: true,
      workspace: {
        id: workspaceId,
        name: String(workspace.name ?? ""),
        slug: String(workspace.slug ?? normalizedSlug),
      },
      createdCatalogs,
      updatedCatalogs,
      createdProducts,
      updatedProducts,
    };
  });
