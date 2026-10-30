import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveWorkspace } from "@/lib/workspace-resolver.server";

/*
 * Exceção de backend aprovada para a frente de robustez do CRM.
 *
 * Regra comercial da Venda ganha:
 * - produto é opcional;
 * - sem produto, o valor final informado é obrigatório;
 * - com produto e sem valor sobrescrito, usa promo_price quando existir, senão price;
 * - com produto e valor sobrescrito, leads.value recebe o valor efetivamente vendido;
 * - receita nunca é recalculada a partir do preço atual do catálogo depois do fechamento.
 */

type AnySb = { from: (table: string) => any };

const saleInput = z.object({
  leadId: z.string().uuid(),
  wonStageId: z.string().uuid(),
  productId: z.string().uuid().nullable().optional(),
  finalValue: z.number().finite().min(0).nullable().optional(),
});

function effectiveProductPrice(product: { price: number | null; promo_price?: number | null }) {
  const promotional = product.promo_price == null ? null : Number(product.promo_price);
  if (promotional != null && Number.isFinite(promotional)) return promotional;
  return Number(product.price ?? 0);
}

export const listWonSaleOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await requireActiveWorkspace(sb as never, context.userId);

    const [{ data: leads, error: leadsError }, { data: products, error: productsError }, { data: pipelines, error: pipelinesError }] =
      await Promise.all([
        sb
          .from("leads")
          .select("id, name, value, pipeline_id, stage_id")
          .eq("workspace_id", workspaceId)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(500),
        sb
          .from("products")
          .select("id, name, price, promo_price, catalog_id")
          .eq("workspace_id", workspaceId)
          .eq("active", true)
          .order("name"),
        sb
          .from("pipelines")
          .select("id, name")
          .eq("workspace_id", workspaceId)
          .order("position"),
      ]);

    if (leadsError) throw new Error(leadsError.message);
    if (productsError) throw new Error(productsError.message);
    if (pipelinesError) throw new Error(pipelinesError.message);

    const pipelineIds = ((pipelines ?? []) as Array<{ id: string }>).map((p) => p.id);
    let stages: Array<{ id: string; pipeline_id: string; name: string; position: number | null }> = [];
    if (pipelineIds.length > 0) {
      const { data: stageRows, error: stageError } = await sb
        .from("pipeline_stages")
        .select("id, pipeline_id, name, position")
        .eq("workspace_id", workspaceId)
        .in("pipeline_id", pipelineIds)
        .order("position");
      if (stageError) throw new Error(stageError.message);
      stages = (stageRows ?? []) as typeof stages;
    }

    const wonStages = stages.filter((stage) => /ganh|venda\s*(realiz|fechad|conclu)|fechad.*ganh/i.test(stage.name));
    const pipelineMap = new Map(((pipelines ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));

    return {
      leads: ((leads ?? []) as Array<{ id: string; name: string; value: number | null; pipeline_id: string | null; stage_id: string | null }>).map((lead) => ({
        id: lead.id,
        name: lead.name,
        value: Number(lead.value ?? 0),
        pipelineId: lead.pipeline_id,
        stageId: lead.stage_id,
        pipelineName: lead.pipeline_id ? pipelineMap.get(lead.pipeline_id) ?? "Funil" : "Sem funil",
      })),
      products: ((products ?? []) as Array<{ id: string; name: string; price: number | null; promo_price: number | null; catalog_id: string | null }>).map((product) => ({
        id: product.id,
        name: product.name,
        price: effectiveProductPrice(product),
        catalogId: product.catalog_id,
      })),
      wonStages: wonStages.map((stage) => ({
        id: stage.id,
        pipelineId: stage.pipeline_id,
        pipelineName: pipelineMap.get(stage.pipeline_id) ?? "Funil",
        name: stage.name,
      })),
    };
  });

export const registerWonSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saleInput.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await requireActiveWorkspace(sb as never, context.userId);

    const { data: lead, error: leadError } = await sb
      .from("leads")
      .select("id, pipeline_id, stage_id")
      .eq("id", data.leadId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!lead) throw new Error("Lead não encontrado neste workspace.");

    const { data: stage, error: stageError } = await sb
      .from("pipeline_stages")
      .select("id, pipeline_id, name")
      .eq("id", data.wonStageId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (stageError) throw new Error(stageError.message);
    if (!stage) throw new Error("Etapa de venda ganha não encontrada.");
    if (!/ganh|venda\s*(realiz|fechad|conclu)|fechad.*ganh/i.test(String(stage.name ?? ""))) {
      throw new Error("A etapa selecionada não é uma etapa de venda ganha.");
    }

    let product: { id: string; name: string; price: number | null; promo_price: number | null } | null = null;
    if (data.productId) {
      const { data: productRow, error: productError } = await sb
        .from("products")
        .select("id, name, price, promo_price")
        .eq("id", data.productId)
        .eq("workspace_id", workspaceId)
        .eq("active", true)
        .maybeSingle();
      if (productError) throw new Error(productError.message);
      if (!productRow) throw new Error("Produto não encontrado neste workspace.");
      product = productRow as { id: string; name: string; price: number | null; promo_price: number | null };
    }

    if (!product && data.finalValue == null) throw new Error("Informe o valor final da venda ou selecione um produto.");

    const catalogValue = product ? effectiveProductPrice(product) : null;
    const finalValue = data.finalValue != null ? data.finalValue : Number(catalogValue ?? 0);
    if (!Number.isFinite(finalValue) || finalValue < 0) throw new Error("Valor final inválido.");

    const now = new Date().toISOString();
    const previousStageId = (lead as { stage_id: string | null }).stage_id;
    const targetPipelineId = (stage as { pipeline_id: string }).pipeline_id;

    const { error: updateError } = await sb
      .from("leads")
      .update({ value: finalValue, stage_id: data.wonStageId, pipeline_id: targetPipelineId, updated_at: now })
      .eq("id", data.leadId)
      .eq("workspace_id", workspaceId);
    if (updateError) throw new Error(updateError.message);

    if (product) {
      const { error: linkError } = await sb.from("lead_products").upsert(
        { workspace_id: workspaceId, lead_id: data.leadId, product_id: product.id, kind: "comprou" },
        { onConflict: "lead_id,product_id,kind" },
      );
      if (linkError) throw new Error(linkError.message);
    }

    await sb.from("lead_activities").insert({
      workspace_id: workspaceId,
      lead_id: data.leadId,
      type: "venda_ganha",
      payload: {
        final_value: finalValue,
        product_id: product?.id ?? null,
        product_name: product?.name ?? null,
        catalog_price: catalogValue,
        value_overridden: Boolean(product && data.finalValue != null && data.finalValue !== catalogValue),
        from_stage_id: previousStageId,
        to_stage_id: data.wonStageId,
        registered_by: context.userId,
      },
      occurred_at: now,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dispatchCrmStageMoved } = await import("@/lib/crm-event-dispatch.server");
    await dispatchCrmStageMoved(supabaseAdmin as never, {
      workspaceId,
      leadId: data.leadId,
      newStageId: data.wonStageId,
      newPipelineId: targetPipelineId,
      fromStageId: previousStageId,
    });

    return { ok: true, finalValue, productId: product?.id ?? null, usedCatalogPrice: Boolean(product && data.finalValue == null) };
  });
