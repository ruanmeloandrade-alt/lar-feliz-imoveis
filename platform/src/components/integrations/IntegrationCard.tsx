import { useState } from "react";
import { ArrowRight, LockKeyhole, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { AdminOnlyTag } from "@/components/AdminOnlyDot";
import type { Integration } from "@/lib/integrations-catalog";
import { cn } from "@/lib/utils";

interface Props {
  integration: Integration;
  onOpen: () => void;
  adminOnly?: boolean;
}

export function IntegrationCard({ integration, onOpen, adminOnly }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = integration.logoUrl && !imgFailed;
  const unavailable = integration.status === "em_preparacao";
  const technical = integration.technicalStatus?.find((item) => item.label.toLowerCase() !== "status")
    ?? integration.technicalStatus?.[0];
  const connectionSummary = integration.id === "conta-google"
    ? "OAuth Google · inclui Business Profile"
    : integration.configSummary;

  return (
    <article className="group flex min-h-[148px] flex-col rounded-lg border border-border bg-card transition-colors hover:border-foreground/20">
      <div className="flex min-w-0 flex-1 gap-3 p-3.5">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border text-[11px] font-bold",
            showImg ? "bg-white" : integration.brandColor,
          )}
        >
          {showImg ? (
            <img
              src={integration.logoUrl}
              alt={`${integration.name} logo`}
              className="h-6 w-6 object-contain"
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span>{integration.brand}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold leading-5">{integration.name}</h3>
              <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {integration.categoryLabel}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {adminOnly && <AdminOnlyTag />}
              <StatusBadge status={integration.status} />
            </div>
          </div>

          <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {integration.shortDesc}
          </p>

          <div className="mt-2.5 flex min-w-0 items-center gap-2 border-t border-border pt-2.5 text-[10px]">
            <PlugZap className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate text-muted-foreground">{connectionSummary}</span>
            {technical ? (
              <>
                <span className="text-border">•</span>
                <span className="ml-auto max-w-[38%] truncate font-medium text-foreground">{technical.value}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/10 px-3.5 py-1.5">
        {unavailable ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
            <LockKeyhole className="h-3 w-3 shrink-0" />
            <span className="truncate">Depende de configuração da plataforma</span>
          </div>
        ) : (
          <span className="truncate text-[10px] text-muted-foreground">
            {integration.id === "conta-google" ? "Google Meu Negócio · Ads · Analytics · Workspace" : integration.dataIn.slice(0, 2).join(" · ") || "Conexão disponível"}
          </span>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs"
          onClick={onOpen}
          disabled={unavailable}
        >
          {integration.status === "conectado" ? "Gerenciar" : unavailable ? "Indisponível" : "Conectar"}
          {!unavailable && <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />}
        </Button>
      </div>
    </article>
  );
}
