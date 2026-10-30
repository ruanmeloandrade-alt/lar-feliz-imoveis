import type { ReactNode } from "react";
import { CircleDollarSign, Info, LockKeyhole, PlugZap, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import type { Integration } from "@/lib/integrations-catalog";
import { cn } from "@/lib/utils";

interface Props {
  integration: Integration | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const PRICING: Record<string, string> = {
  openai: "Cobrado pela OpenAI conforme consumo da API.",
  gemini: "Possui camada gratuita e cobrança do Google quando o uso excede a franquia aplicável.",
  ideogram: "Cobrado pelo Ideogram por geração/créditos, conforme o plano da conta conectada.",
  recraft: "Cobrado pelo Recraft conforme créditos e modelo utilizado.",
  freepik: "Cobrado pelo Freepik conforme créditos/plano de API da conta conectada.",
  twilio: "Cobrança do Twilio por número, mensagem ou minuto, conforme país e produto.",
  "amazon-ses": "Cobrança da AWS conforme volume de e-mails e recursos utilizados.",
  docusign: "Exige conta/plano DocuSign compatível; a cobrança é feita pelo provedor.",
  clicksign: "Exige conta/plano Clicksign compatível; a cobrança é feita pelo provedor.",
  zapsign: "Exige conta/plano ZapSign compatível; a cobrança é feita pelo provedor.",
  shopify: "A Vanessa Simoni não cobra pela conexão; custos da loja e do plano Shopify continuam no provedor.",
  meta: "A conexão não tem tarifa da Vanessa Simoni; mídia paga e tarifas dos produtos Meta são cobradas pela Meta quando aplicável.",
  tiktok: "A conexão não tem tarifa da Vanessa Simoni; investimento em mídia e eventuais custos do provedor ficam no TikTok.",
  "whatsapp-cloud": "A Vanessa Simoni não cobra pela conexão; conversas/mensagens podem ter tarifas da Meta conforme a política vigente.",
};

function pricingFor(integration: Integration) {
  return PRICING[integration.id]
    ?? "Sem custo adicional da Vanessa Simoni para conectar. Se o provedor exigir plano, licença ou consumo, a cobrança é feita diretamente por ele.";
}

export function ConnectorDialog({ integration, open, onOpenChange }: Props) {
  if (!integration) return null;

  const unavailable = integration.status === "em_preparacao";
  const requiredFields = integration.fields.filter((field) => field.kind !== "oauth");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 z-10 border-b border-border bg-background px-5 py-4">
          <div className="flex items-start gap-3 pr-8">
            <IntegrationLogo integration={integration} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-base font-semibold">{integration.name}</DialogTitle>
                <StatusBadge status={integration.status} />
              </div>
              <DialogDescription className="mt-1 text-xs leading-5">
                {integration.shortDesc}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 p-5">
          {unavailable ? (
            <div className="flex gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Conexão ainda não liberada neste ambiente</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Esta integração depende de configuração técnica da plataforma. Nenhum campo ou botão de conexão é exibido até existir um fluxo real.
                </p>
              </div>
            </div>
          ) : null}

          <section className="grid gap-3 md:grid-cols-3">
            <CompactInfo icon={<PlugZap className="h-4 w-4" />} label="Conectar" value={integration.configSummary} />
            <CompactInfo icon={<ShieldCheck className="h-4 w-4" />} label="Requisitos" value={integration.requirements} />
            <CompactInfo icon={<CircleDollarSign className="h-4 w-4" />} label="Custo" value={pricingFor(integration)} />
          </section>

          <section className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">Como funciona</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{integration.whatItDoes}</p>
            </div>
            <div className="px-4 py-3 text-xs leading-5 text-muted-foreground">
              {integration.longDesc}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold">Antes de conectar</h3>
              <ul className="mt-3 space-y-2">
                {integration.checklist.map((item) => (
                  <li key={item} className="flex gap-2 text-xs leading-5 text-muted-foreground">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold">Passo a passo</h3>
              <ol className="mt-3 space-y-2">
                {integration.executionSteps.map((item, index) => (
                  <li key={item} className="flex gap-2.5 text-xs leading-5 text-muted-foreground">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-foreground">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Próximo passo</h3>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{integration.nextStep}</p>
              </div>
              <Badge variant={unavailable ? "secondary" : "outline"} className="shrink-0">
                {unavailable ? "Aguardando plataforma" : "Painel operacional pendente"}
              </Badge>
            </div>
          </section>

          {requiredFields.length > 0 && !unavailable ? (
            <section className="rounded-lg border border-dashed border-border p-4">
              <h3 className="text-sm font-semibold">Dados previstos para a conexão</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Este item ainda não possui painel próprio ligado ao backend. Por segurança, a Vanessa Simoni não simula salvamento nem coleta credenciais nesta tela.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {requiredFields.map((field) => (
                  <Badge key={field.key} variant="outline" className="font-normal">{field.label}</Badge>
                ))}
              </div>
            </section>
          ) : null}

          <div className="flex justify-end border-t border-border pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationLogo({ integration }: { integration: Integration }) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border text-[11px] font-bold",
        integration.logoUrl ? "bg-white" : integration.brandColor,
      )}
    >
      {integration.logoUrl ? (
        <img src={integration.logoUrl} alt="" className="h-6 w-6 object-contain" loading="lazy" />
      ) : integration.brand}
    </div>
  );
}

function CompactInfo({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-xs leading-5 text-foreground">{value}</p>
    </div>
  );
}
