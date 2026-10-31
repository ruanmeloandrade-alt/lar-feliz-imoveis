import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  summarizeVanessaDeals,
  realEstateOutcome,
  commissionCents,
} from "@/lib/vanessa-finance.core";
import { parseMoneyCents, centsToDecimal } from "@/lib/slim-money.core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
const ws = "2a0e0d29-4e23-47e6-bd9f-30aa8e15e698";
const db = supabase as any;
const currency = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
type Lead = {
  id: string;
  name: string;
  value: number | string;
  stage_id: string | null;
  status: string;
};
type Finance = {
  lead_id: string;
  deal_kind: string;
  deal_value_cents: number;
  commission_mode: string;
  commission_bps: number | null;
  commission_cents: number;
  received_cents: number;
  property_id: string | null;
  partner_id: string | null;
  due_on: string | null;
  notes: string;
  updated_at: string;
};
async function load() {
  const responses = await Promise.all([
    db
      .from("leads")
      .select("id,name,value,stage_id,status")
      .eq("workspace_id", ws)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
    db.from("pipeline_stages").select("id,name").eq("workspace_id", ws),
    db.from("vanessa_deal_financials").select("*").eq("workspace_id", ws),
    db.from("products").select("id,name").eq("workspace_id", ws),
    db.from("companies").select("id,name").eq("workspace_id", ws),
  ]);
  for (const r of responses) if (r.error) throw Error(r.error.message);
  return {
    leads: responses[0].data as Lead[],
    stages: responses[1].data as Array<{ id: string; name: string }>,
    finances: responses[2].data as Finance[],
    properties: responses[3].data as Array<{ id: string; name: string }>,
    partners: responses[4].data as Array<{ id: string; name: string }>,
  };
}
export function VanessaFinancePanel({ compact = false }: { compact?: boolean }) {
  const q = useQuery({ queryKey: ["vanessa-financials"], queryFn: load, refetchInterval: 30000 });
  const [search, setSearch] = useState(""),
    [edit, setEdit] = useState<Lead | null>(null);
  const data = q.data;
  const summary = data ? summarizeVanessaDeals(data.leads, data.stages, data.finances) : null;
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap gap-3 justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary">Gestão imobiliária</p>
          <h1 className="mt-2 text-2xl font-semibold">VGV e comissões</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Valores reais do funil. VGV é o valor dos imóveis negociados; comissão é a remuneração
            da Vanessa.
          </p>
        </div>
        <Button variant="outline" onClick={() => q.refetch()}>
          Atualizar
        </Button>
      </header>
      {q.error ? (
        <p role="alert" className="text-destructive">
          Não foi possível confirmar os valores.{" "}
          <button className="underline" onClick={() => q.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : !summary ? (
        <p role="status">Carregando negociações...</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["VGV em negociação", summary.openVgv],
              ["VGV vendido", summary.soldVgv],
              ["Comissões previstas", summary.expectedCommission],
              ["Comissões recebidas · informadas", summary.receivedCommission],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <strong className="mt-3 block text-xl">{currency(Number(value))}</strong>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Todo o período. Vendas perdidas e locações não entram no VGV. Comissões previstas
            incluem negociações abertas; sobre negócios fechados:{" "}
            {currency(summary.closedCommission)}. Recebimentos são informados pelo operador.
          </p>
          {!compact && data && (
            <>
              <Input
                aria-label="Buscar negociação"
                placeholder="Buscar cliente ou negociação"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="rounded-xl border bg-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground">
                    <tr>
                      {["Cliente / negociação", "Etapa", "Valor", "Comissão", "Recebido", ""].map(
                        (h, i) => (
                          <th key={i} className="p-4">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.leads
                      .filter((l) =>
                        l.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
                      )
                      .map((l) => {
                        const f = data.finances.find((x) => x.lead_id === l.id),
                          stage = data.stages.find((s) => s.id === l.stage_id);
                        return (
                          <tr key={l.id} className="border-b last:border-0">
                            <td className="p-4 font-medium">
                              {l.name}
                              {f?.deal_kind === "locacao" && (
                                <span className="block text-xs text-muted-foreground">
                                  Locação · valor mensal
                                </span>
                              )}
                            </td>
                            <td className="p-4">{stage?.name ?? "Sem etapa"}</td>
                            <td className="p-4 whitespace-nowrap">
                              {currency(parseMoneyCents(l.value ?? 0))}
                            </td>
                            <td className="p-4 whitespace-nowrap">
                              {f ? currency(Number(f.commission_cents)) : "Não definida"}
                            </td>
                            <td className="p-4 whitespace-nowrap">
                              {f ? currency(Number(f.received_cents)) : "—"}
                            </td>
                            <td className="p-4">
                              <Button variant="outline" size="sm" onClick={() => setEdit(l)}>
                                Editar valores
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    {!data.leads.length && (
                      <tr>
                        <td colSpan={6} className="p-8 text-muted-foreground">
                          As negociações do funil aparecem aqui. Cadastre um cliente no CRM para
                          começar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                O fechamento acompanha a etapa do funil. Para marcar uma venda ganha ou perdida,
                atualize a negociação no CRM.
              </p>
            </>
          )}
        </>
      )}
      {edit && data && (
        <FinancialDialog
          lead={edit}
          financial={data.finances.find((f) => f.lead_id === edit.id)}
          properties={data.properties}
          partners={data.partners}
          onClose={() => setEdit(null)}
        />
      )}
    </section>
  );
}
function FinancialDialog({
  lead,
  financial,
  properties,
  partners,
  onClose,
}: {
  lead: Lead;
  financial?: Finance;
  properties: Array<{ id: string; name: string }>;
  partners: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState(financial?.deal_kind ?? "venda"),
    [value, setValue] = useState(
      centsToDecimal(parseMoneyCents(lead.value ?? 0)).replace(".", ","),
    ),
    [mode, setMode] = useState(financial?.commission_mode ?? "percentual"),
    [rate, setRate] = useState(String((financial?.commission_bps ?? 0) / 100).replace(".", ",")),
    [fixed, setFixed] = useState(
      centsToDecimal(Number(financial?.commission_cents ?? 0)).replace(".", ","),
    ),
    [received, setReceived] = useState(
      centsToDecimal(Number(financial?.received_cents ?? 0)).replace(".", ","),
    ),
    [property, setProperty] = useState(financial?.property_id ?? ""),
    [partner, setPartner] = useState(financial?.partner_id ?? ""),
    [due, setDue] = useState(financial?.due_on ?? ""),
    [notes, setNotes] = useState(financial?.notes ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  let preview: number | null = null;
  try {
    preview = commissionCents(
      parseMoneyCents(value),
      mode,
      parseMoneyCents(rate, 10000),
      parseMoneyCents(fixed),
    );
  } catch {}
  async function save() {
    setError("");
    setBusy(true);
    try {
      const v = parseMoneyCents(value),
        bps = parseMoneyCents(rate, 10000),
        fc = parseMoneyCents(fixed),
        rc = parseMoneyCents(received);
      const { error } = await db.rpc("vanessa_save_financials", {
        _lead_id: lead.id,
        _kind: kind,
        _value_cents: v,
        _mode: mode,
        _bps: bps,
        _fixed_cents: fc,
        _received_cents: rc,
        _property_id: property || null,
        _partner_id: partner || null,
        _due_on: due || null,
        _notes: notes,
        _expected_updated_at: financial?.updated_at ?? null,
      });
      if (error) throw Error(error.message);
      await qc.invalidateQueries({ queryKey: ["vanessa-financials"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead.name} · Valores e comissão</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-xs">
            Tipo de negociação
            <select
              aria-label="Tipo de negociação"
              className={field}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="venda">Venda</option>
              <option value="locacao">Locação</option>
            </select>
          </label>
          <label className="text-xs">
            {kind === "locacao" ? "Aluguel mensal (R$)" : "Valor negociado do imóvel (R$)"}
            <Input
              aria-label="Valor negociado"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <label className="text-xs">
            Imóvel
            <select
              aria-label="Imóvel da negociação"
              className={field}
              value={property}
              onChange={(e) => setProperty(e.target.value)}
            >
              <option value="">Sem vínculo</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Parceiro comercial
            <select
              aria-label="Parceiro comercial"
              className={field}
              value={partner}
              onChange={(e) => setPartner(e.target.value)}
            >
              <option value="">Sem parceiro</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Comissão combinada
            <select
              aria-label="Tipo de comissão"
              className={field}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="percentual">Percentual do valor</option>
              <option value="fixa">Valor fixo</option>
            </select>
          </label>
          <label className="text-xs">
            {mode === "percentual" ? "Percentual (%)" : "Comissão fixa (R$)"}
            <Input
              aria-label="Comissão combinada"
              inputMode="decimal"
              value={mode === "percentual" ? rate : fixed}
              onChange={(e) =>
                mode === "percentual" ? setRate(e.target.value) : setFixed(e.target.value)
              }
            />
          </label>
          <div className="rounded-lg border p-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground">Comissão calculada</p>
            <strong>{preview === null ? "Confira os valores" : currency(preview)}</strong>
          </div>
          <label className="text-xs">
            Recebimento informado (R$)
            <Input
              aria-label="Comissão recebida"
              inputMode="decimal"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
            />
          </label>
          <label className="text-xs">
            Previsão de recebimento
            <input
              aria-label="Previsão de recebimento"
              className={field}
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <label className="text-xs sm:col-span-2">
            Observações
            <textarea
              aria-label="Observações financeiras"
              maxLength={3000}
              className={field}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Salvar atualiza o valor da negociação no funil. O recebimento informado não representa
          confirmação bancária.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy || preview === null} onClick={save}>
            {busy ? "Salvando..." : "Salvar valores"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
