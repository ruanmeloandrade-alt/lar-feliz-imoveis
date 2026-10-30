import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { Block } from "@/lib/salesbot-types";
import {
  listSalesbotExternalAutomations,
  type SalesbotExternalAutomationOption,
} from "@/lib/salesbot-external-automations.functions";
import { testSalesbotExternalAutomation } from "@/lib/salesbot-external-automation-test.functions";
import { testSalesbotWebhook } from "@/lib/salesbot-webhook.functions";

type Props = {
  block: Block;
  allBlocks: Block[];
  onChange: (patch: Partial<Block>) => void;
};

export function SalesbotWebhookEditor({ block, allBlocks, onChange }: Props) {
  const listFn = useServerFn(listSalesbotExternalAutomations);
  const directTestFn = useServerFn(testSalesbotWebhook);
  const connectedTestFn = useServerFn(testSalesbotExternalAutomation);
  const connectionsQ = useQuery({
    queryKey: ["salesbot-external-automations"],
    queryFn: () => listFn({} as never),
    staleTime: 15_000,
    refetchOnMount: "always",
  });
  const connections = (connectionsQ.data ?? []) as SalesbotExternalAutomationOption[];
  const connectedMode = Boolean(block.webhookAutomationId);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      if (connectedMode && block.webhookAutomationId) {
        const response = await connectedTestFn({ data: { automationId: block.webhookAutomationId } });
        setResult({ ok: response.ok, message: response.message });
      } else {
        const response = await directTestFn({
          data: {
            url: block.webhookUrl ?? "",
            method: block.webhookMethod ?? "POST",
            secret: block.webhookSecret || undefined,
            timeoutMs: block.webhookTimeoutMs ?? 15_000,
            retries: block.webhookRetries ?? 0,
          },
        });
        setResult({ ok: response.ok, message: response.message });
      }
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setTesting(false);
    }
  }

  const otherBlocks = allBlocks
    .filter((candidate) => candidate.id !== block.id)
    .sort((a, b) => (a.serial ?? 0) - (b.serial ?? 0));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => {
            const first = connections[0];
            onChange({
              webhookAutomationId: first?.id,
              webhookProvider: first?.provider,
            });
            setResult(null);
          }}
          disabled={connections.length === 0}
          className={`rounded border px-2 py-1.5 text-[11px] ${
            connectedMode
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
              : "border-slate-700 text-slate-400"
          } disabled:opacity-50`}
        >
          Integração conectada
        </button>
        <button
          type="button"
          onClick={() => {
            onChange({ webhookAutomationId: undefined, webhookProvider: undefined });
            setResult(null);
          }}
          className={`rounded border px-2 py-1.5 text-[11px] ${
            !connectedMode
              ? "border-sky-500 bg-sky-500/10 text-sky-300"
              : "border-slate-700 text-slate-400"
          }`}
        >
          URL direta
        </button>
      </div>

      {connectedMode ? (
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-slate-500">
            Make / n8n / Zapier / Webhook conectado
          </label>
          <select
            value={block.webhookAutomationId ?? ""}
            onChange={(event) => {
              const selected = connections.find((item) => item.id === event.target.value);
              onChange({
                webhookAutomationId: selected?.id,
                webhookProvider: selected?.provider,
              });
              setResult(null);
            }}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
          >
            <option value="">
              {connectionsQ.isLoading
                ? "Carregando integrações…"
                : connections.length === 0
                  ? "Nenhuma integração externa conectada"
                  : "Selecione a integração…"}
            </option>
            {connections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}{item.lastError ? " — atenção" : ""}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500">
            Usa a URL, autenticação, assinatura HMAC e retries já salvos em Integrações. Credenciais não são copiadas para o bloco.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <select
              value={block.webhookMethod ?? "POST"}
              onChange={(event) => onChange({ webhookMethod: event.target.value as "POST" | "PUT" | "PATCH" })}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
            >
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
            </select>
            <input
              value={block.webhookUrl ?? ""}
              onChange={(event) => onChange({ webhookUrl: event.target.value, acaoConfig: event.target.value })}
              placeholder="https://sua-url.com/webhook"
              className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
            />
          </div>
          <input
            value={block.webhookSecret ?? ""}
            onChange={(event) => onChange({ webhookSecret: event.target.value })}
            placeholder="Segredo HMAC opcional"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-slate-400">
              Timeout (seg.)
              <input
                type="number"
                min={1}
                max={30}
                value={Math.round((block.webhookTimeoutMs ?? 15_000) / 1000)}
                onChange={(event) => onChange({ webhookTimeoutMs: Math.max(1, Math.min(30, Number(event.target.value) || 15)) * 1000 })}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
              />
            </label>
            <label className="text-[10px] text-slate-400">
              Tentativas extras
              <input
                type="number"
                min={0}
                max={3}
                value={block.webhookRetries ?? 0}
                onChange={(event) => onChange({ webhookRetries: Math.max(0, Math.min(3, Number(event.target.value) || 0)) })}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
              />
            </label>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-slate-500">
          Guardar resposta na variável
        </label>
        <input
          value={block.webhookResponseVariable ?? "webhook_response"}
          onChange={(event) => onChange({ webhookResponseVariable: event.target.value.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64) })}
          placeholder="webhook_response"
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono"
        />
        <p className="text-[10px] text-slate-500">
          A resposta JSON fica disponível no fluxo junto com webhook_ok, webhook_status e webhook_error.
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-slate-500">
          Se der erro, ir para
        </label>
        <select
          value={block.webhookErrorNextBlockId ?? ""}
          onChange={(event) => onChange({ webhookErrorNextBlockId: event.target.value || undefined })}
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs"
        >
          <option value="">Continuar pelo caminho principal</option>
          {otherBlocks.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {typeof candidate.serial === "number" ? `#${candidate.serial} — ` : ""}{candidate.kind}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-slate-500">
          Sucesso segue pelo cabo principal. Em falha, o bloco acima pode desviar para outro ponto do bot.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={testing || (connectedMode ? !block.webhookAutomationId : !(block.webhookUrl ?? "").trim())}
          onClick={() => void runTest()}
          className="text-[11px] px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
        >
          {testing ? "Enviando teste…" : "Testar execução"}
        </button>
        {result && (
          <span className={`text-[11px] ${result.ok ? "text-emerald-400" : "text-rose-400"}`}>
            {result.ok ? "OK — " : "Falhou — "}{result.message}
          </span>
        )}
      </div>

      <p className="text-[10px] text-slate-500">
        Payload: <code>{`{ lead_id, workspace_id, salesbot_id, run_id, block_id, variables }`}</code>
      </p>
    </div>
  );
}
