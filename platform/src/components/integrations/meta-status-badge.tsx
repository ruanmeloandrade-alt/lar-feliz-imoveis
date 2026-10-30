import { AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Props = {
  status: string | null | undefined;
  daysToExpire?: number | null;
  lastError?: string | null;
};

export function MetaStatusBadge({ status, daysToExpire, lastError }: Props) {
  if (!status) return null;

  if (status === "needs_reconnect" || status === "revoked" || status === "expired") {
    return (
      <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
        <div className="flex items-center gap-2 font-medium">
          <XCircle className="h-4 w-4" />
          {status === "revoked" ? "Acesso Meta revogado" : "Reconecte sua conta Meta"}
        </div>
        {lastError ? <p className="mt-1 text-xs text-red-200/80">{lastError}</p> : null}
        <Link
          to="/integracoes"
          className="mt-2 inline-block rounded bg-red-500/30 px-3 py-1 text-xs font-medium text-white hover:bg-red-500/50"
        >
          Reconectar agora
        </Link>
      </div>
    );
  }

  if (status === "connected" && typeof daysToExpire === "number" && daysToExpire <= 7 && daysToExpire >= 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-100">
        <Clock className="h-3.5 w-3.5" />
        Token Meta expira em {daysToExpire} dia{daysToExpire === 1 ? "" : "s"}, renovação automática programada.
      </div>
    );
  }

  if (status === "connected") {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Meta conectada
        {typeof daysToExpire === "number" ? ` · ${daysToExpire}d restantes` : ""}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <AlertTriangle className="h-3.5 w-3.5" />
      Status Meta: {status}
    </div>
  );
}
