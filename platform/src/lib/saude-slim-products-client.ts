// SLIM_APPROVED_UI_COMMERCE_V1
/**
 * Adaptador da interface de catálogos/produtos original para GitHub Pages.
 * Cada consulta e operação respeita Auth, associação ao workspace e RLS.
 */
import { supabase } from "@/integrations/supabase/client";
import { listSaudeSlimCatalogs } from "@/lib/saude-slim-orders-client";
import { canonicalCategory, categoryKey, cleanCategoryLabel } from "@/lib/product-categories";
import { productDetailsPatch, productStockQuantity, type ProductDetails } from "@/lib/product-import-details";

import {decimalMoney} from "@/lib/slim-money.core";
const sb = supabase as any;

async function workspaceId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Entre novamente na Vanessa Simoni.");
  const { data: profile, error: e } = await sb.from("profiles")
    .select("current_workspace_id").eq("id", data.user.id).maybeSingle();
  if (e) throw new Error(e.message);
  const ws = profile?.current_workspace_id;
  if (!ws) throw new Error("Nenhum workspace ativo.");
  const { data: member, error: m } = await sb.from("workspace_members")
    .select("id").eq("workspace_id", ws).eq("user_id", data.user.id).maybeSingle();
  if (m || !member) throw new Error("Acesso não autorizado a esta empresa.");
  return ws as string;
}
function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
async function knownCategories(ws: string): Promise<string[]> {
  const { data, error } = await sb.from("products")
    .select("category").eq("workspace_id", ws);
  fail(error);
  const result: string[] = [];
  for (const row of data ?? []) {
    const label = cleanCategoryLabel(row.category ?? "");
    if (label && !result.includes(label)) result.push(label);
  }
  return result;
}
type CatalogArgs = { id?: string; name: string; description: string; cover: string };
type ProductArgs = { id?: string; catalogId: string; sku: string; name: string;
  description: string; image: string; price: number; promoPrice?: number | null;
  stock: number; category: string; active: boolean } & ProductDetails;

export const fetchSlimProductCatalogs = listSaudeSlimCatalogs;

export async function saveSlimCatalog({ data }: { data: CatalogArgs }): Promise<{ id: string }> {
  const ws = await workspaceId();
  if (!data.name?.trim()) throw new Error("Informe o nome do catálogo.");
  const patch = { name: data.name.trim(), description: data.description ?? "", cover: data.cover ?? "" };
  if (data.id) {
    const { data: updated, error } = await sb.from("product_catalogs")
      .update(patch).eq("workspace_id", ws).eq("id", data.id).select("id").maybeSingle();
    fail(error);
    if (!updated) throw new Error("Catálogo não encontrado.");
    return { id: updated.id };
  }
  const { data: created, error } = await sb.from("product_catalogs")
    .insert({ workspace_id: ws, ...patch }).select("id").single();
  fail(error);
  return { id: created.id };
}

export async function removeSlimCatalog({ data }: { data: { id: string } }) {
  const ws = await workspaceId();
  const { error } = await sb.from("product_catalogs").delete()
    .eq("workspace_id", ws).eq("id", data.id);
  fail(error);
  return { ok: true };
}

export async function saveSlimProduct({ data }: { data: ProductArgs }): Promise<{ id: string }> {
  const ws = await workspaceId();
  if (!data.name?.trim() || !data.catalogId) throw new Error("Produto e catálogo são obrigatórios.");
  const { data: cat, error: catError } = await sb.from("product_catalogs")
    .select("id").eq("workspace_id", ws).eq("id", data.catalogId).maybeSingle();
  if (catError || !cat) throw new Error("Catálogo não autorizado.");
  const known = await knownCategories(ws);
  const patch = {
    catalog_id: data.catalogId, sku: data.sku ?? "", name: data.name.trim(),
    description: data.description ?? "", image: data.image ?? "",
    price: decimalMoney(data.price),
    promo_price: data.promoPrice == null ? null : decimalMoney(data.promoPrice),
    stock: productStockQuantity(data.stock ?? 0),
    ...productDetailsPatch(data),
    category: canonicalCategory(data.category ?? "", known),
    active: !!data.active,
  };
  if (data.id) {
    const { data: updated, error } = await sb.from("products").update(patch)
      .eq("workspace_id", ws).eq("id", data.id).select("id").maybeSingle();
    fail(error);
    if (!updated) throw new Error("Produto não encontrado.");
    return { id: updated.id };
  }
  const { data: created, error } = await sb.from("products")
    .insert({ workspace_id: ws, ...patch }).select("id").single();
  fail(error);
  return { id: created.id };
}

export async function removeSlimProduct({ data }: { data: { id: string } }) {
  const ws = await workspaceId();
  const { error } = await sb.from("products").delete().eq("workspace_id", ws).eq("id", data.id);
  fail(error);
  return { ok: true };
}

export async function importSlimProducts({ data }: {
  data: { catalogId: string; products: Omit<ProductArgs, "catalogId">[] }
}): Promise<{ inserted: number }> {
  const ws = await workspaceId();
  const { data: cat, error: ce } = await sb.from("product_catalogs")
    .select("id").eq("workspace_id", ws).eq("id", data.catalogId).maybeSingle();
  if (ce || !cat) throw new Error("Catálogo não autorizado.");
  if (data.products.length > 2000) throw new Error("Máximo de 2000 produtos por importação.");
  const known = await knownCategories(ws);
  const rows = data.products.map(product => {
    const category = canonicalCategory(product.category ?? "", known);
    if (category && !known.includes(category)) known.push(category);
    return {
      workspace_id: ws, catalog_id: data.catalogId, sku: product.sku ?? "",
      name: product.name, description: product.description ?? "",
      image: product.image ?? "", price: decimalMoney(product.price),
      promo_price: product.promoPrice == null ? null : decimalMoney(product.promoPrice),
      stock: productStockQuantity(product.stock ?? 0),
      ...productDetailsPatch(product),
      category, active: !!product.active,
    };
  });
  // Lotes pequenos para limitar payload e memória do navegador.
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await sb.from("products").insert(rows.slice(i, i + 100));
    fail(error);
  }
  return { inserted: rows.length };
}

export async function renameSlimCategory({ data }: {
  data: { from: string; to: string }
}): Promise<{ updated: number; category: string }> {
  const ws = await workspaceId();
  const known = await knownCategories(ws);
  const target = canonicalCategory(data.to, known.filter(v => categoryKey(v) !== categoryKey(data.from)));
  const { data: records, error } = await sb.from("products")
    .select("id,category").eq("workspace_id", ws);
  fail(error);
  const ids = (records ?? []).filter((v: { category: string | null }) =>
    categoryKey(v.category ?? "") === categoryKey(data.from)).map((v: { id: string }) => v.id);
  if (!ids.length) return { updated: 0, category: target };
  const { error: updateError } = await sb.from("products").update({ category: target })
    .eq("workspace_id", ws).in("id", ids);
  fail(updateError);
  return { updated: ids.length, category: target };
}
