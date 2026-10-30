import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck, Unplug } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSignatureIntegration, testSignatureIntegration } from "@/lib/signature-integrations.functions";
import { disconnectSignatureIntegration } from "@/lib/signature-disconnect.functions";
import { startDocusignOAuth } from "@/lib/docusign.functions";

export type SignatureProvider = "clicksign" | "zapsign" | "docusign";

export function SignatureConnectPanel({ provider, open, onOpenChange }: {
  provider: SignatureProvider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useServerFn(saveSignatureIntegration);
  const test = useServerFn(testSignatureIntegration);
  const disconnect = useServerFn(disconnectSignatureIntegration);
  const startOAuth = useServerFn(startDocusignOAuth);
  const [apiToken, setApiToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [environment, setEnvironment] = useState<"production" | "sandbox">("production");
  const [docusignEnvironment, setDocusignEnvironment] = useState<"production" | "demo">("production");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (!provider) return null;
  const isZapSign = provider === "zapsign";
  const isDocusign = provider === "docusign";
  const title = isDocusign ? "Conectar DocuSign" : isZapSign ? "Conectar ZapSign" : "Conectar Clicksign";

  async function handleDocusignOAuth() {
    setBusy(true); setMessage(null);
    try {
      const result = await startOAuth({ data: { origin: window.location.origin, environment: docusignEnvironment } });
      window.location.assign(result.url);
    } catch (error) {
      setOk(false); setMessage(error instanceof Error ? error.message : "Falha ao iniciar OAuth DocuSign."); setBusy(false);
    }
  }

  async function handleSave() {
    if (!apiToken.trim() || isDocusign) return;
    setBusy(true); setMessage(null); setOk(false);
    try {
      await save({ data: {
        provider,
        apiToken: apiToken.trim(),
        webhookSecret: webhookSecret.trim() || undefined,
        callbackUrl: window.location.origin,
        environment: provider === "clicksign" ? environment : undefined,
      } });
      setOk(true);
      setMessage(isZapSign ? "ZapSign conectada e webhook seguro configurado automaticamente." : "Clicksign conectada e token validado.");
      setApiToken("");
      if (isZapSign) setWebhookSecret("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao conectar provedor.");
    } finally { setBusy(false); }
  }

  async function handleTest() {
    if (isDocusign) { setMessage("O status DocuSign é validado pelo OAuth e pelo primeiro envelope enviado."); setOk(true); return; }
    setBusy(true); setMessage(null);
    try {
      await test({ data: { provider } });
      setOk(true); setMessage("Conexão validada no provedor.");
    } catch (error) {
      setOk(false); setMessage(error instanceof Error ? error.message : "Teste falhou.");
    } finally { setBusy(false); }
  }

  async function handleDisconnect() {
    if (!window.confirm(`Desconectar ${isDocusign ? "DocuSign" : isZapSign ? "ZapSign" : "Clicksign"} deste workspace?`)) return;
    setBusy(true); setMessage(null);
    try {
      await disconnect({ data: { provider } });
      setOk(true); setMessage("Integração desconectada deste workspace.");
    } catch (error) {
      setOk(false); setMessage(error instanceof Error ? error.message : "Falha ao desconectar integração.");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Credenciais ficam criptografadas por workspace e só são lidas no servidor.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          {isDocusign ? <>
            <div className="space-y-1.5"><Label>Ambiente DocuSign</Label><select value={docusignEnvironment} onChange={(e) => setDocusignEnvironment(e.target.value as "production" | "demo")} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="production">Produção</option><option value="demo">Demo / Developer</option></select></div>
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">A DocuSign usa OAuth. A Vanessa Simoni abre a autorização oficial, descobre a conta/base URI correta e guarda access/refresh token no vault criptografado.</div>
            <Button className="w-full" onClick={handleDocusignOAuth} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}Autorizar / reconectar na DocuSign</Button>
          </> : <>
            {provider === "clicksign" && <div className="space-y-1.5"><Label>Ambiente</Label><select value={environment} onChange={(e) => setEnvironment(e.target.value as "production" | "sandbox")} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="production">Produção</option><option value="sandbox">Sandbox</option></select></div>}
            <div className="space-y-1.5"><Label>{isZapSign ? "API Token" : "Access Token"}</Label><Input type="password" autoComplete="off" value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder={isZapSign ? "Token da API ZapSign" : "Token da API Clicksign"} /></div>
            <div className="space-y-1.5"><Label>{isZapSign ? "Webhook Secret (opcional)" : "Webhook Secret"}</Label><Input type="password" autoComplete="off" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder={isZapSign ? "Deixe vazio para a Vanessa Simoni gerar" : "Segredo configurado no webhook Clicksign"} /><p className="text-[11px] text-muted-foreground">{isZapSign ? "A Vanessa Simoni registra o webhook doc_signed e injeta um cabeçalho secreto automaticamente." : "Use o mesmo segredo configurado no webhook da Clicksign para validar os callbacks."}</p></div>
          </>}

          {message && <div className={`rounded-md border p-3 text-xs ${ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"}`}><div className="flex items-start gap-2">{ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" /> : <ShieldCheck className="w-4 h-4 mt-0.5" />}<span>{message}</span></div></div>}

          <div className="flex justify-between gap-2 border-t pt-3">
            <Button variant="ghost" size="sm" onClick={handleDisconnect} disabled={busy} className="text-destructive"><Unplug className="w-4 h-4 mr-1" />Desconectar</Button>
            {!isDocusign && <div className="flex gap-2"><Button variant="outline" onClick={handleTest} disabled={busy}>Testar salva</Button><Button onClick={handleSave} disabled={busy || !apiToken.trim()}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar / reconectar</Button></div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
