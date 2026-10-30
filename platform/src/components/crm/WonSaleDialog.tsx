import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { listWonSaleOptions, registerWonSale } from "@/lib/crm-won-sale.functions";
import { toast } from "sonner";

type Options = {
  leads: Array<{ id: string; name: string; value: number; pipelineId: string | null; stageId: string | null; pipelineName: string }>;
  products: Array<{ id: string; name: string; price: number; catalogId: string | null }>;
  wonStages: Array<{ id: string; pipelineId: string; pipelineName: string; name: string }>;
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export function WonSaleDialog({ onRegistered }: { onRegistered?: () => void | Promise<void> }) {
  const listOptions = useServerFn(listWonSaleOptions);
  const registerSale = useServerFn(registerWonSale);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<Options>({ leads: [], products: [], wonStages: [] });
  const [leadId, setLeadId] = useState("");
  const [wonStageId, setWonStageId] = useState("");
  const [productId, setProductId] = useState("");
  const [useCatalogPrice, setUseCatalogPrice] = useState(true);
  const [valueText, setValueText] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listOptions()
      .then((result) => {
        const next = result as Options;
        setOptions(next);
        setLeadId((current) => current || next.leads[0]?.id || "");
        setWonStageId((current) => current || next.wonStages[0]?.id || "");
      })
      .catch((error) => {
        console.error("listWonSaleOptions", error);
        toast.error("Não foi possível carregar os dados da venda.");
      })
      .finally(() => setLoading(false));
  }, [open, listOptions]);

  const selectedLead = useMemo(() => options.leads.find((lead) => lead.id === leadId) ?? null, [options.leads, leadId]);
  const selectedProduct = useMemo(() => options.products.find((product) => product.id === productId) ?? null, [options.products, productId]);
  const availableWonStages = useMemo(() => {
    if (!selectedLead?.pipelineId) return options.wonStages;
    const samePipeline = options.wonStages.filter((stage) => stage.pipelineId === selectedLead.pipelineId);
    return samePipeline.length ? samePipeline : options.wonStages;
  }, [options.wonStages, selectedLead]);

  useEffect(() => {
    if (availableWonStages.length && !availableWonStages.some((stage) => stage.id === wonStageId)) {
      setWonStageId(availableWonStages[0].id);
    }
  }, [availableWonStages, wonStageId]);

  useEffect(() => {
    if (selectedProduct && useCatalogPrice) setValueText(String(selectedProduct.price));
    if (!selectedProduct && selectedLead && !valueText) setValueText(selectedLead.value ? String(selectedLead.value) : "");
  }, [selectedProduct, selectedLead, useCatalogPrice, valueText]);

  function resetProduct(nextProductId: string) {
    setProductId(nextProductId);
    if (!nextProductId) {
      setUseCatalogPrice(false);
      return;
    }
    const product = options.products.find((item) => item.id === nextProductId);
    setUseCatalogPrice(true);
    if (product) setValueText(String(product.price));
  }

  async function submit() {
    if (!leadId || !wonStageId) {
      toast.error("Selecione o cliente e a etapa de venda ganha.");
      return;
    }
    const normalized = Number(valueText.replace(",", "."));
    const finalValue = productId && useCatalogPrice ? null : normalized;
    if (finalValue != null && (!Number.isFinite(finalValue) || finalValue < 0)) {
      toast.error("Informe um valor final válido.");
      return;
    }
    if (!productId && !valueText.trim()) {
      toast.error("Informe o valor final da venda.");
      return;
    }

    setSaving(true);
    try {
      const result = await registerSale({
        data: {
          leadId,
          wonStageId,
          productId: productId || null,
          finalValue,
        },
      });
      toast.success(`Venda ganha registrada em ${money(result.finalValue)}.`);
      setOpen(false);
      setProductId("");
      setUseCatalogPrice(true);
      setValueText("");
      await onRegistered?.();
    } catch (error) {
      console.error("registerWonSale", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a venda.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5" /> Venda ganha
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar venda ganha</DialogTitle>
          <DialogDescription>
            O produto é opcional. O valor registrado aqui é o valor real da venda e será usado como receita do lead.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Cliente / lead</label>
              <select value={leadId} onChange={(event) => setLeadId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Selecione…</option>
                {options.leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>{lead.name} · {lead.pipelineName}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Etapa de venda ganha</label>
              <select value={wonStageId} onChange={(event) => setWonStageId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Selecione…</option>
                {availableWonStages.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.pipelineName} · {stage.name}</option>
                ))}
              </select>
              {options.wonStages.length === 0 && <p className="text-xs text-destructive">Nenhuma etapa de venda ganha foi encontrada nos funis.</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Produto (opcional)</label>
              <select value={productId} onChange={(event) => resetProduct(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Sem produto — informar somente o valor</option>
                {options.products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} · {money(product.price)}</option>
                ))}
              </select>
            </div>

            {selectedProduct && (
              <label className="flex items-center gap-2 rounded-md border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={useCatalogPrice}
                  onChange={(event) => {
                    setUseCatalogPrice(event.target.checked);
                    if (event.target.checked) setValueText(String(selectedProduct.price));
                  }}
                />
                Usar valor original do produto ({money(selectedProduct.price)})
              </label>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Valor final da venda (R$)</label>
              <Input
                inputMode="decimal"
                value={valueText}
                disabled={Boolean(selectedProduct && useCatalogPrice)}
                onChange={(event) => setValueText(event.target.value)}
                placeholder="0,00"
              />
              {selectedProduct && !useCatalogPrice && (
                <p className="text-[11px] text-muted-foreground">Use este campo para desconto ou negociação com valor diferente do catálogo.</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || saving || !leadId || !wonStageId}>
            {saving ? "Registrando…" : "Confirmar venda ganha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
