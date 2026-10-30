export const INTEGRATION_VAULT_UNAVAILABLE_MESSAGE =
  "Cofre de integrações da Vanessa Simoni indisponível. A configuração segura do servidor precisa ser verificada.";

export function integrationVaultFailure(scope: string, detail?: unknown): Error {
  // Never log a provider response, plaintext credential, or encryption key.
  const value = detail && typeof detail === "object" && "code" in detail
    ? (detail as { code?: unknown }).code
    : undefined;
  const code = typeof value === "string" && /^(?:PGRST\d{3}|[0-9A-Z]{5})$/.test(value)
    ? value
    : "vault_error";
  console.error(`[integration-vault] ${scope}`, { code });
  return new Error(INTEGRATION_VAULT_UNAVAILABLE_MESSAGE);
}
