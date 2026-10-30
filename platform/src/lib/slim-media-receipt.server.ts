import {supabaseAdmin} from '@/integrations/supabase/client.server';
import {assertSlimOperator} from './slim-workspace-operator.server';
import {insertAcknowledgedMedia,validateMediaReceipt,type AcknowledgedMedia} from './slim-media-receipt.core';
/** Called only AFTER the authenticated send handler receives the provider's message ID. */
export async function persistAcknowledgedMedia(userDb:any,receipt:AcknowledgedMedia){
 validateMediaReceipt(receipt);
 await assertSlimOperator(userDb,receipt.workspaceId,receipt.actorId);
 const [lead,session]=await Promise.all([
  userDb.from('leads').select('id').eq('workspace_id',receipt.workspaceId).eq('id',receipt.leadId).maybeSingle(),
  userDb.from('whatsapp_web_sessions').select('id').eq('workspace_id',receipt.workspaceId).eq('id',receipt.sessionId).maybeSingle(),
 ]);
 if(lead.error||session.error||!lead.data||!session.data)throw new Error('Não foi possível confirmar a empresa e a conversa do envio.');
 // This table is server-owned; do not grant INSERT/UPDATE to browsers or replace the authenticated client globally.
 return insertAcknowledgedMedia(supabaseAdmin as any,receipt);
}
