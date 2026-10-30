export type AutomationRunSemanticCode =
  | "success"
  | "condition_not_met"
  | "action_not_needed"
  | "no_data"
  | "no_target"
  | "delivery_unverified"
  | "unsupported_action"
  | "permission_error"
  | "auth_error"
  | "provider_error"
  | "internal_error";

export type AutomationRunLike = {
  matched?: boolean | null;
  action_status?: string | null;
  status?: string | null;
  action_taken?: string | null;
  error_message?: string | null;
  error?: string | null;
};

export type AutomationRunSemantic = {
  code: AutomationRunSemanticCode;
  label: string;
  detail: string;
  severity: "success" | "neutral" | "warning" | "error";
  executed: boolean;
  failed: boolean;
};

function textOf(run: AutomationRunLike) {
  const status = String(run.action_status ?? run.status ?? "").toLowerCase();
  const action = String(run.action_taken ?? "").trim();
  const error = String(run.error_message ?? run.error ?? "").trim();
  return { status, action, error, haystack: `${status} ${action} ${error}`.toLowerCase() };
}

function isOnlyIgnoredActions(action: string) {
  if (!action) return false;
  return action
    .split(" + ")
    .map((part) => part.trim())
    .filter(Boolean)
    .every((part) => part.includes("ignorada:") || part.includes("ignored:"));
}

function hasZeroTargets(action: string) {
  if (!action) return false;
  return action
    .split(" + ")
    .map((part) => part.trim())
    .some((part) => /^(pause|activate|duplicate)_(adset|ad):0$/i.test(part));
}

export function classifyAutomationRun(run: AutomationRunLike): AutomationRunSemantic {
  const { status, action, error, haystack } = textOf(run);
  const matched = Boolean(run.matched);

  if (haystack.includes("scan_interval") || haystack.includes("cooldown")) {
    return {
      code: "action_not_needed",
      label: "Ação não necessária agora",
      detail: "A regra foi lida, mas ainda está dentro do intervalo/cooldown configurado.",
      severity: "neutral",
      executed: false,
      failed: false,
    };
  }

  if (haystack.includes("no_insights")) {
    return {
      code: "no_data",
      label: "Sem dados suficientes",
      detail: "O provedor não devolveu insights para avaliar a regra neste alvo/período.",
      severity: "neutral",
      executed: false,
      failed: false,
    };
  }

  if (!matched && status !== "error" && !error) {
    return {
      code: "condition_not_met",
      label: "Condição não atingida",
      detail: "A leitura foi concluída e a condição configurada não foi satisfeita.",
      severity: "neutral",
      executed: false,
      failed: false,
    };
  }

  if (action === "unsupported" || haystack.includes("unsupported_action") || haystack.includes("ação não suportada") || haystack.includes("acao nao suportada")) {
    return {
      code: "unsupported_action",
      label: "Ação não suportada",
      detail: "A ação chegou ao executor sem implementação segura correspondente. Ela não deve ser contabilizada como sucesso.",
      severity: "error",
      executed: false,
      failed: true,
    };
  }

  if (hasZeroTargets(action)) {
    return {
      code: "no_target",
      label: "Nenhum alvo afetado",
      detail: "A condição foi atingida, mas nenhum conjunto/anúncio elegível foi encontrado para executar a ação.",
      severity: "warning",
      executed: false,
      failed: false,
    };
  }

  if (isOnlyIgnoredActions(action)) {
    return {
      code: "action_not_needed",
      label: "Ação não necessária",
      detail: "O gatilho principal bateu, mas as condições específicas das ações não foram atendidas.",
      severity: "neutral",
      executed: false,
      failed: false,
    };
  }

  const authError =
    /\b401\b/.test(haystack)
    || haystack.includes("access token")
    || haystack.includes("oauth")
    || haystack.includes("token expir")
    || haystack.includes("token ausente")
    || haystack.includes("meta não conectada")
    || haystack.includes("meta nao conectada")
    || haystack.includes("error validating access token")
    || haystack.includes("(#190)");
  if (authError) {
    return {
      code: "auth_error",
      label: "Autenticação da integração falhou",
      detail: error || "A credencial/token do provedor não está válido ou disponível para esta execução.",
      severity: "error",
      executed: false,
      failed: true,
    };
  }

  const permissionError =
    /\b403\b/.test(haystack)
    || haystack.includes("forbidden")
    || haystack.includes("permission")
    || haystack.includes("permissão")
    || haystack.includes("permissao")
    || haystack.includes("(#200)")
    || haystack.includes("not authorized")
    || haystack.includes("does not have permission");
  if (permissionError) {
    return {
      code: "permission_error",
      label: "Provedor bloqueou por permissão",
      detail: error || "A integração está conectada, mas a conta/token não possui permissão suficiente para esta operação.",
      severity: "error",
      executed: false,
      failed: true,
    };
  }

  const internalError =
    haystack.includes("integration_encryption_key")
    || haystack.includes("sem acesso ao workspace")
    || haystack.includes("regra não encontrada")
    || haystack.includes("regra nao encontrada")
    || haystack.includes("workspace sem membros")
    || haystack.includes("pipeline não")
    || haystack.includes("pipeline nao");
  if (status === "error" && internalError) {
    return {
      code: "internal_error",
      label: "Erro interno/configuração da Vanessa Simoni",
      detail: error || "A execução falhou antes de concluir a operação no provedor.",
      severity: "error",
      executed: false,
      failed: true,
    };
  }

  if (status === "error" || error) {
    return {
      code: "provider_error",
      label: "Erro na execução",
      detail: error || "O provedor rejeitou ou não concluiu a operação solicitada.",
      severity: "error",
      executed: false,
      failed: true,
    };
  }

  if (action === "notified") {
    return {
      code: "delivery_unverified",
      label: "Notificação solicitada — entrega não comprovada",
      detail: "O executor legado registrou a solicitação, mas não confirma a persistência/entrega da notificação. Por segurança, este run não entra como ação executada com sucesso.",
      severity: "warning",
      executed: false,
      failed: false,
    };
  }

  if (matched && action) {
    return {
      code: "success",
      label: "Ação executada",
      detail: action,
      severity: "success",
      executed: true,
      failed: false,
    };
  }

  return {
    code: "action_not_needed",
    label: "Nenhuma ação executada",
    detail: "A leitura terminou sem uma operação efetivamente executada.",
    severity: "neutral",
    executed: false,
    failed: false,
  };
}

export function normalizeAutomationRun<T extends AutomationRunLike>(run: T) {
  return { ...run, semantic: classifyAutomationRun(run) };
}
