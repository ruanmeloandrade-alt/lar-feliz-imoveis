/** Validation shared by the source viewer/editor. No privileged client. */
export function normalizeBrainTerm(value: string) {
  const term = value.trim().toLocaleLowerCase('pt-BR');
  if (!term || term.length > 120) throw new Error('Use de 1 a 120 caracteres na palavra ou expressão.');
  return term;
}
export function validateBrainUrl(value: string) {
  const text = value.trim();
  let parsed: URL;
  try { parsed = new URL(text); } catch { throw new Error('Informe um endereço completo começando com https:// ou http://.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Use somente links http:// ou https://, sem credenciais no endereço.');
  }
  return text;
}
export function validateBrainFile(file: {name: string; size: number}) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!['pdf', 'docx', 'txt', 'md'].includes(extension)) throw new Error('Selecione PDF, DOCX, TXT ou Markdown.');
  if (file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error('O documento deve ter conteúdo e no máximo 20 MB.');
  return extension;
}
export function validateBrainTitle(value: string) {
  const title = value.trim();
  if (!title || title.length > 300) throw new Error('Informe um título de até 300 caracteres.');
  return title;
}
export function isWorkspaceBrainPath(path: string, workspaceId: string) {
  return path.startsWith(`${workspaceId}/`) && !path.includes('..') && !path.includes('\\');
}
export function requireEditedRow<T>(rows: T[] | null | undefined): T {
  if (rows?.length !== 1) throw new Error('O registro mudou ou não está disponível para edição. Atualize a lista e confira antes de salvar novamente.');
  return rows[0];
}
