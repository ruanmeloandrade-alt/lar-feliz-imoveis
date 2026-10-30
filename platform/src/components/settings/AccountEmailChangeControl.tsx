import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Mail, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { changeMyLoginEmail } from "@/lib/account-email.functions";
import { normalizeLoginEmail, sameLoginEmail } from "@/lib/account-email.core";

export function AccountEmailChangeControl() {
  const changeEmail = useServerFn(changeMyLoginEmail);
  const [open, setOpen] = useState(false);
  const [currentEmail, setCurrentEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setCurrentEmail(data.session?.user.email ?? "");
      setLoadingCurrent(false);
    }).catch(() => {
      if (!active) return;
      setLoadingCurrent(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const normalizedNewEmail = useMemo(() => normalizeLoginEmail(newEmail), [newEmail]);
  const canSave =
    !saving &&
    normalizedNewEmail.length > 3 &&
    normalizedNewEmail.includes("@") &&
    !sameLoginEmail(currentEmail, normalizedNewEmail);

  const close = () => {
    if (saving) return;
    setOpen(false);
    setNewEmail("");
    setError(null);
    setSuccess(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await changeEmail({ data: { email: normalizedNewEmail } });
      setCurrentEmail(result.email);
      setNewEmail("");
      setSuccess("E-mail de acesso alterado e salvo.");

      // Atualiza os claims locais da sessão; a troca no Auth já foi concluída no servidor.
      await supabase.auth.refreshSession().catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar o e-mail de acesso.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
          setSuccess(null);
        }}
        className="fixed right-5 top-5 z-[70] inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-md transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
        aria-label="Trocar e-mail de acesso"
      >
        <Mail className="h-4 w-4 text-primary" />
        <span className="hidden sm:inline">Trocar e-mail</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-email-title"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="change-email-title" className="text-base font-semibold">Trocar e-mail de acesso</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    A mudança é imediata. Depois de salvar, o próximo login será feito com o novo e-mail.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submit} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">E-mail atual</label>
                <input
                  type="text"
                  value={loadingCurrent ? "Carregando…" : currentEmail}
                  readOnly
                  className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mkton-new-login-email" className="text-xs font-medium text-muted-foreground">
                  Novo e-mail
                </label>
                <input
                  id="mkton-new-login-email"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  placeholder="novoemail@empresa.com"
                  required
                  maxLength={200}
                  autoFocus
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Não será solicitado código de confirmação para concluir esta troca.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {success}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={close}
                  disabled={saving}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={!canSave}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar novo e-mail
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
