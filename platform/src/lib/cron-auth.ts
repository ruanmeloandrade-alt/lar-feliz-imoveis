/**
 * Autenticação dos endpoints de cron (`/api/public/hooks/*-tick`).
 *
 * Fase 6 do plano de tracking: os ticks deixam de aceitar a chave pública do
 * banco como se fosse segredo. O pg_cron passa a enviar o header
 * `x-cron-secret` com o valor de CRON_SECRET (segredo do servidor).
 *
 * Compatibilidade: enquanto algum job antigo ainda não foi atualizado, a chave
 * publicável continua aceita — mas só se CRON_SECRET não estiver configurado.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const provided =
    request.headers.get("x-cron-secret") ?? request.headers.get("X-Cron-Secret") ?? "";

  if (secret) {
    if (provided && timingSafeEqual(provided, secret)) return true;
    // Fallback de transição: chave publicável ainda funciona por 1 janela de deploy.
    const legacy = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
    const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key") ?? "";
    return Boolean(legacy) && timingSafeEqual(apikey, legacy);
  }

  const legacy = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key") ?? "";
  return Boolean(legacy) && timingSafeEqual(apikey, legacy);
}

export function cronUnauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
