import { type ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { usePermissions } from "@/hooks/use-permissions";

interface Props {
  moduleId: string;
  children: ReactNode;
  /** Se true, apenas oculta silenciosamente ao invés de redirecionar. */
  silent?: boolean;
}

/**
 * Bloqueia a renderização do conteúdo quando o usuário não tem o módulo
 * habilitado na matriz de permissões. Redireciona para /sem-acesso por padrão.
 */
export function PermissionGate({ moduleId, children, silent }: Props) {
  const perms = usePermissions();
  if (perms.loading) return null;
  if (!perms.moduleEnabled(moduleId)) {
    if (silent) return null;
    return <Navigate to="/sem-acesso" />;
  }
  return <>{children}</>;
}
