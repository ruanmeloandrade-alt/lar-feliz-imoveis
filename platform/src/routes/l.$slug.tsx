import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getPublicForm, submitPublicForm, uploadFormSubmissionFile, CURRENCY_SYMBOL, type FormBranding, type FormField, type FormCurrency } from "@/lib/forms.functions";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { FormSchedulePicker, pickFormValue } from "@/components/forms/FormSchedulePicker";

const searchSchema = z.object({
  leadId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/l/$slug")({
  beforeLoad: () => {
    throw notFound();
  },
  head: ({ params }) => ({
    meta: [
      { title: `Formulário · ${params.slug} · Vanessa Simoni` },
      { name: "description", content: "Preencha o formulário e receba um retorno rapidinho." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: searchSchema,
  component: PublicFormPage,
});

function PublicFormPage() {
  const { slug } = Route.useParams();
  const { leadId } = Route.useSearch();
  const load = useServerFn(getPublicForm);
  const submit = useServerFn(submitPublicForm);

  const formQ = useQuery({
    queryKey: ["public-form", slug],
    queryFn: () => load({ data: { slug } }),
    staleTime: 60_000,
  });

  const form = formQ.data;
  const branding: FormBranding = form?.branding ?? {};
  const primary = branding.primaryColor || "#2563eb";
  const accent = branding.accentColor || "#111827";

  const [values, setValues] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (payload: { slug: string; leadId?: string; values: Record<string, string> }) =>
      submit({ data: { slug: payload.slug, leadId: payload.leadId ?? null, values: payload.values } }),
    onSuccess: () => { setDone(true); setErr(null); },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
  });

  const cssVars = useMemo(() => ({ ["--form-primary" as any]: primary, ["--form-accent" as any]: accent }), [primary, accent]);

  if (formQ.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!form) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-700 px-6 text-center gap-3">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <h1 className="text-xl font-semibold">Formulário não encontrado</h1>
        <p className="text-sm text-slate-500">O link expirou ou foi removido pelo administrador.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 flex flex-col items-center" style={cssVars as React.CSSProperties}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100" style={{ backgroundColor: `${accent}08` }}>
          {branding.logoUrl && (
            <img src={branding.logoUrl} alt="Logo" className="h-10 mb-4 object-contain" />
          )}
          <h1 className="text-2xl font-semibold text-slate-900">
            {branding.headline || form.nome}
          </h1>
          {(branding.subheadline || form.descricao) && (
            <p className="mt-2 text-sm text-slate-600">
              {branding.subheadline || form.descricao}
            </p>
          )}
        </div>

        {done ? (
          <div className="p-8 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-10 w-10" style={{ color: primary }} />
            <h2 className="text-lg font-semibold text-slate-900">Recebido!</h2>
            <p className="text-sm text-slate-600 max-w-sm">
              {branding.thanksMessage || "Obrigado por preencher. Entraremos em contato em breve."}
            </p>
            {branding.thanksButtonMode === "agendamento" ? (
              <FormSchedulePicker
                slug={slug}
                leadId={leadId ?? null}
                label={branding.thanksButtonLabel}
                primary={primary}
                name={pickFormValue(form.campos, values, "text")}
                email={pickFormValue(form.campos, values, "email")}
                phone={pickFormValue(form.campos, values, "phone")}
              />
            ) : branding.thanksButtonUrl ? (
              <a
                href={branding.thanksButtonUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center justify-center h-10 px-5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: primary }}
              >
                {branding.thanksButtonLabel || "Continuar"}
              </a>
            ) : null}
          </div>
        ) : (
          <form
            className="p-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              mut.mutate({ slug, leadId, values });
            }}
          >
            {form.campos.map((c: FormField) => (
              <FieldInput
                key={c.id}
                field={c}
                slug={slug}
                value={values[c.id] ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [c.id]: v }))}
              />
            ))}


            {err && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>
            )}

            <button
              type="submit"
              disabled={mut.isPending}
              className="w-full h-11 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: primary }}
            >
              {mut.isPending ? "Enviando…" : "Enviar"}
            </button>
          </form>
        )}

        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span>{branding.footerText || "Enviado com segurança"}</span>
          <a href="https://saudeslim.com.br" target="_blank" rel="noreferrer" className="hover:text-slate-600">
            powered by Vanessa Simoni
          </a>
        </div>
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange, slug }: { field: FormField; value: string; onChange: (v: string) => void; slug: string }) {
  const common = "w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--form-primary)] focus:border-transparent";
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-700">
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {field.kind === "select" ? (
        <select className={common} value={value} onChange={(e) => onChange(e.target.value)} required={field.required}>
          <option value="">Selecione…</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : field.kind === "file" ? (
        (field.fileMode ?? "link") === "upload" ? (
          <FileUploadInput field={field} slug={slug} value={value} onChange={onChange} />
        ) : (
          <input
            type="url"
            placeholder="Cole aqui um link (Google Drive, Dropbox…)"
            className={common}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
          />
        )
      ) : field.kind === "value" ? (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center w-11 text-sm font-medium text-slate-500 border-r border-slate-200">
            {CURRENCY_SYMBOL[(field.currency ?? "BRL") as FormCurrency]}
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className={`${common} pl-14`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
          />
        </div>
      ) : (
        <input
          type={field.kind === "email" ? "email" : field.kind === "phone" ? "tel" : "text"}
          inputMode={field.kind === "phone" ? "tel" : undefined}
          className={common}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      )}
    </label>
  );
}

function FileUploadInput({ field, slug, value, onChange }: { field: FormField; slug: string; value: string; onChange: (v: string) => void }) {
  const upload = useServerFn(uploadFormSubmissionFile);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setErr("Máx. 5 MB."); return; }
    setBusy(true); setErr(null);
    try {
      const base64: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] ?? "");
        r.onerror = () => rej(r.error);
        r.readAsDataURL(file);
      });
      const out = await upload({ data: {
        slug,
        fieldId: field.id,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        base64,
      } }) as { url: string; filename: string };
      onChange(out.url);
      setName(file.name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="cursor-pointer flex-1">
        <input
          type="file"
          className="hidden"
          disabled={busy}
          onChange={(e) => handleFile(e.target.files?.[0])}
          required={field.required && !value}
        />
        <span className="inline-flex items-center justify-center w-full h-10 px-3 rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-600 hover:border-slate-400">
          {busy ? "Enviando…" : value ? (name ?? "Arquivo enviado") : "Clique para anexar (PDF, imagem, etc.)"}
        </span>
      </label>
      {value && !busy && (
        <button
          type="button"
          onClick={() => { onChange(""); setName(null); }}
          className="text-[11px] text-slate-500 hover:text-red-600"
        >
          Remover
        </button>
      )}
      {err && <span className="text-[11px] text-red-600">{err}</span>}
    </div>
  );
}

