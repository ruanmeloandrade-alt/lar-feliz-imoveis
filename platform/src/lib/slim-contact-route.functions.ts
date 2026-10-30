import {createServerFn} from '@tanstack/react-start';import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {attachSupabaseAuth} from '@/integrations/supabase/auth-attacher';
import {resolveSlimContactId,createSlimCanonicalContact} from './slim-contact-identity.core';
async function active(db:any,actorId:string){const profile=await db.from('profiles').select('current_workspace_id').eq('id',actorId).maybeSingle();if(profile.error||!profile.data?.current_workspace_id)throw new Error('Empresa ativa não identificada.');return String(profile.data.current_workspace_id);}
export const resolveSlimInboxContact=createServerFn({method:'POST'}).middleware([attachSupabaseAuth,requireSupabaseAuth]).inputValidator((v:unknown)=>z.object({leadId:z.string().uuid()}).parse(v)).handler(async({data,context})=>{const db=context.supabase as any,workspaceId=await active(db,context.userId);const existing=await db.from('leads').select('id').eq('workspace_id',workspaceId).eq('id',data.leadId).maybeSingle();
 if(existing.error)throw new Error('Não foi possível consultar o contato.');
 if(!existing.data){const group=await db.from('whatsapp_groups').select('id').eq('workspace_id',workspaceId).eq('id',data.leadId).maybeSingle();if(!group.error&&group.data)return {workspaceId,actorId:context.userId,leadId:data.leadId};throw new Error('Conversa não encontrada nesta empresa.');}
 return {workspaceId,actorId:context.userId,leadId:await resolveSlimContactId(db,workspaceId,data.leadId)};});
const Contact=z.object({workspaceId:z.string().uuid(),payload:z.object({crm_source_id:z.string().uuid(),pipeline_id:z.string().uuid(),stage_id:z.string().uuid(),name:z.string().trim().min(1).max(200),phone:z.string().max(40).nullable().optional(),email:z.string().max(254).nullable().optional(),value:z.number().finite().nonnegative().default(0),source:z.literal('cadastro_manual_saude_slim'),custom_data:z.object({endereco:z.string().max(1000).optional()}).optional()})});
export const createSlimUiContact=createServerFn({method:'POST'}).middleware([attachSupabaseAuth,requireSupabaseAuth]).inputValidator((v:unknown)=>Contact.parse(v)).handler(async({data,context})=>{
 const db=context.supabase as any,ws=await active(db,context.userId);if(ws!==data.workspaceId)throw new Error('A empresa ativa mudou. Atualize a página.');
 const {assertSlimOperator}=await import('./slim-workspace-operator.server');await assertSlimOperator(db,ws,context.userId);
 const [source,stage]=await Promise.all([db.from('crm_sources').select('id').eq('id',data.payload.crm_source_id).eq('workspace_id',ws).maybeSingle(),db.from('pipeline_stages').select('id').eq('id',data.payload.stage_id).eq('pipeline_id',data.payload.pipeline_id).eq('workspace_id',ws).maybeSingle()]);
 if(source.error||stage.error||!source.data||!stage.data)throw new Error('Origem ou etapa indisponível para a empresa.');
 return createSlimCanonicalContact(db,ws,data.payload);
});

// SLIM_CONTACT_IDENTITY_COMPAT_V1
