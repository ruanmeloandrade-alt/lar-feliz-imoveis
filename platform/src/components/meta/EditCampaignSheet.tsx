import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateMetaCampaign, getMetaCampaignDetails } from "@/lib/meta-campaigns.functions";

type BidStrategy = "LOWEST_COST_WITHOUT_CAP" | "LOWEST_COST_WITH_BID_CAP" | "COST_CAP" | "LOWEST_COST_WITH_MIN_ROAS";

const BID_STRATEGIES: Array<{ v: BidStrategy; l: string }> = [
  { v: "LOWEST_COST_WITHOUT_CAP", l: "Menor custo (padrão)" },
  { v: "LOWEST_COST_WITH_BID_CAP", l: "Menor custo com limite de lance" },
  { v: "COST_CAP", l: "Limite de custo" },
  { v: "LOWEST_COST_WITH_MIN_ROAS", l: "Menor custo com ROAS mínimo" },
];

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocal(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function EditCampaignSheet({
  workspaceId,
  open,
  onOpenChange,
  campaign,
  onSaved,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaign: { id: string; accountId: string; name: string; dailyBudget: number | null; effectiveStatus: string } | null;
  onSaved?: () => void;
}) {
  const detailsFn = useServerFn(getMetaCampaignDetails);
  const detailsQ = useQuery({
    queryKey: ["meta-campaign-details", workspaceId, campaign?.id],
    enabled: open && !!campaign,
    queryFn: () => detailsFn({ data: { workspaceId, adAccountId: campaign!.accountId as `act_${string}`, campaignId: campaign!.id } }),
  });

  const [name, setName] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED" | "ARCHIVED">("PAUSED");
  const [budgetMode, setBudgetMode] = useState<"daily" | "lifetime">("daily");
  const [dailyBudget, setDailyBudget] = useState<number>(0);
  const [lifetimeBudget, setLifetimeBudget] = useState<number>(0);
  const [spendCap, setSpendCap] = useState<number>(0);
  const [bidStrategy, setBidStrategy] = useState<BidStrategy>("LOWEST_COST_WITHOUT_CAP");
  const [startTime, setStartTime] = useState("");
  const [stopTime, setStopTime] = useState("");

  useEffect(() => {
    const d = detailsQ.data;
    if (!d) return;
    setName(d.name);
    setStatus((["ACTIVE", "PAUSED", "ARCHIVED"] as const).includes(d.status as never)
      ? (d.status as "ACTIVE" | "PAUSED" | "ARCHIVED") : "PAUSED");
    setDailyBudget(d.dailyBudget ?? 0);
    setLifetimeBudget(d.lifetimeBudget ?? 0);
    setBudgetMode(d.lifetimeBudget ? "lifetime" : "daily");
    setSpendCap(d.spendCap ?? 0);
    setBidStrategy((d.bidStrategy as BidStrategy) ?? "LOWEST_COST_WITHOUT_CAP");
    setStartTime(toDateTimeLocal(d.startTime));
    setStopTime(toDateTimeLocal(d.stopTime));
  }, [detailsQ.data]);

  const updateFn = useServerFn(updateMetaCampaign);
  const mut = useMutation({
    mutationFn: async () => {
      if (!campaign || !detailsQ.data) return;
      const d = detailsQ.data;
      const patch: Record<string, unknown> = {
        workspaceId,
        adAccountId: campaign.accountId,
        campaignId: campaign.id,
      };
      if (name !== d.name) patch.name = name;
      if (status !== d.status) patch.status = status;
      if (budgetMode === "daily" && dailyBudget > 0 && dailyBudget !== (d.dailyBudget ?? 0)) {
        patch.dailyBudgetCents = Math.round(dailyBudget * 100);
      }
      if (budgetMode === "lifetime" && lifetimeBudget > 0 && lifetimeBudget !== (d.lifetimeBudget ?? 0)) {
        patch.lifetimeBudgetCents = Math.round(lifetimeBudget * 100);
      }
      if (spendCap !== (d.spendCap ?? 0)) {
        patch.spendCapCents = Math.round(spendCap * 100);
      }
      if (bidStrategy !== (d.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP")) {
        patch.bidStrategy = bidStrategy;
      }
      const isoStart = fromDateTimeLocal(startTime);
      const isoStop = fromDateTimeLocal(stopTime);
      if (isoStart && isoStart !== d.startTime) patch.startTime = isoStart;
      if (isoStop && isoStop !== d.stopTime) patch.stopTime = isoStop;

      const changedKeys = Object.keys(patch).filter((k) => !["workspaceId", "adAccountId", "campaignId"].includes(k));
      if (changedKeys.length === 0) {
        throw new Error("Nenhuma alteração para salvar.");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return updateFn({ data: patch as any });
    },

    onSuccess: () => {
      toast.success("Campanha atualizada.");
      onOpenChange(false);
      onSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = detailsQ.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar campanha</SheetTitle>
        </SheetHeader>

        {detailsQ.isLoading && (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando dados atuais da campanha…
          </div>
        )}

        {d && (
          <div className="space-y-5 mt-4 pb-6">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] space-y-1">
              <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{d.id}</span></div>
              <div><span className="text-muted-foreground">Objetivo:</span> <span className="font-medium">{d.objective}</span> <span className="text-muted-foreground">(não editável após criação)</span></div>
              {d.buyingType && <div><span className="text-muted-foreground">Compra:</span> {d.buyingType}</div>}
              {d.specialAdCategories.length > 0 && <div><span className="text-muted-foreground">Categorias especiais:</span> {d.specialAdCategories.join(", ")}</div>}
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
                    {s === "ACTIVE" ? "Ativa" : s === "PAUSED" ? "Pausada" : "Arquivada"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Orçamento</Label>
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
                Valor {budgetMode === "daily" ? "diário" : "total do período"} em {d.dailyBudget || d.lifetimeBudget ? "reais/dólares (moeda da conta)" : "moeda da conta"}. Deixe 0 para não alterar.
              </div>
            </div>

            <div>
              <Label>Limite de gasto total (spend cap)</Label>
              <Input type="number" min={0} step={10} value={spendCap}
                onChange={(e) => setSpendCap(Number(e.target.value) || 0)} placeholder="0 = sem limite" />
              <div className="text-[11px] text-muted-foreground mt-1">Teto absoluto pra campanha. 0 remove o limite.</div>
            </div>

            <div>
              <Label>Estratégia de lance</Label>
              <select value={bidStrategy} onChange={(e) => setBidStrategy(e.target.value as BidStrategy)}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm">
                {BID_STRATEGIES.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início</Label>
                <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>Término</Label>
                <Input type="datetime-local" value={stopTime} onChange={(e) => setStopTime(e.target.value)} />
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
              Alterações vão direto pra Meta Ads. Objetivo e categorias especiais são fixados na criação, pra mudar, duplique a campanha e ajuste na cópia.
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
