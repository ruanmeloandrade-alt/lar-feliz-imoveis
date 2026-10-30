import { createFileRoute, Navigate } from "@tanstack/react-router";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  getPublicForm,
  submitPublicForm,
  uploadFormSubmissionFile,
  CURRENCY_SYMBOL,
  type FormBranding,
  type FormField,
  type FormCurrency,
} from "@/lib/forms.functions";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { FormSchedulePicker, pickFormValue } from "@/components/forms/FormSchedulePicker";

const searchSchema = z.object({
  leadId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/$workspace/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Formulário · ${params.slug} · Vanessa Simoni` },
      { name: "description", content: "Preencha o formulário e receba um retorno rapidinho." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: searchSchema,
  component: WorkspaceScopedFormPage,
});

function WorkspaceScopedFormPage() {
  const { workspace, slug } = Route.useParams();
  const { leadId } = Route.useSearch();
  const load = useServerFn(getPublicForm);
  const submit = useServerFn(submitPublicForm);
  const upload = useServerFn(uploadFormSubmissionFile);

  const formQ = useQuery({
    queryKey: ["public-form", workspace, slug],
    queryFn: () => load({ data: { slug, workspaceSlug: workspace } }),
    staleTime: 60_000,
    retry: false,
  });

  const form = formQ.data;
  const branding: FormBranding = form?.branding ?? {};
  const primary = branding.primaryColor || "#2563eb";
  const accent = branding.accentColor || "#111827";

  const [values, setValues] = useState<Record<string, string | number | null>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitMut = useMutation({
    mutationFn: () => submit({
      data: {
        slug,
        workspaceSlug: workspace,
        leadId: leadId ?? null,
        values: values as Record<string, string | number | boolean | null>,
      },
    }),
    onSuccess: () => setSubmitted(true),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const hasError = formQ.isError;
  if (formQ.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (hasError || !form) {
    // Not found under this workspace: fall back to legacy short link
    return <Navigate to="/l/$slug" params={{ slug }} search={{ leadId }} replace />;
  }

  function setValue(id: string, v: string | number | null) {
    setValues((prev) => ({ ...prev, [id]: v }));
  }

  const currencies = useMemo(
    () => form.campos.filter((c) => c.kind === "value").map((c) => (c.currency ?? "BRL") as FormCurrency),
    [form.campos],
  );

  if (submitted) {
    return (
      <div className="min-h-screen" style={{ background: accent }}>
        <div className="max-w-lg mx-auto p-6 pt-16 text-center">
          <div className="bg-background text-foreground rounded-xl p-8 shadow-xl border border-border">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: primary }} />
            <h1 className="text-lg font-semibold mb-2">
              {branding.thanksMessage || "Recebemos suas respostas!"}
            </h1>
            {branding.thanksButtonMode === "agendamento" ? (
              <FormSchedulePicker
                slug={slug}
                workspaceSlug={workspace}
                leadId={leadId ?? null}
                label={branding.thanksButtonLabel}
                primary={primary}
                name={pickFormValue(form.campos, values, "text")}
                email={pickFormValue(form.campos, values, "email")}
                phone={pickFormValue(form.campos, values, "phone")}
              />
            ) : branding.thanksButtonUrl && branding.thanksButtonLabel ? (
              <a
                href={branding.thanksButtonUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block mt-3 px-4 py-2 rounded text-sm font-medium text-white"
                style={{ background: primary }}
              >
                {branding.thanksButtonLabel}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: accent }}>
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <div className="bg-background text-foreground rounded-xl overflow-hidden shadow-xl border border-border">
          {branding.logoUrl && (
            <div className="p-4 border-b border-border grid place-items-center">
              <img src={branding.logoUrl} alt="Logo" className="max-h-14" />
            </div>
          )}
          <div className="p-4 sm:p-6">
            <h1 className="text-lg font-semibold">{branding.headline || form.nome}</h1>
            {(branding.subheadline || form.descricao) && (
              <p className="text-xs text-muted-foreground mt-1">
                {branding.subheadline || form.descricao}
              </p>
            )}
            {error && (
              <div className="mt-3 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 text-destructive text-xs p-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                submitMut.mutate();
              }}
            >
              {form.campos.map((c: FormField) => (
                <div key={c.id}>
                  <label className="text-[11px] text-muted-foreground">
                    {c.label} {c.required && <span className="text-destructive">*</span>}
                  </label>
                  {c.kind === "select" ? (
                    <select
                      required={c.required}
                      value={(values[c.id] as string | undefined) ?? ""}
                      onChange={(e) => setValue(c.id, e.target.value)}
                      className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-sm"
                    >
                      <option value="">Selecione…</option>
                      {(c.options ?? []).filter((o) => o.trim()).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : c.kind === "value" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {CURRENCY_SYMBOL[(c.currency ?? "BRL") as FormCurrency]}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        required={c.required}
                        value={(values[c.id] as number | undefined) ?? ""}
                        onChange={(e) => setValue(c.id, e.target.value === "" ? null : Number(e.target.value))}
                        className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                  ) : (
                    <input
                      type={c.kind === "email" ? "email" : c.kind === "phone" ? "tel" : "text"}
                      required={c.required}
                      value={(values[c.id] as string | undefined) ?? ""}
                      onChange={(e) => setValue(c.id, e.target.value)}
                      className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-sm"
                    />
                  )}

                </div>
              ))}
              <button
                type="submit"
                disabled={submitMut.isPending}
                className="w-full text-sm font-medium text-white rounded py-2 disabled:opacity-60"
                style={{ background: primary }}
              >
                {submitMut.isPending ? "Enviando…" : "Enviar"}
              </button>
            </form>
          </div>
          {branding.footerText && (
            <div className="px-6 py-3 border-t border-border text-[11px] text-muted-foreground text-center">
              {branding.footerText}
            </div>
          )}
        </div>
      </div>
      {/* silence unused warning */}
      <span className="hidden">{currencies.length}{typeof upload}</span>
    </div>
  );
}
