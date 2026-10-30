type AnySb = { from: (table: string) => any };

const PERIODS = [
  { code: "1m", catalogName: "Planos Mkton · Mensal", label: "mensal" },
  { code: "3m", catalogName: "Planos Mkton · Trimestral", label: "trimestral" },
  { code: "6m", catalogName: "Planos Mkton · Semestral", label: "semestral" },
  { code: "1y", catalogName: "Planos Mkton · Anual", label: "anual" },
] as const;

const PLAN_NAMES: Record<string, string> = {
  starter: "Start",
  professional: "Growth",
  business: "Performance",
  enterprise: "Scale",
};

const PLAN_DESCRIPTIONS: Record<string, string> = {
  starter: "Plano Start da Mkton.",
  professional: "Plano Growth da Mkton.",
  business: "Plano Performance da Mkton.",
  enterprise: "Plano Scale da Mkton.",
};

export async function provisionMktonProducts(input: {
  sb: AnySb;
  workspaceId: string;
}) {
  const { sb, workspaceId } = input;

  const { data: plans, error: plansError } = await sb
    .from("plans")
    .select("id,code,name,tier")
    .eq("is_active", true)
    .order("tier", { ascending: true });
  if (plansError) throw new Error(plansError.message);

  const commercialPlans = (plans ?? []).filter((plan: { code?: string | null }) =>
    ["starter", "professional", "business", "enterprise"].includes(String(plan.code ?? "")),
  );
  const planIds = commercialPlans.map((p: { id: string }) => p.id);

  const { data: prices, error: pricesError } = planIds.length
    ? await sb
        .from("plan_prices")
        .select("plan_id,period,amount_cents")
        .in("plan_id", planIds)
    : { data: [], error: null };
  if (pricesError) throw new Error(pricesError.message);

  const priceByPlanPeriod = new Map<string, number>();
  for (const row of prices ?? []) {
    priceByPlanPeriod.set(
      `${String(row.plan_id)}:${String(row.period)}`,
      Number(row.amount_cents ?? 0) / 100,
    );
  }

  const { data: existingProducts, error: existingError } = await sb
    .from("products")
    .select("id,sku")
    .eq("workspace_id", workspaceId);
  if (existingError) throw new Error(existingError.message);

  const bySku = new Map<string, string>();
  for (const product of existingProducts ?? []) {
    if (product.sku) bySku.set(String(product.sku), String(product.id));
  }

  const synced: string[] = [];
  const created: string[] = [];
  const updated: string[] = [];
  const catalogs: Array<{ id: string; name: string }> = [];

  for (const period of PERIODS) {
    const { data: existingCatalog, error: catalogError } = await sb
      .from("product_catalogs")
      .select("id,name")
      .eq("workspace_id", workspaceId)
      .eq("name", period.catalogName)
      .maybeSingle();
    if (catalogError) throw new Error(catalogError.message);

    let catalogId: string;
    if (existingCatalog?.id) {
      catalogId = String(existingCatalog.id);
      const { error } = await sb
        .from("product_catalogs")
        .update({ description: `Planos comerciais Vanessa Simoni com cobrança ${period.label}.` })
        .eq("workspace_id", workspaceId)
        .eq("id", catalogId);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await sb
        .from("product_catalogs")
        .insert({
          workspace_id: workspaceId,
          name: period.catalogName,
          description: `Planos comerciais Vanessa Simoni com cobrança ${period.label}.`,
          cover: "",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      catalogId = String(data.id);
    }
    catalogs.push({ id: catalogId, name: period.catalogName });

    for (const plan of commercialPlans) {
      const code = String(plan.code ?? "").trim();
      if (!code) continue;
      const price = priceByPlanPeriod.get(`${String(plan.id)}:${period.code}`);
      if (price == null) {
        throw new Error(`Plano Vanessa Simoni ativo sem preço ${period.label} configurado: ${code}`);
      }

      const sku = `mkton-plan-${code}-${period.code}`;
      const existingId = bySku.get(sku);
      const name = `Mkton · ${PLAN_NAMES[code] ?? String(plan.name ?? code)}`;

      if (existingId) {
        const { error } = await sb
          .from("products")
          .update({
            catalog_id: catalogId,
            name,
            price,
            category: period.catalogName,
            active: true,
          })
          .eq("workspace_id", workspaceId)
          .eq("id", existingId);
        if (error) throw new Error(error.message);
        updated.push(sku);
      } else {
        const { error } = await sb.from("products").insert({
          workspace_id: workspaceId,
          catalog_id: catalogId,
          sku,
          name,
          description: PLAN_DESCRIPTIONS[code] ?? `Plano comercial Mkton · ${name}.`,
          image: "",
          price,
          promo_price: null,
          stock: 0,
          category: period.catalogName,
          active: true,
        });
        if (error) throw new Error(error.message);
        created.push(sku);
      }
      synced.push(sku);
    }
  }

  // Limpa somente os registros legados gerados pelo provisionador antigo.
  const legacySkus = commercialPlans.map((plan: { code?: string | null }) =>
    `mkton-plan-${String(plan.code ?? "")}`,
  );
  if (legacySkus.length) {
    const { error: legacyProductsError } = await sb
      .from("products")
      .delete()
      .eq("workspace_id", workspaceId)
      .in("sku", legacySkus);
    if (legacyProductsError) throw new Error(legacyProductsError.message);
  }

  const { data: legacyCatalog, error: legacyCatalogError } = await sb
    .from("product_catalogs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", "Planos Mkton")
    .maybeSingle();
  if (legacyCatalogError) throw new Error(legacyCatalogError.message);
  if (legacyCatalog?.id) {
    const { data: remaining, error: remainingError } = await sb
      .from("products")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("catalog_id", legacyCatalog.id)
      .limit(1);
    if (remainingError) throw new Error(remainingError.message);
    if (!remaining?.length) {
      const { error: deleteCatalogError } = await sb
        .from("product_catalogs")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("id", legacyCatalog.id);
      if (deleteCatalogError) throw new Error(deleteCatalogError.message);
    }
  }

  return { catalogs, synced, created, updated };
}
