import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export interface Lead360Product {
  id: string;
  name: string;
  price: number;
  image: string;
  kind: string;
  catalogName: string;
}

export interface Lead360Response {
  lead: { id: string; name: string; phone: string | null; email: string | null; value: number };
  company: { id: string; name: string; site: string | null; logoUrl: string | null; leadsCount: number } | null;
  products: Lead360Product[];
  forms: Array<{ id: string; formId: string | null; formName: string; submittedAt: string; values: Record<string, string> }>;
  allForms: Array<{ id: string; nome: string }>;
  files: Array<{ id: string; nome: string; url: string; origem: string; receivedAt: string }>;
  activities: Array<{ id: string; type: string; occurredAt: string }>;
  tasks: Array<{ id: string; title: string; status: string; dueAt: string | null }>;
  agent: { id: string; name: string } | null;
  totals: { produtos: number; arquivos: number; formularios: number; atividades: number; tarefas: number };
}

/**
 * Visão 360º do lead: junta empresa, produtos, formulários, arquivos,
 * atividades, tarefas e agente de IA ativo em uma única chamada.
 * É o "fio" que liga todas as abas do módulo CRM.
 */
export const getLead360 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<Lead360Response> => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const leadId = data.leadId;

    const { data: leadRow } = await sb
      .from("leads")
      .select("id, name, phone, phone_normalized, email, value, company_id, active_conversation_agent_id")
      .eq("workspace_id", wsId)
      .eq("id", leadId)
      .maybeSingle();
    if (!leadRow) throw new Error("Lead não encontrado neste workspace.");
    const lead = leadRow as any;

    /* Empresa */
    let company: Lead360Response["company"] = null;
    if (lead.company_id) {
      const { data: c } = await sb
        .from("companies")
        .select("id, name, site, logo_url")
        .eq("id", lead.company_id)
        .maybeSingle();
      if (c) {
        const { count } = await sb
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId)
          .eq("company_id", lead.company_id);
        company = {
          id: (c as any).id,
          name: (c as any).name,
          site: (c as any).site ?? null,
          logoUrl: (c as any).logo_url ?? null,
          leadsCount: count ?? 0,
        };
      }
    }

    /* Produtos */
    const { data: lp } = await sb
      .from("lead_products")
      .select("kind, product_id, products(id, name, price, image, catalog_id, product_catalogs(name))")
      .eq("workspace_id", wsId)
      .eq("lead_id", leadId);
    const products: Lead360Product[] = ((lp ?? []) as any[])
      .filter((r) => r.products)
      .map((r) => ({
        id: r.products.id,
        name: r.products.name,
        price: Number(r.products.price ?? 0),
        image: r.products.image ?? "",
        kind: r.kind,
        catalogName: r.products.product_catalogs?.name ?? "Catálogo",
      }));

    /* Formulários preenchidos */
    const { data: subs } = await sb
      .from("crm_form_submissions")
      .select("id, form_id, values, submitted_at, crm_forms(nome)")
      .eq("workspace_id", wsId)
      .eq("lead_id", leadId)
      .order("submitted_at", { ascending: false })
      .limit(20);
    const forms = ((subs ?? []) as any[]).map((s) => ({
      id: s.id,
      formId: s.form_id ?? null,
      formName: s.crm_forms?.nome ?? "Formulário",
      submittedAt: s.submitted_at,
      values: Object.fromEntries(
        Object.entries((s.values ?? {}) as Record<string, unknown>).map(([k, v]) => [
          k,
          v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v),
        ]),
      ) as Record<string, string>,
    }));

    /* Arquivos (WhatsApp por telefone + canais por lead) */
    const files: Lead360Response["files"] = [];
    const digits: string | null = lead.phone_normalized || (lead.phone ? String(lead.phone).replace(/\D/g, "") : null);
    if (digits) {
      const { data: waMsgs } = await sb
        .from("whatsapp_web_messages")
        .select("id, message_type, media_url, received_at, sender_phone, remote_jid")
        .eq("workspace_id", wsId)
        .in("message_type", ["image", "audio", "video", "document", "sticker"])
        .not("media_url", "is", null)
        .or(`sender_phone.eq.${digits},remote_jid.like.${digits}%`)
        .order("received_at", { ascending: false })
        .limit(30);
      for (const m of (waMsgs ?? []) as any[]) {
        files.push({
          id: `wa:${m.id}`,
          nome: String(m.media_url).split("/").pop() || m.message_type,
          url: m.media_url,
          origem: "whatsapp",
          receivedAt: m.received_at,
        });
      }
    }
    const { data: chMsgs } = await sb
      .from("channel_messages")
      .select("id, channel, attachments, received_at")
      .eq("workspace_id", wsId)
      .eq("lead_id", leadId)
      .neq("attachments", "[]")
      .order("received_at", { ascending: false })
      .limit(30);
    for (const m of (chMsgs ?? []) as any[]) {
      const atts = Array.isArray(m.attachments) ? m.attachments : [];
      atts.forEach((a: any, i: number) => {
        const url = a?.url || a?.payload?.url;
        if (!url) return;
        files.push({
          id: `ch:${m.id}:${i}`,
          nome: a?.name || a?.filename || String(url).split("/").pop() || "arquivo",
          url,
          origem: m.channel,
          receivedAt: m.received_at,
        });
      });
    }
    files.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));

    /* Atividades */
    const { data: acts } = await sb
      .from("lead_activities")
      .select("id, type, occurred_at")
      .eq("workspace_id", wsId)
      .eq("lead_id", leadId)
      .order("occurred_at", { ascending: false })
      .limit(25);
    const activities = ((acts ?? []) as any[]).map((a) => ({ id: a.id, type: a.type, occurredAt: a.occurred_at }));

    /* Tarefas */
    const { data: tks } = await sb
      .from("tasks")
      .select("id, title, status, start_at")
      .eq("workspace_id", wsId)
      .eq("lead_id", leadId)
      .order("start_at", { ascending: true })
      .limit(20);
    const tasks = ((tks ?? []) as any[]).map((t) => ({
      id: t.id,
      title: t.title ?? "Tarefa",
      status: String(t.status ?? ""),
      dueAt: t.start_at ?? null,
    }));

    /* Agente IA ativo */
    let agent: Lead360Response["agent"] = null;
    if (lead.active_conversation_agent_id) {
      const { data: ag } = await sb
        .from("conversation_ai_agents")
        .select("id, name")
        .eq("id", lead.active_conversation_agent_id)
        .maybeSingle();
      if (ag) agent = { id: (ag as any).id, name: (ag as any).name };
    }

    const { data: allForms } = await sb
      .from("crm_forms")
      .select("id, nome")
      .eq("workspace_id", wsId)
      .order("nome");

    return {
      lead: {
        id: lead.id,
        name: lead.name ?? "Lead",
        phone: lead.phone ?? null,
        email: lead.email ?? null,
        value: Number(lead.value ?? 0),
      },
      company,
      products,
      forms,
      allForms: (allForms ?? []) as any[],
      files: files.slice(0, 40),
      activities,
      tasks,
      agent,
      totals: {
        produtos: products.length,
        arquivos: files.length,
        formularios: forms.length,
        atividades: activities.length,
        tarefas: tasks.length,
      },
    };
  });

/** Vincula (ou desvincula, com companyId null) o lead a uma empresa da aba Empresas. */
export const setLeadCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: z.string().uuid(), companyId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const wsId = await loadActiveWorkspace(sb, context.userId);
    const { error } = await sb
      .from("leads")
      .update({ company_id: data.companyId })
      .eq("workspace_id", wsId)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
