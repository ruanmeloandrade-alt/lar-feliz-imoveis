import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TikTokConnectPanel as TikTokConnectPanelLegacy } from "./TikTokConnectPanelLegacy";
import {
  getTikTokAdsOAuthStatus,
  selectTikTokAdvertiser,
  startTikTokAdsOAuth,
} from "@/lib/tiktok.oauth.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Status = {
  envReady: boolean;
  connected: boolean;
  selectedAdvertiserId: string | null;
  advertisers: Array<{ id: string; name: string }>;
  needsAdvertiserSelection: boolean;
};

/**
 * Entrada OAuth-first para TikTok Ads.
 *
 * Conexões antigas continuam compatíveis no painel legado, mas um cliente novo
 * nunca precisa copiar access token/app secret/advertiser id manualmente:
 * autoriza a conta TikTok for Business e, quando houver mais de um advertiser,
 * escolhe a conta que quer operar.
 */
export function TikTokConnectPanel({ open, onOpenChange }: Props) {
  const statusFn = useServerFn(getTikTokAdsOAuthStatus);
  const startOAuth = useServerFn(startTikTokAdsOAuth);
  const selectAdvertiser = useServerFn(selectTikTokAdvertiser);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await statusFn();
      setStatus(next as Status);
      setSelected((next as Status).selectedAdvertiserId ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFn]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // Conexões legadas (sem advertiser enumerável) continuam funcionando.
  // OAuth com um único advertiser é selecionado automaticamente no callback.
  const readyForLegacy = Boolean(
    status?.connected &&
    (status.selectedAdvertiserId || status.advertisers.length <= 1) &&
    !status.needsAdvertiserSelection,
  );

  if (readyForLegacy) {
    return <TikTokConnectPanelLegacy open={open} onOpenChange={onOpenChange} />;
  }

  async function authorize() {
    setBusy(true);
    setError(null);
    try {
      const origin = window.location.origin;
      const result = await startOAuth({ data: { redirectOrigin: origin } });
      window.location.assign(result.authorizeUrl);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function saveAdvertiser() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await selectAdvertiser({ data: { advertiserId: selected } });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>TikTok Ads</DialogTitle>
          <DialogDescription>
            Autorize sua própria conta TikTok for Business. As credenciais técnicas do app Vanessa Simoni
            ficam somente no servidor.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading || !status ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !status.envReady ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <div className="font-medium">Configuração administrativa pendente</div>
              <p className="mt-1 text-xs text-muted-foreground">
                O administrador da Vanessa Simoni precisa cadastrar TIKTOK_APP_ID e TIKTOK_APP_SECRET no
                servidor. Nenhum segredo deve ser solicitado ao cliente final.
              </p>
            </div>
            <Button variant="outline" onClick={() => void refresh()} disabled={busy}>
              <RefreshCw className="mr-2 h-4 w-4" /> Verificar novamente
            </Button>
          </div>
        ) : !status.connected ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <div className="font-medium">Como funciona</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Você será redirecionado ao TikTok para autorizar a conta. A Vanessa Simoni recebe a
                autorização e lista os advertisers disponíveis; você não digita access token, app
                secret ou credenciais técnicas.
              </p>
            </div>
            <Button onClick={() => void authorize()} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Autorizar conta TikTok Ads
            </Button>
          </div>
        ) : status.advertisers.length > 1 && !status.selectedAdvertiserId ? (
          <div className="space-y-4">
            <div className="flex gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              <span>
                Conta TikTok autorizada. Agora escolha qual advertiser o Gestor de Tráfego deve
                operar.
              </span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tiktok-advertiser">Advertiser</Label>
              <select
                id="tiktok-advertiser"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Selecione uma conta</option>
                {status.advertisers.map((advertiser) => (
                  <option key={advertiser.id} value={advertiser.id}>
                    {advertiser.name} ({advertiser.id})
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={() => void saveAdvertiser()} disabled={busy || !selected}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Usar este advertiser
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border p-3 text-sm">
              TikTok autorizado, mas a lista de advertisers ainda não foi retornada. Atualize o
              status; conexões legadas continuam disponíveis quando aplicável.
            </div>
            <Button variant="outline" onClick={() => void refresh()} disabled={busy}>
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar status
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
