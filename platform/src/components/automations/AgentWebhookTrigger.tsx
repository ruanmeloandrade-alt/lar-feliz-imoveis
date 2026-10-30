import { useMemo, useState } from "react";
import { Copy, Check, RefreshCw, Webhook, ChevronRight } from "lucide-react";

export type WebhookTriggerValue = {
  enabled: boolean;
  secret: string;
  /** Destino padrão: telefone (agente 1-a-1) ou JID do grupo (agente de grupo). */
  target: string;
  /** Template de mensagem, aceita {{campo}} do payload JSON. */
  template: string;
};

export function emptyWebhookTrigger(): WebhookTriggerValue {
  return { enabled: false, secret: "", target: "", template: "" };
}

function genSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function AgentWebhookTrigger({
  agentId,
  scope,
  targetLabel,
  targetPlaceholder,
  value,
  onChange,
}: {
  agentId: string | null;
  scope: "1a1" | "grupo";
  targetLabel: string;
  targetPlaceholder: string;
  value: WebhookTriggerValue;
  onChange: (v: WebhookTriggerValue) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const url = useMemo(() => {
    if (typeof window === "undefined") return "";
    if (!agentId) return "";
    return `${window.location.origin}/api/public/hooks/agent-webhook/${agentId}?scope=${scope}`;
  }, [agentId, scope]);

  const secret = value.secret || "";
  const curl = useMemo(() => {
    if (!agentId) return "";
    return [
      `curl -X POST "${url}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -H "x-webhook-secret: ${secret || "<GERE AO SALVAR>"}" \\`,
      `  -d '{"message":"Live começando agora 🎥","target":"${value.target || (scope === "grupo" ? "120@g.us" : "5511999999999")}"}'`,
    ].join("\n");
  }, [url, secret, agentId, value.target, scope]);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1400);
    } catch {}
  };

  const ensureSecret = () => {
    if (!secret) onChange({ ...value, secret: genSecret(), enabled: true });
  };
  const rotate = () => onChange({ ...value, secret: genSecret() });

  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-lg bg-muted/20">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 min-w-0 text-left flex-1"
        >
          <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          <Webhook className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs font-semibold truncate">Gatilho por webhook externo</span>
          <span className="text-[10px] text-muted-foreground shrink-0">(opcional)</span>
          {value.enabled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 shrink-0">ativo</span>
          )}
        </button>
        <label className="flex items-center gap-1.5 text-[11px] shrink-0">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => {
              const enabled = e.target.checked;
              onChange({ ...value, enabled, secret: enabled && !secret ? genSecret() : secret });
              if (enabled) setOpen(true);
            }}
          />
          Ativo
        </label>
      </div>

      {open && (
      <div className="px-3 pb-3">
      <p className="text-[11px] text-muted-foreground">
        Um <code>POST</code> autenticado dispara o agente, útil pra Hotmart (venda),
        Zoom/Meet (reunião iniciada), OBS/Live, Zapier/Make, etc.
      </p>

      {!agentId && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Salve o agente uma vez para gerar a URL única deste gatilho.
        </div>
      )}

      {agentId && (

        <div className="mt-3 space-y-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">URL do webhook</label>
            <div className="flex items-center gap-1.5 mt-1">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 bg-background border border-border rounded px-2 py-1 text-[11px] font-mono"
              />
              <button
                type="button"
                onClick={() => copy("url", url)}
                className="p-1.5 rounded border border-border hover:bg-muted"
                title="Copiar URL"
              >
                {copied === "url" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Segredo <span className="normal-case text-muted-foreground/70">(header <code>x-webhook-secret</code>)</span>
            </label>
            <div className="flex items-center gap-1.5 mt-1">
              <input
                readOnly
                value={secret || ""}
                placeholder="clique em gerar"
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 bg-background border border-border rounded px-2 py-1 text-[11px] font-mono"
              />
              <button
                type="button"
                onClick={secret ? rotate : ensureSecret}
                className="p-1.5 rounded border border-border hover:bg-muted"
                title={secret ? "Girar segredo" : "Gerar segredo"}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              {secret && (
                <button
                  type="button"
                  onClick={() => copy("secret", secret)}
                  className="p-1.5 rounded border border-border hover:bg-muted"
                  title="Copiar segredo"
                >
                  {copied === "secret" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Só é mostrado dentro desta plataforma. Ao girar, atualize o serviço externo.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {targetLabel} padrão <span className="normal-case text-muted-foreground/70">(pode ser sobrescrito no payload em <code>target</code>)</span>
              </label>
              <input
                value={value.target}
                onChange={(e) => onChange({ ...value, target: e.target.value })}
                placeholder={targetPlaceholder}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Mensagem <span className="normal-case text-muted-foreground/70">(use <code>{"{{campo}}"}</code> pra ler o payload; ou envie <code>message</code> na requisição)</span>
              </label>
              <textarea
                value={value.template}
                onChange={(e) => onChange({ ...value, template: e.target.value })}
                rows={2}
                placeholder={scope === "grupo"
                  ? "🎥 A live {{titulo}} começou! Entra aí: {{link}}"
                  : "Olá {{nome}}! Sua compra de {{produto}} foi confirmada."}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs mt-1 font-mono"
              />
            </div>
          </div>

          <details className="mt-1">
            <summary className="text-[11px] font-medium cursor-pointer text-muted-foreground hover:text-foreground">
              Ver exemplo de requisição
            </summary>
            <div className="mt-1.5 relative">
              <pre className="text-[10px] bg-background border border-border rounded p-2 overflow-x-auto font-mono whitespace-pre">{curl}</pre>
              <button
                type="button"
                onClick={() => copy("curl", curl)}
                className="absolute top-1.5 right-1.5 p-1 rounded border border-border bg-card hover:bg-muted"
              >
                {copied === "curl" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </details>
        </div>
      )}
      </div>
      )}
    </div>
  );
}

