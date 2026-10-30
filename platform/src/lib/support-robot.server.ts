import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveEntitledModules } from "@/lib/billing/entitlements";

/**
 * Ferramentas do Copiloto Vanessa Simoni.
 * O Copiloto atua como mordomo operacional do workspace: lê contexto,
 * conversa, histórico e executa ações internas quando o usuário pedir.
 */
export function buildSupportDiagnosticsTools(supabase: SupabaseClient, workspaceId: string, userId?: string) {
  return {
    check_workspace_status: tool({
      description: "Ferramenta principal do Copiloto para revisar o workspace. Use para diagnosticar conexões e configuração. Enquanto houver configuração obrigatória do plano pendente, priorize implementação/ativação; quando o checklist estiver completo, use como diagnóstico normal da plataforma.",
      inputSchema: z.object({}),
      execute: async () => {
        const [
          { data: workspace },
          { data: subscription },
          { data: workspaceModules },
          { data: metaAccts },
          { data: metaPages },
          { data: whatsapp },
          { data: salesbots },
          { data: crmFunnels },
          { data: integrations }
        ] = await Promise.all([
          supabase.from("workspaces").select("feature_flags").eq("id", workspaceId).maybeSingle(),
          supabase.from("subscriptions").select("status, trial_ends_at, plan_code").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("workspace_modules").select("modules").eq("workspace_id", workspaceId).maybeSingle(),
          supabase.from("meta_ad_accounts").select("id, name, status").eq("workspace_id", workspaceId),
          supabase.from("meta_pages").select("id, page_name").eq("workspace_id", workspaceId),
          supabase.from("whatsapp_configs" as any).select("status, phone_number").eq("workspace_id", workspaceId).maybeSingle(),
          supabase.from("salesbots").select("id, name, status").eq("workspace_id", workspaceId),
          supabase.from("crm_funnels").select("id, name").eq("workspace_id", workspaceId),
          supabase.from("integrations").select("provider, status").eq("workspace_id", workspaceId)
        ]);

        const entitledModules = effectiveEntitledModules({
          status: subscription?.status,
          trialEndsAt: subscription?.trial_ends_at,
          planCode: subscription?.plan_code,
          workspaceModules: workspaceModules?.modules,
        });
        const entitled = new Set<string>(entitledModules);
        const featureFlags = workspace?.feature_flags && typeof workspace.feature_flags === "object" && !Array.isArray(workspace.feature_flags)
          ? workspace.feature_flags as Record<string, unknown>
          : {};
        const activatedRaw = featureFlags.activated_modules;
        const activated = new Set<string>(Array.isArray(activatedRaw) ? activatedRaw.filter((id): id is string => typeof id === "string") : []);
        const metaRequired = ["meta_events", "trafego_kpis_read", "trafego_automacoes", "trafego_ia"].some((id) => entitled.has(id));
        const trackingRequired = ["tracking_crm", "tracking"].some((id) => entitled.has(id));
        const workflowRequired = entitled.has("fluxo_trabalho");
        const notesRequired = entitled.has("notas");
        const aiModuleRequired = ["agentes_ia", "trafego_ia", "social_media_ia"].some((id) => entitled.has(id));
        const metaConnected = Boolean(integrations?.some((i) => i.provider === "meta" && i.status === "connected"));
        const openaiStatus = integrations?.find((i) => i.provider === "openai")?.status || "não configurado";
        const whatsappStatus = whatsapp ? (whatsapp as any).status : "não configurado";
        const funnelCount = (crmFunnels ?? []).length;
        const botCount = (salesbots ?? []).length;
        const activeBotCount = (salesbots ?? []).filter((bot) => bot.status === "active").length;

        const implementationChecklist = [
          { key: "ai", label: "IA do workspace conectada", required: true, done: openaiStatus === "connected" },
          { key: "crm", label: "CRM com funil", required: entitled.has("crm_mkton"), done: funnelCount > 0 },
          { key: "whatsapp", label: "Canal WhatsApp configurado", required: entitled.has("crm_mkton"), done: whatsappStatus === "connected" || whatsappStatus === "active" },
          { key: "salesbot", label: "SalesBot criado", required: entitled.has("crm_mkton"), done: botCount > 0 },
          { key: "meta", label: "Meta conectada", required: metaRequired, done: metaConnected },
          { key: "tracking", label: "Tracking ativado", required: trackingRequired, done: activated.has("tracking") || activated.has("tracking_crm") },
          { key: "workflow", label: "Fluxo de Trabalho ativado", required: workflowRequired, done: activated.has("fluxo_trabalho") },
          { key: "notes", label: "Notas ativadas", required: notesRequired, done: activated.has("notas") },
          { key: "ai_modules", label: "Módulos de IA ativados", required: aiModuleRequired, done: openaiStatus === "connected" },
        ].filter((item) => item.required);
        const implementationComplete = implementationChecklist.every((item) => item.done);

        return {
          copilot: {
            mode: implementationComplete ? "assistant" : "implementation",
            planCode: subscription?.plan_code ?? null,
            implementationComplete,
            pendingItems: implementationChecklist.filter((item) => !item.done).map((item) => item.label),
            priority: implementationComplete
              ? "Atue como Copiloto permanente da plataforma: responda dúvidas, diagnostique configurações e ajude o usuário a operar melhor a MktOn."
              : "Priorize terminar a implementação: identifique o próximo item obrigatório do plano ainda incompleto, explique o caminho dentro da MktOn e valide o resultado antes de avançar.",
            implementationChecklist,
          },
          meta: {
            accounts: (metaAccts ?? []).length,
            pages: (metaPages ?? []).length,
            connected: metaConnected,
          },
          whatsapp: whatsapp ? { status: whatsappStatus, phone: (whatsapp as any).phone_number } : "não configurado",
          crm: {
            funnels: funnelCount,
            salesbots: botCount,
            activeBots: activeBotCount,
          },
          openai: openaiStatus,
        };
      },
    }),

    list_leads: tool({
      description: "Busca leads/clientes do workspace por nome, telefone, email, etapa ou funil. Use antes de mover etapa, ler histórico ou gerar diagnóstico de um cliente específico.",
      inputSchema: z.object({
        search: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ search, limit }) => {
        let q = supabase
          .from("leads")
          .select("id,name,phone,email,value,stage_id,pipeline_id,updated_at,pipeline_stages(name,pipelines(name))")
          .eq("workspace_id", workspaceId)
          .order("updated_at", { ascending: false })
          .limit(limit);
        const needle = search?.trim();
        if (needle) q = q.or(`name.ilike.%${needle}%,phone.ilike.%${needle}%,email.ilike.%${needle}%`);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return {
          leads: ((data ?? []) as any[]).map((lead) => ({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            value: Number(lead.value ?? 0),
            stageId: lead.stage_id,
            pipelineId: lead.pipeline_id,
            stage: lead.pipeline_stages?.name ?? null,
            funnel: lead.pipeline_stages?.pipelines?.name ?? null,
            updatedAt: lead.updated_at,
          })),
        };
      },
    }),

    list_pipeline_stages: tool({
      description: "Lista funis e etapas disponíveis. Use para descobrir o stageId real antes de mover um lead de etapa.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("pipelines")
          .select("id,name,pipeline_stages(id,name,position)")
          .eq("workspace_id", workspaceId)
          .order("position");
        if (error) throw new Error(error.message);
        return {
          pipelines: ((data ?? []) as any[]).map((pipeline) => ({
            id: pipeline.id,
            name: pipeline.name,
            stages: [...(pipeline.pipeline_stages ?? [])].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)),
          })),
        };
      },
    }),

    move_lead_stage: tool({
      description: "Move um lead para outra etapa real do funil e registra a ação no histórico. Use quando o usuário pedir para trocar um lead de etapa.",
      inputSchema: z.object({
        leadId: z.string().uuid(),
        stageId: z.string().uuid(),
        note: z.string().max(500).optional(),
      }),
      execute: async ({ leadId, stageId, note }) => {
        const [{ data: lead }, { data: stage }] = await Promise.all([
          supabase.from("leads").select("id,name,stage_id").eq("workspace_id", workspaceId).eq("id", leadId).maybeSingle(),
          supabase.from("pipeline_stages").select("id,name,pipeline_id").eq("workspace_id", workspaceId).eq("id", stageId).maybeSingle(),
        ]);
        if (!lead) throw new Error("Lead não encontrado neste workspace.");
        if (!stage) throw new Error("Etapa não encontrada neste workspace.");
        const { error } = await supabase
          .from("leads")
          .update({ stage_id: stage.id, pipeline_id: (stage as any).pipeline_id, updated_at: new Date().toISOString() })
          .eq("workspace_id", workspaceId)
          .eq("id", leadId);
        if (error) throw new Error(error.message);
        await supabase.from("lead_activities").insert({
          workspace_id: workspaceId,
          lead_id: leadId,
          type: "copilot_move_stage",
          payload: {
            from_stage_id: (lead as any).stage_id,
            to_stage_id: stage.id,
            to_stage_name: (stage as any).name,
            note: note ?? null,
            actor_user_id: userId ?? null,
          },
        });
        return { ok: true, leadId, leadName: (lead as any).name, stageId: stage.id, stageName: (stage as any).name };
      },
    }),

    read_lead_history: tool({
      description: "Lê histórico operacional e conversas de um lead no Inbox/WhatsApp/Instagram/Messenger. Use quando o usuário pedir contexto, resumo, auditoria ou motivo de travamento.",
      inputSchema: z.object({
        leadId: z.string().uuid(),
        limit: z.number().int().min(5).max(80).default(30),
      }),
      execute: async ({ leadId, limit }) => {
        const { data: lead } = await supabase
          .from("leads")
          .select("id,name,phone,email,updated_at")
          .eq("workspace_id", workspaceId)
          .eq("id", leadId)
          .maybeSingle();
        if (!lead) throw new Error("Lead não encontrado neste workspace.");
        const phone = String((lead as any).phone ?? "").replace(/\D/g, "");
        const [activitiesRes, channelRes, whatsappRes] = await Promise.all([
          supabase.from("lead_activities").select("type,payload,occurred_at").eq("workspace_id", workspaceId).eq("lead_id", leadId).order("occurred_at", { ascending: false }).limit(limit),
          supabase.from("channel_messages").select("channel,direction,text,status,received_at,sent_at").eq("workspace_id", workspaceId).eq("lead_id", leadId).order("received_at", { ascending: false }).limit(limit),
          phone
            ? supabase.from("whatsapp_web_messages").select("from_me,sender_name,sender_phone,message_type,body,received_at").eq("workspace_id", workspaceId).or(`sender_phone.ilike.%${phone}%,remote_jid.ilike.%${phone}%`).order("received_at", { ascending: false }).limit(limit)
            : Promise.resolve({ data: [], error: null } as { data: any[]; error: null }),
        ]);
        if (activitiesRes.error) throw new Error(activitiesRes.error.message);
        if (channelRes.error) throw new Error(channelRes.error.message);
        if (whatsappRes.error) throw new Error(whatsappRes.error.message);
        return {
          lead,
          activities: activitiesRes.data ?? [],
          channelMessages: channelRes.data ?? [],
          whatsappMessages: whatsappRes.data ?? [],
        };
      },
    }),

    update_operating_hours: tool({
      description: "Altera fuso horário e expediente operacional dos agentes de CRM do workspace. Use quando o usuário pedir trocar fuso ou horário de expediente.",
      inputSchema: z.object({
        timezone: z.string().min(3).optional(),
        startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        activeDays: z.array(z.number().int().min(0).max(6)).optional().describe("0=domingo, 1=segunda ... 6=sábado"),
      }),
      execute: async ({ timezone, startTime, endTime, activeDays }) => {
        const patch: Record<string, unknown> = {};
        if (timezone) patch.timezone = timezone;
        if (startTime) patch.start_time = startTime;
        if (endTime) patch.end_time = endTime;
        if (activeDays) patch.active_days = activeDays;
        if (!Object.keys(patch).length) return { ok: true, changed: false };

        const { error } = await supabase.from("crm_agent_config" as any).update(patch).eq("workspace_id", workspaceId);
        if (error) throw new Error(error.message);

        const { data: workspace } = await supabase.from("workspaces").select("feature_flags").eq("id", workspaceId).maybeSingle();
        const featureFlags = ((workspace as any)?.feature_flags && typeof (workspace as any).feature_flags === "object") ? (workspace as any).feature_flags : {};
        await supabase.from("workspaces").update({
          feature_flags: {
            ...featureFlags,
            operating_hours: {
              ...(featureFlags.operating_hours ?? {}),
              ...(timezone ? { timezone } : {}),
              ...(startTime ? { startTime } : {}),
              ...(endTime ? { endTime } : {}),
              ...(activeDays ? { activeDays } : {}),
            },
          },
        }).eq("id", workspaceId);

        return { ok: true, changed: true, applied: { timezone, startTime, endTime, activeDays } };
      },
    }),

    invite_employee: tool({
      description: "Cria convite para novo funcionário entrar no workspace. Use quando o usuário pedir adicionar funcionário/equipe. O usuário convidado ainda precisa aceitar o convite.",
      inputSchema: z.object({
        email: z.string().email(),
        roleType: z.enum(["funcionario", "admin", "gestor", "atendimento", "vendas"]).default("funcionario"),
        modules: z.array(z.string()).default([]),
      }),
      execute: async ({ email, roleType, modules }) => {
        const { data, error } = await supabase.from("workspace_invitations" as any).insert({
          workspace_id: workspaceId,
          email,
          role_type: roleType,
          modules,
          invited_by: userId ?? null,
          status: "pending",
        }).select("id,email,token,expires_at,status").single();
        if (error) throw new Error(error.message);
        return { ok: true, invitation: data, message: "Convite criado. Envie o link/convite para o funcionário aceitar e criar o acesso." };
      },
    }),

    generate_operational_report: tool({
      description: "Gera relatório operacional do CRM com funis, etapas, volume, valor e atividades recentes. Use quando o usuário pedir relatório.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(365).default(7),
      }),
      execute: async ({ days }) => {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const [leadsRes, stagesRes, activitiesRes] = await Promise.all([
          supabase.from("leads").select("id,name,value,stage_id,pipeline_id,created_at,updated_at").eq("workspace_id", workspaceId).gte("updated_at", since).limit(2000),
          supabase.from("pipeline_stages").select("id,name,pipeline_id,pipelines(name)").eq("workspace_id", workspaceId),
          supabase.from("lead_activities").select("type,occurred_at").eq("workspace_id", workspaceId).gte("occurred_at", since).limit(2000),
        ]);
        if (leadsRes.error) throw new Error(leadsRes.error.message);
        if (stagesRes.error) throw new Error(stagesRes.error.message);
        if (activitiesRes.error) throw new Error(activitiesRes.error.message);
        const stageById = new Map(((stagesRes.data ?? []) as any[]).map((stage) => [stage.id, stage]));
        const byStage: Record<string, { stage: string; funnel: string; count: number; value: number }> = {};
        for (const lead of (leadsRes.data ?? []) as any[]) {
          const stage = stageById.get(lead.stage_id);
          const key = lead.stage_id ?? "sem-etapa";
          byStage[key] ??= { stage: stage?.name ?? "Sem etapa", funnel: stage?.pipelines?.name ?? "Sem funil", count: 0, value: 0 };
          byStage[key].count += 1;
          byStage[key].value += Number(lead.value ?? 0);
        }
        return {
          periodDays: days,
          updatedLeads: (leadsRes.data ?? []).length,
          totalValue: ((leadsRes.data ?? []) as any[]).reduce((sum, lead) => sum + Number(lead.value ?? 0), 0),
          stages: Object.values(byStage).sort((a, b) => b.count - a.count),
          activitiesByType: ((activitiesRes.data ?? []) as any[]).reduce((acc, item) => {
            acc[item.type] = (acc[item.type] ?? 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        };
      },
    }),

    get_salesbot_details: tool({
      description: "Analisa a configuração de um SalesBot específico para identificar estrutura incompleta ou desconectada.",
      inputSchema: z.object({ botId: z.string().uuid() }),
      execute: async ({ botId }) => {
        const { data: bot, error } = await supabase
          .from("salesbots")
          .select("name, status, config, created_at")
          .eq("workspace_id", workspaceId)
          .eq("id", botId)
          .maybeSingle();

        if (error || !bot) return { error: "Bot não encontrado." };

        const config = (bot.config as any) || {};
        const nodes = config.nodes || [];
        const edges = config.edges || [];

        return {
          name: bot.name,
          status: bot.status,
          nodeCount: nodes.length,
          edgeCount: edges.length,
          hasStart: nodes.some((node: any) => node.type === "start"),
          hasEnd: nodes.some((node: any) => node.type === "end"),
          isDisconnected: nodes.length > 1 && edges.length === 0,
          createdAt: bot.created_at,
        };
      },
    }),

    list_active_campaigns_summary: tool({
      description: "Retorna um resumo das campanhas de tráfego disponíveis para diagnóstico rápido, usando somente dados registrados no workspace.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data: ads } = await supabase
          .from("meta_ads_metrics" as any)
          .select("campaign_name, spend, impressions, clicks, leads, conversions")
          .eq("workspace_id", workspaceId)
          .order("spend", { ascending: false })
          .limit(10);

        return { campaigns: ads ?? [] };
      },
    }),

    request_human_support: tool({
      description: "Use quando o Copiloto não conseguir resolver o problema com segurança, quando a ação depender de humano/superadmin ou quando o usuário pedir atendimento humano. Crie o handoff e avise que a equipe recebeu o caso.",
      inputSchema: z.object({
        reason: z.string().min(3).max(500).describe("Motivo objetivo do encaminhamento para o suporte humano."),
      }),
      execute: async ({ reason }) => {
        const { error } = await supabase
          .from("support_handoffs" as any)
          .upsert(
            {
              workspace_id: workspaceId,
              status: "pending",
              reason,
              updated_at: new Date().toISOString(),
              resolved_at: null,
              resolved_by: null,
            },
            { onConflict: "workspace_id,user_id" },
          );

        if (error) throw new Error(`Falha ao encaminhar para suporte humano: ${error.message}`);
        return { ok: true, status: "pending", message: "Atendimento encaminhado para o super admin." };
      },
    }),
  };
}
