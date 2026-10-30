import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { VanessaIcons } from "@/components/dashboard/VanessaIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createCompany, listCompanies, updateCompany } from "@/lib/companies.functions";
export const Route = createFileRoute("/crm/empresas")({
  head: () => ({ meta: [{ title: "Parceiros · Vanessa Simoni" }] }),
  component: PartnersPage,
});
type Details = {
  kind: "construtora" | "imobiliaria" | "corretor" | "outro";
  contact: string;
  email: string;
  region: string;
  address: string;
  creci: string;
  terms: string;
};
type Partner = {
  id: string;
  name: string;
  cnpj: string | null;
  phone: string | null;
  site: string | null;
  notes: string | null;
  partner_details?: Details | null;
};
type Form = {
  name: string;
  cnpj: string;
  phone: string;
  site: string;
  notes: string;
  details: Details;
};
const kinds = {
  construtora: "Construtora",
  imobiliaria: "Imobiliária",
  corretor: "Corretor parceiro",
  outro: "Outro parceiro comercial",
};
const emptyDetails: Details = {
  kind: "outro",
  contact: "",
  email: "",
  region: "",
  address: "",
  creci: "",
  terms: "",
};
const emptyForm: Form = {
  name: "",
  cnpj: "",
  phone: "",
  site: "",
  notes: "",
  details: emptyDetails,
};
const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
function safeSite(site: string) {
  try {
    const u = new URL(/^https?:/.test(site) ? site : "https://" + site);
    return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
function PartnersPage() {
  const list = useServerFn(listCompanies),
    create = useServerFn(createCompany),
    update = useServerFn(updateCompany);
  const q = useQuery({
    queryKey: ["vanessa-partners"],
    queryFn: async () => (await list()).companies as unknown as Partner[],
  });
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("todos"),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [editing, setEditing] = useState<Partner | null | undefined>(undefined),
    [error, setError] = useState("");
  const partners = q.data ?? [],
    selected = partners.find((p) => p.id === selectedId);
  const filtered = useMemo(
    () =>
      partners.filter(
        (p) =>
          (filter === "todos" || p.partner_details?.kind === filter) &&
          [
            p.name,
            p.cnpj,
            p.phone,
            p.partner_details?.contact,
            p.partner_details?.email,
            p.partner_details?.region,
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
      ),
    [partners, filter, query],
  );
  async function save(f: Form) {
    setError("");
    const details = { ...f.details, email: f.details.email.trim() };
    const payload = {
      name: f.name.trim(),
      cnpj: f.cnpj.replace(/\D/g, ""),
      phone: f.phone.trim(),
      site: f.site.trim(),
      notes: f.notes.trim(),
      partnerDetails: details,
    };
    if (payload.site && !safeSite(payload.site)) throw Error("Informe um site válido.");
    if (editing) {
      await update({ data: { companyId: editing.id, ...payload } });
    } else {
      const r = await create({ data: payload });
      setSelectedId(r.companyId);
    }
    await q.refetch();
    setEditing(undefined);
  }
  return (
    <div className="flex min-h-screen bg-background text-foreground md:h-screen md:overflow-hidden">
      <AppSidebar />
      <main className="flex-1 min-w-0 overflow-y-auto p-4 md:p-7">
        <div className="mx-auto max-w-7xl space-y-5">
          <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-6">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
                <VanessaIcons.suppliers size={18} />
                Relacionamentos comerciais
              </div>
              <h1 className="mt-2 text-2xl font-semibold">Parceiros</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Construtoras, imobiliárias e profissionais que fazem parte da operação Vanessa
                Simoni.
              </p>
            </div>
            <Button onClick={() => setEditing(null)}>Adicionar parceiro</Button>
          </header>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Parceiros", partners.length],
              [
                "Construtoras",
                partners.filter((p) => p.partner_details?.kind === "construtora").length,
              ],
              [
                "Imobiliárias",
                partners.filter((p) => p.partner_details?.kind === "imobiliaria").length,
              ],
              ["Corretores", partners.filter((p) => p.partner_details?.kind === "corretor").length],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          {q.error && (
            <p role="alert" className="text-destructive">
              Não foi possível carregar os parceiros.{" "}
              <button onClick={() => q.refetch()} className="underline">
                Tentar novamente
              </button>
            </p>
          )}
          <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <section className="rounded-xl border bg-card p-4 space-y-4">
              <Input
                aria-label="Buscar parceiros"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome, CNPJ, contato ou região"
              />
              <select
                aria-label="Tipo de parceiro"
                className={inputClass}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="todos">Todos os parceiros</option>
                {Object.entries(kinds).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="space-y-2">
                {q.isLoading ? (
                  <p role="status">Carregando parceiros...</p>
                ) : filtered.length ? (
                  filtered.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={
                        "w-full rounded-lg border p-4 text-left " +
                        (p.id === selectedId
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted/40")
                      }
                    >
                      <div className="flex items-center gap-3">
                        <VanessaIcons.suppliers size={24} />
                        <div>
                          <h2 className="font-semibold">{p.name}</h2>
                          <p className="mt-1 text-xs text-primary">
                            {kinds[p.partner_details?.kind ?? "outro"]}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[p.partner_details?.contact, p.phone, p.partner_details?.region]
                              .filter(Boolean)
                              .join(" · ") || "Complete os dados de contato na ficha."}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      {query || filter !== "todos"
                        ? "Nenhum parceiro corresponde aos filtros."
                        : "Cadastre o primeiro parceiro comercial."}
                    </p>
                    <Button variant="outline" className="mt-4" onClick={() => setEditing(null)}>
                      Adicionar parceiro
                    </Button>
                  </div>
                )}
              </div>
            </section>
            <section className="rounded-xl border bg-card p-6">
              {selected ? (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">{selected.name}</h2>
                      <p className="mt-1 text-sm text-primary">
                        {kinds[selected.partner_details?.kind ?? "outro"]}
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => setEditing(selected)}>
                      Editar ficha
                    </Button>
                  </div>
                  <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                    {[
                      ["CNPJ", selected.cnpj],
                      ["Responsável", selected.partner_details?.contact],
                      ["Telefone / WhatsApp", selected.phone],
                      ["E-mail", selected.partner_details?.email],
                      ["Região de atuação", selected.partner_details?.region],
                      ["Endereço", selected.partner_details?.address],
                      ["CRECI / registro", selected.partner_details?.creci],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-1 text-sm break-words">{value || "Não informado"}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-5 flex flex-wrap gap-3 text-sm">
                    {selected.phone && (
                      <a
                        className="text-primary underline"
                        href={"tel:" + selected.phone.replace(/[^+0-9]/g, "")}
                      >
                        Ligar
                      </a>
                    )}
                    {selected.partner_details?.email && (
                      <a
                        className="text-primary underline"
                        href={"mailto:" + selected.partner_details.email}
                      >
                        Enviar e-mail
                      </a>
                    )}
                    {selected.site && safeSite(selected.site) && (
                      <a
                        className="text-primary underline"
                        target="_blank"
                        rel="noreferrer"
                        href={safeSite(selected.site)}
                      >
                        Site do parceiro
                      </a>
                    )}
                  </div>
                  {[
                    ["Condições da parceria e comissões", selected.partner_details?.terms],
                    ["Observações", selected.notes],
                  ].map(([label, value]) => (
                    <div key={label} className="mt-6 border-t pt-4">
                      <h3 className="text-sm font-semibold">{label}</h3>
                      <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                        {value || "Não informado"}
                      </p>
                    </div>
                  ))}
                </>
              ) : (
                <div className="flex min-h-80 flex-col items-center justify-center text-center">
                  <VanessaIcons.suppliers size={44} />
                  <h2 className="mt-4 font-semibold">Ficha do parceiro</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Selecione um parceiro para consultar contatos, região e condições comerciais.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
      <PartnerDialog
        open={editing !== undefined}
        partner={editing}
        onClose={() => setEditing(undefined)}
        onSave={save}
      />
    </div>
  );
}
function PartnerDialog({
  open,
  partner,
  onClose,
  onSave,
}: {
  open: boolean;
  partner?: Partner | null;
  onClose: () => void;
  onSave: (f: Form) => Promise<void>;
}) {
  const [form, setForm] = useState<Form>(emptyForm),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setForm(
        partner
          ? {
              name: partner.name,
              cnpj: partner.cnpj ?? "",
              phone: partner.phone ?? "",
              site: partner.site ?? "",
              notes: partner.notes ?? "",
              details: { ...emptyDetails, ...partner.partner_details },
            }
          : { ...emptyForm, details: { ...emptyDetails } },
      );
      setError("");
    }
  }, [open, partner]);
  const details = (key: keyof Details, value: string) =>
    setForm((f) => ({ ...f, details: { ...f.details, [key]: value } }));
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (!form.name.trim()) throw Error("Informe o nome do parceiro.");
      await onSave(form);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{partner ? "Editar parceiro" : "Adicionar parceiro"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs">
            Nome / razão social *
            <Input
              aria-label="Nome do parceiro"
              value={form.name}
              maxLength={120}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="text-xs">
            Tipo de parceiro
            <select
              aria-label="Tipo do parceiro"
              className={inputClass}
              value={form.details.kind}
              onChange={(e) => details("kind", e.target.value)}
            >
              {Object.entries(kinds).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {[
            ["cnpj", "CNPJ"],
            ["phone", "Telefone / WhatsApp"],
            ["site", "Site"],
          ].map(([key, label]) => (
            <label key={key} className="text-xs">
              {label}
              <Input
                aria-label={label}
                value={String(form[key as keyof Form])}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          {[
            ["contact", "Responsável pelo contato"],
            ["email", "E-mail"],
            ["region", "Região de atuação"],
            ["address", "Endereço"],
            ["creci", "CRECI / registro"],
          ].map(([key, label]) => (
            <label key={key} className="text-xs">
              {label}
              <Input
                aria-label={label}
                type={key === "email" ? "email" : "text"}
                value={form.details[key as keyof Details]}
                onChange={(e) => details(key as keyof Details, e.target.value)}
              />
            </label>
          ))}
          <label className="text-xs sm:col-span-2">
            Condições comerciais e comissões
            <Textarea
              aria-label="Condições comerciais e comissões"
              value={form.details.terms}
              maxLength={3000}
              onChange={(e) => details("terms", e.target.value)}
            />
          </label>
          <label className="text-xs sm:col-span-2">
            Observações
            <Textarea
              aria-label="Observações"
              value={form.notes}
              maxLength={2000}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? "Salvando..." : "Salvar parceiro"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
