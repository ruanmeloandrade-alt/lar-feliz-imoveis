/**
 * Group Inbox conversations without a metadata row use:
 * "<whatsapp session UUID>|<group JID>". Parsing the exact key prevents
 * accidentally viewing or sending through another connected session.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_JID=/^[^|\/\\\s]{3,160}@g\.us$/i;

export function parseSlimInboxGroupConversationKey(
  key: string, groupJidHint?: string,
): { sessionId: string; groupJid: string } | null {
  const separator=key.indexOf('|');
  if(separator<1)return null;
  const sessionId=key.slice(0,separator);
  const groupJid=key.slice(separator+1);
  if(!UUID.test(sessionId)||!GROUP_JID.test(groupJid))throw new Error('Conversa de grupo inválida.');
  if(groupJidHint && groupJidHint!==groupJid)throw new Error('A referência do grupo não corresponde à sessão.');
  return {sessionId,groupJid};
}
