import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMetaAdSetDetails, updateMetaAdSet } from "@/lib/meta-campaigns.functions";

const OPT_GOALS: Array<{ v: string; l: string }> = [
  { v: "LINK_CLICKS", l: "Cliques no link" },
  { v: "REACH", l: "Alcance" },
  { v: "IMPRESSIONS", l: "Impressões" },
  { v: "LEAD_GENERATION", l: "Geração de leads" },
  { v: "OFFSITE_CONVERSIONS", l: "Conversões (pixel)" },
  { v: "LANDING_PAGE_VIEWS", l: "Visualizações da página" },
  { v: "POST_ENGAGEMENT", l: "Engajamento" },
  { v: "PAGE_LIKES", l: "Curtidas na página" },
  { v: "VIDEO_VIEWS", l: "Visualizações de vídeo" },
];

const BILLING: Array<{ v: string; l: string }> = [
  { v: "IMPRESSIONS", l: "Impressões" },
  { v: "LINK_CLICKS", l: "Cliques" },
  { v: "THRUPLAY", l: "ThruPlay (vídeo)" },
];

function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocal(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function EditAdSetSheet({
  workspaceId, open, onOpenChange, adSet, onSaved,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  adSet: { id: string; accountId: string; name: string } | null;
  onSaved?: () => void;
}) {
  const detailsFn = useServerFn(getMetaAdSetDetails);
  const detailsQ = useQuery({
    queryKey: ["meta-adset-details", workspaceId, adSet?.id],
    enabled: open && !!adSet,
    queryFn: () => detailsFn({ data: { workspaceId, adAccountId: adSet!.accountId as `act_${string}`, adSetId: adSet!.id } }),
  });

  const [name, setName] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED" | "ARCHIVED">("PAUSED");
  const [budgetMode, setBudgetMode] = useState<"daily" | "lifetime">("daily");
  const [dailyBudget, setDailyBudget] = useState(0);
  const [lifetimeBudget, setLifetimeBudget] = useState(0);
  const [bidAmount, setBidAmount] = useState(0);
  const [optimizationGoal, setOptimizationGoal] = useState("LINK_CLICKS");
  const [billingEvent, setBillingEvent] = useState("IMPRESSIONS");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);

  useEffect(() => {
    const d = detailsQ.data;
    if (!d) return;
    setName(d.name);
    setStatus((["ACTIVE", "PAUSED", "ARCHIVED"] as const).includes(d.status as never) ? (d.status as "ACTIVE" | "PAUSED" | "ARCHIVED") : "PAUSED");
    setDailyBudget(d.dailyBudget ?? 0);
    setLifetimeBudget(d.lifetimeBudget ?? 0);
    setBudgetMode(d.lifetimeBudget ? "lifetime" : "daily");
    setBidAmount(d.bidAmount ?? 0);
    setOptimizationGoal(d.optimizationGoal ?? "LINK_CLICKS");
    setBillingEvent(d.billingEvent ?? "IMPRESSIONS");
    setStartTime(toLocal(d.startTime));
    setEndTime(toLocal(d.endTime));
    if (d.targeting.ageMin) setAgeMin(d.targeting.ageMin);
    if (d.targeting.ageMax) setAgeMax(d.targeting.ageMax);
  }, [detailsQ.data]);

  const updateFn = useServerFn(updateMetaAdSet);
  const mut = useMutation({
    mutationFn: async () => {
      if (!adSet || !detailsQ.data) return;
      const d = detailsQ.data;
      const patch: Record<string, unknown> = {
        workspaceId, adAccountId: adSet.accountId, adSetId: adSet.id,
      };
      if (name !== d.name) patch.name = name;
      if (status !== d.status) patch.status = status;
      if (budgetMode === "daily" && dailyBudget > 0 && dailyBudget !== (d.dailyBudget ?? 0)) {
        patch.dailyBudgetCents = Math.round(dailyBudget * 100);
      }
      if (budgetMode === "lifetime" && lifetimeBudget > 0 && lifetimeBudget !== (d.lifetimeBudget ?? 0)) {
        patch.lifetimeBudgetCents = Math.round(lifetimeBudget * 100);
      }
      if (bidAmount > 0 && bidAmount !== (d.bidAmount ?? 0)) {
        patch.bidAmountCents = Math.round(bidAmount * 100);
      }
      if (optimizationGoal !== (d.optimizationGoal ?? "LINK_CLICKS")) patch.optimizationGoal = optimizationGoal;
      if (billingEvent !== (d.billingEvent ?? "IMPRESSIONS")) patch.billingEvent = billingEvent;
      const isoStart = fromLocal(startTime);
      const isoEnd = fromLocal(endTime);
      if (isoStart && isoStart !== d.startTime) patch.startTime = isoStart;
      if (isoEnd && isoEnd !== d.endTime) patch.endTime = isoEnd;
      if (ageMin !== (d.targeting.ageMin ?? 18)) patch.ageMin = ageMin;
      if (ageMax !== (d.targeting.ageMax ?? 65)) patch.ageMax = ageMax;

      const changed = Object.keys(patch).filter((k) => !["workspaceId", "adAccountId", "adSetId"].includes(k));
      if (changed.length === 0) throw new Error("Nenhuma alteração para salvar.");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return updateFn({ data: patch as any });
    },
    onSuccess: () => {
      toast.success("Conjunto de anúncios atualizado.");
      onOpenChange(false);
      onSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = detailsQ.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>Editar conjunto de anúncios</SheetTitle></SheetHeader>

        {detailsQ.isLoading && (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando dados atuais…
          </div>
        )}

        {d && (
          <div className="space-y-5 mt-4 pb-6">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] space-y-1">
              <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{d.id}</span></div>
              <div><span className="text-muted-foreground">Campanha:</span> <span className="font-mono">{d.campaignId}</span></div>
            </div>

            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            </div>

            <div>
              <Label>Status</Label>
              <div className="flex gap-2 mt-1">
                {(["ACTIVE", "PAUSED", "ARCHIVED"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setStatus(s)}
                    className={`px-3 py-1.5 rounded border text-xs ${status === s ? "border-primary bg-primary/10" : "border-border"}`}>
                    {s === "ACTIVE" ? "Ativo" : s === "PAUSED" ? "Pausado" : "Arquivado"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Orçamento (ABO)</Label>
              <div className="flex gap-2 mt-1 mb-2">
                {(["daily", "lifetime"] as const).map((b) => (
                  <button key={b} type="button" onClick={() => setBudgetMode(b)}
                    className={`px-3 py-1.5 rounded border text-xs ${budgetMode === b ? "border-primary bg-primary/10" : "border-border"}`}>
                    {b === "daily" ? "Diário" : "Total (vitalício)"}
                  </button>
                ))}
              </div>
              {budgetMode === "daily" ? (
                <Input type="number" min={0} step={5} value={dailyBudget}
                  onChange={(e) => setDailyBudget(Number(e.target.value) || 0)} placeholder="Ex: 50" />
              ) : (
                <Input type="number" min={0} step={10} value={lifetimeBudget}
                  onChange={(e) => setLifetimeBudget(Number(e.target.value) || 0)} placeholder="Ex: 1500" />
              )}
              <div className="text-[11px] text-muted-foreground mt-1">
                Vazio ou 0 = não alterar. Se a campanha usar CBO, este campo é ignorado pela Meta.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Meta de otimização</Label>
                <select value={optimizationGoal} onChange={(e) => setOptimizationGoal(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm">
                  {OPT_GOALS.map((g) => <option key={g.v} value={g.v}>{g.l}</option>)}
                </select>
              </div>
              <div>
                <Label>Evento de cobrança</Label>
                <select value={billingEvent} onChange={(e) => setBillingEvent(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm">
                  {BILLING.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
                </select>
              </div>
            </div>

            <div>
              <Label>Lance manual (opcional)</Label>
              <Input type="number" min={0} step={0.1} value={bidAmount}
                onChange={(e) => setBidAmount(Number(e.target.value) || 0)} placeholder="0 = automático" />
              <div className="text-[11px] text-muted-foreground mt-1">Aplica-se apenas se a estratégia da campanha exigir lance (bid cap, cost cap).</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Idade mínima</Label>
                <Input type="number" min={13} max={65} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value) || 18)} />
              </div>
              <div>
                <Label>Idade máxima</Label>
                <Input type="number" min={13} max={65} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value) || 65)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início</Label>
                <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>Término</Label>
                <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
              Alterações escrevem direto na Meta Ads. Geolocalização, direcionamento detalhado e posicionamentos avançados devem ser editados criando um novo conjunto (por segurança dos ajustes existentes).
            </div>
          </div>
        )}

        <SheetFooter className="mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={mut.isPending || !d} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            Salvar alterações
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
