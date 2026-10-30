/** Validation only. Does not grant access, create an identity, or modify database policies. */
export function assertSettingsRow(result: { data?: unknown; error?: unknown }, action: string): { id: string } {
  if (result.error) throw new Error(`Não foi possível ${action}. A gravação não foi confirmada.`);
  const row = result.data as { id?: unknown } | null;
  if (!row || typeof row.id !== 'string' || !row.id) {
    throw new Error(`Nenhum registro foi alterado ao ${action}. Atualize a tela e confira sua permissão.`);
  }
  return { id: row.id };
}
export function validateSlimBusinessHours(value: unknown) {
  const cfg = value as { timezone?: unknown; days?: unknown } | null;
  if (!cfg || typeof cfg.timezone !== 'string' || !cfg.timezone.trim()) throw new Error('Informe um fuso horário válido.');
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: cfg.timezone }).format(0); }
  catch { throw new Error('Fuso horário inválido. Selecione uma opção disponível.'); }
  if (!Array.isArray(cfg.days) || cfg.days.length !== 7) throw new Error('O expediente precisa conter os sete dias da semana.');
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const days = cfg.days.map((day: any, i: number) => {
    if (!day || typeof day.enabled !== 'boolean' || !clock.test(String(day.start)) || !clock.test(String(day.end))) {
      throw new Error(`Horário inválido no dia ${i + 1}. Use HH:MM entre 00:00 e 23:59.`);
    }
    // Overnight ranges remain accepted; do not invent new scheduling semantics here.
    return { enabled: day.enabled, start: String(day.start), end: String(day.end) };
  });
  return { timezone: cfg.timezone, days };
}
export const SLIM_SECURITY_FLAGS = [
  'require_team_2fa', 'confirm_bulk_export', 'device_approval', 'block_leaked_passwords',
  'ip_allowlist_enabled', 'ip_allowlist_desktop_only', 'turnstile_enabled', 'login_alerts',
] as const;
export function parseSlimSecuritySnapshot(input: unknown) {
  const v = input as Record<string, any> | null;
  if (!v || !v.settings || typeof v.settings !== 'object' || Array.isArray(v.settings) || typeof v.isAdmin !== 'boolean') {
    throw new Error('Não foi possível confirmar as configurações de segurança.');
  }
  for (const key of SLIM_SECURITY_FLAGS) if (typeof v.settings[key] !== 'boolean') {
    throw new Error('Resposta incompleta das configurações de segurança.');
  }
  if (!Array.isArray(v.settings.allowed_ips) || v.settings.allowed_ips.some((ip: unknown) => typeof ip !== 'string')) {
    throw new Error('A lista de IPs retornada é inválida.');
  }
  return { settings: v.settings as Record<string, any>, isAdmin: v.isAdmin, currentIp: typeof v.currentIp === 'string' ? v.currentIp : null };
}
export function assertSecuritySaveAllowed(state: string, isAdmin: boolean, saving: boolean) {
  if (state !== 'ready') throw new Error('As configurações de segurança não foram carregadas. Nenhuma alteração foi enviada.');
  if (!isAdmin) throw new Error('Somente administradores podem alterar a segurança da empresa.');
  if (saving) throw new Error('Uma alteração de segurança já está sendo salva.');
}
export function validateEmployeeSetup(input: { sector_id?: string | null; sector_name?: string | null }) {
  if (!input.sector_id && (input.sector_name ?? '').trim().length < 2) {
    throw new Error('Defina um setor de trabalho antes de criar o funcionário.');
  }
}
