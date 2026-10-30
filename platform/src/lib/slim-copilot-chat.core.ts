type TextPart = {type: 'text'; text: string};
type FilePart = {type: 'file'; url: string; mediaType: string; filename?: string};
export type SlimCopilotMessage = {id: string; role: 'user' | 'assistant'; parts: Array<TextPart | FilePart>};

/** Client tool outputs/approval parts never become trusted execution or approval inputs. */
export function sanitizeSlimCopilotMessages(value: unknown): SlimCopilotMessage[] {
  if (!Array.isArray(value) || !value.length || value.length > 400) throw new Error('Conversa inválida. Reabra o Copiloto.');
  let textBytes = 0, imageBytes = 0, images = 0;
  const messages: SlimCopilotMessage[] = [];
  for (const row of value.slice(-80)) {
    if (!row || typeof row !== 'object' || !['user', 'assistant'].includes(row.role) || typeof row.id !== 'string' || !row.id || row.id.length > 160 || !Array.isArray(row.parts) || row.parts.length > 100) throw new Error('Mensagem inválida no Copiloto.');
    const parts: Array<TextPart | FilePart> = [];
    for (const p of row.parts) {
      if (p?.type === 'text') {
        if (typeof p.text !== 'string' || p.text.length > 20000) throw new Error('Mensagem muito longa. Resuma o pedido.');
        textBytes += p.text.length;
        if (textBytes > 120000) throw new Error('Histórico extenso demais. Reabra o Copiloto antes de continuar.');
        parts.push({type: 'text', text: p.text});
      } else if (p?.type === 'file' && row.role === 'user') {
        // Only inline images are forwarded. Remote URLs and arbitrary tool parts are not fetched.
        if (typeof p.url !== 'string' || typeof p.mediaType !== 'string' || !/^image\/(png|jpeg|webp)$/.test(p.mediaType) || !p.url.startsWith(`data:${p.mediaType};base64,`)) throw new Error('Use uma imagem PNG, JPEG ou WebP no Copiloto.');
        imageBytes += p.url.length; images++;
        if (images > 4 || imageBytes > 24 * 1024 * 1024) throw new Error('Muitos anexos na conversa. Envie até quatro imagens menores.');
        parts.push({type: 'file', url: p.url, mediaType: p.mediaType, ...(typeof p.filename === 'string' ? {filename: p.filename.slice(0, 250)} : {})});
      }
    }
    if (parts.length) messages.push({id: row.id, role: row.role, parts});
  }
  if (!messages.length || !messages.some(message => message.role === 'user')) throw new Error('Envie uma mensagem para o Copiloto.');
  return messages;
}
export function slimCopilotPageContext(value: unknown): string {
  const path = value && typeof value === 'object' ? (value as {page?: unknown}).page : null;
  return typeof path === 'string' && /^\/[\w/-]{0,180}$/.test(path) ? path : '(página não informada)';
}
