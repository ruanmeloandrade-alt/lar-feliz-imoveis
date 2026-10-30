export const LOGIN_EMAIL_MAX_LENGTH = 200;

export function normalizeLoginEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function sameLoginEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeLoginEmail(a ?? "") === normalizeLoginEmail(b ?? "");
}

export function emailChangeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");

  if (/already|registered|exists|duplicate|unique/i.test(raw)) {
    return "Este e-mail já está em uso por outra conta.";
  }

  if (/invalid.*email|email.*invalid/i.test(raw)) {
    return "Informe um e-mail válido.";
  }

  if (/rate limit|too many/i.test(raw)) {
    return "Muitas tentativas em sequência. Tente novamente em instantes.";
  }

  return raw || "Não foi possível alterar o e-mail de acesso.";
}
