type TagCatalogDb = { from: (table: string) => any };

export async function listCrmTagCatalog(db: TagCatalogDb, workspaceId: string): Promise<string[]> {
  const { data, error } = await db.from("workspaces")
    .select("feature_flags").eq("id", workspaceId).maybeSingle();
  if (error) throw new Error("Não foi possível carregar o catálogo de tags.");
  const tags: unknown = data?.feature_flags?.crm_tag_catalog;
  return Array.isArray(tags)
    ? tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : [];
}
