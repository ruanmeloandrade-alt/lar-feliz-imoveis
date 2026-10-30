import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listMetaCampaigns, listMetaAdSets, listMetaAds } from "@/lib/meta.functions";
import { createAutomationRule } from "@/lib/meta-automations.functions";
import { planAutomationWithAi, type AiAutomationPlan } from "@/lib/meta-automation-ai-planner.functions";

type ScopeType = "campaign" | "adset" | "ad";

export function MetaAutomationAiPlanner({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const campaignsFn = useServerFn(listMetaCampaigns);
  const adsetsFn = useServerFn(listMetaAdSets);
  const adsFn = useServerFn(listMetaAds);
  const planFn = useServerFn(planAutomationWithAi);
  const createFn = useServerFn(createAutomationRule);

  const [scopeType, setScopeType] = useState<ScopeType>("campaign");
  const [campaignId, setCampaignId] = useState("");
  const [adsetId, setAdsetId] = useState("");
  const [adId, setAdId] = useState("");
  const [briefing, setBriefing] = useState("");
  const [plan, setPlan] = useState<AiAutomationPlan | null>(null);

  const campaignsQ = useQuery({
    queryKey: ["ai-automation-campaigns", workspaceId],
    queryFn: () => campaignsFn({ data: { workspaceId, preset: "last_7d", limit: 200 } }),
    retry: 1,
  });
  const campaigns = Array.isArray(campaignsQ.data?.campaigns) ? campaignsQ.data.campaigns : [];

  const adsetsQ = useQuery({
    queryKey: ["ai-automation-adsets", workspaceId, campaignId],
    queryFn: () => adsetsFn({ data: { workspaceId, preset: "last_7d", limit: 200, campaignIds: [campaignId] } }),
    enabled: !!campaignId && (scopeType === "adset" || scopeType === "ad"),
    retry: 1,
  });
  const adsets = Array.isArray(adsetsQ.data?.adsets) ? adsetsQ.data.adsets : [];

  const adsQ = useQuery({
    queryKey: ["ai-automation-ads", workspaceId, campaignId, adsetId],
    queryFn: () => adsFn({ data: { workspaceId, preset: "last_7d", limit: 200, campaignIds: [campaignId], adsetIds: adsetId ? [adsetId] : undefined } }),
    enabled: !!campaignId && scopeType === "ad",
    retry: 1,
  });
  const ads = Array.isArray(adsQ.data?.ads) ? adsQ.data.ads : [];

  const selectedCampaign = campaigns.find((c) => c.id === campaignId);
  const selectedAdset = adsets.find((a) => a.id === adsetId);
  const selectedAd = ads.find((a) => a.id === adId);
  const scopeId = scopeType === "campaign" ? campaignId : scopeType === "adset" ? adsetId : adId;
  const selectedName = scopeType === "campaign" ? selectedCampaign?.name : scopeType === "adset" ? selectedAdset?.name : selectedAd?.name;

  const target = useMemo(() => scopeId && selectedName ? {
    scopeType,
    scopeId,
    name: selectedName,
    campaignId: campaignId || null,
    campaignName: selectedCampaign?.name ?? null,
    adsetId: adsetId || null,
    adsetName: selectedAdset?.name ?? null,
  } : null, [scopeType, scopeId, selectedName, campaignId, selectedCampaign?.name, adsetId, selectedAdset?.name]);

  const planMut = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Selecione o alvo real da automação.");
      if (briefing.trim().length < 10) throw new Error("Explique o que você quer que a automação faça.");
      return planFn({ data: { workspaceId, briefing: briefing.trim(), target } });
    },
    onSuccess: (data) => setPlan(data.plan),
    onError: (error: Error) => toast.error(error.message),
  });

  const saveDraftMut = useMutation({
    mutationFn: async () => {
      if (!plan || !target) throw new Error("Gere um plano antes de salvar.");
      const firstCondition = plan.conditions[0];
      const firstAction = plan.actions[0];
      await createFn({
        data: {
          workspaceId,
          name: plan.name,
          enabled: false,
          scopeType: target.scopeType,
          scopeId: target.scopeId,
          triggerMetric: firstCondition.metric,
          triggerOperator: firstCondition.operator,
          triggerValue: firstCondition.value,
          triggerWindow: plan.triggerWindow,
          actionType: firstAction.type,
          actionValue: firstAction.value,
          actionValueMode: firstAction.valueMode,
          actions: plan.actions.map((a) => ({
            type: a.type,
            value: a.value,
            valueMode: a.valueMode,
            params: { aiReason: a.reason },
            conditions: [],
            conditionLogic: "and" as const,
          })),
          conditions: plan.conditions,
          conditionLogic: plan.conditionLogic,
          cooldownMinutes: plan.cooldownMinutes,
          scanIntervalMinutes: plan.scanIntervalMinutes,
          actionConfig: {
            creationMode: "ai_reviewed_draft",
            aiBriefing: briefing.trim(),
            aiSummary: plan.summary,
            aiSafeguards: plan.safeguards,
            aiEvidence: plan.evidence,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Rascunho criado desativado. Revise antes de ativar.");
      qc.invalidateQueries({ queryKey: ["meta-automation-rules", workspaceId] });
      setPlan(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-border bg-muted/40 p-2"><Sparkles className="h-4 w-4" /></div>
        <div>
          <div className="font-semibold">Automação com IA</div>
          <div className="text-sm text-muted-foreground">Escolha um alvo real, descreva o objetivo e revise o plano antes de ativar.</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label>Alvo</Label>
          <select className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={scopeType} onChange={(e) => { setScopeType(e.target.value as ScopeType); setAdsetId(""); setAdId(""); setPlan(null); }}>
            <option value="campaign">Campanha</option>
            <option value="adset">Conjunto</option>
            <option value="ad">Anúncio</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <Label>Campanha</Label>
          <select className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={campaignId} onChange={(e) => { setCampaignId(e.target.value); setAdsetId(""); setAdId(""); setPlan(null); }}>
            <option value="">Selecione uma campanha real</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {(scopeType === "adset" || scopeType === "ad") && (
          <div className="md:col-span-3">
            <Label>Conjunto</Label>
            <select className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={adsetId} onChange={(e) => { setAdsetId(e.target.value); setAdId(""); setPlan(null); }} disabled={!campaignId}>
              <option value="">Selecione um conjunto real</option>
              {adsets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        {scopeType === "ad" && (
          <div className="md:col-span-3">
            <Label>Anúncio</Label>
            <select className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={adId} onChange={(e) => { setAdId(e.target.value); setPlan(null); }} disabled={!campaignId}>
              <option value="">Selecione um anúncio real</option>
              {ads.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div>
        <Label>Briefing</Label>
        <textarea
          className="mt-1 min-h-28 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="Ex.: Quero proteger CPL acima de R$ 55, avisar o time antes de escalar e aumentar orçamento no máximo 20% quando houver eficiência consistente."
          value={briefing}
          onChange={(e) => { setBriefing(e.target.value); setPlan(null); }}
        />
      </div>

      <Button onClick={() => planMut.mutate()} disabled={planMut.isPending || !target}>
        {planMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        Gerar plano para revisão
      </Button>

      {plan && (
        <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plano proposto</div>
            <div className="mt-1 font-semibold">{plan.name}</div>
            <div className="mt-1 text-sm text-muted-foreground">{plan.summary}</div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-background p-3 text-sm">
              <div className="font-semibold">Condições</div>
              {plan.conditions.map((c, i) => <div key={`${c.metric}-${i}`} className="mt-1 text-muted-foreground">{c.metric} {c.operator} {c.value}</div>)}
            </div>
            <div className="rounded-lg border border-border bg-background p-3 text-sm">
              <div className="font-semibold">Ações</div>
              {plan.actions.map((a, i) => <div key={`${a.type}-${i}`} className="mt-1 text-muted-foreground">{a.type}{a.value != null ? ` · ${a.value}${a.valueMode === "percent" ? "%" : ""}` : ""} — {a.reason}</div>)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Guardrails</div>
            {plan.safeguards.map((s, i) => <div key={i} className="mt-1 text-muted-foreground">• {s}</div>)}
          </div>
          <div className="text-xs text-muted-foreground">Intervalo: {plan.scanIntervalMinutes} min · cooldown: {plan.cooldownMinutes} min. O rascunho será salvo desativado.</div>
          <Button onClick={() => saveDraftMut.mutate()} disabled={saveDraftMut.isPending}>
            {saveDraftMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar rascunho para revisão
          </Button>
        </div>
      )}
    </div>
  );
}
