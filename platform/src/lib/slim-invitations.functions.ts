import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {attachSupabaseAuth} from '@/integrations/supabase/auth-attacher';
import {resolvePublicAppUrl} from '@/integrations/supabase/saude-slim-env';
import {normalizeSlimInvitationEmail,slimInvitationAttempt,slimInvitationIdentity,validateSlimInvitationAcceptance,validateSlimInvitationContext,validateSlimInvitationLink,validateSlimInvitationPreview,validateSlimInvitationReceipt} from '@/lib/slim-invitations.core';
import {readSlimInvitations,requireSlimInvitationOwner,slimInvitationRpc,withSlimInvitationRequest,type SlimInvitationDatabase} from '@/lib/slim-invitations.server';

const uuid=z.string().uuid().transform(s=>s.toLowerCase());
const scope={workspaceId:uuid,actorId:uuid};
const request={...scope,requestId:uuid,expectedFingerprint:z.string().regex(/^[a-f0-9]{32,128}$/),approved:z.literal(true)};
const email=z.string().trim().email().max(200).transform(normalizeSlimInvitationEmail);
const ContextSchema=z.discriminatedUnion('action',[
 z.object({...scope,action:z.literal('create'),email,invitationId:z.null().optional()}).strict(),
 z.object({...scope,action:z.literal('renew'),invitationId:uuid}).strict(),
 z.object({...scope,action:z.literal('revoke'),invitationId:uuid}).strict(),
]);
const ChangeSchema=z.discriminatedUnion('action',[
 z.object({...request,action:z.literal('create'),payload:z.object({email,accessRole:z.literal('admin'),accessDays:z.null()}).strict()}).strict(),
 z.object({...request,action:z.literal('renew'),payload:z.object({invitationId:uuid}).strict()}).strict(),
 z.object({...request,action:z.literal('revoke'),payload:z.object({invitationId:uuid}).strict()}).strict(),
]);
const LookupSchema=z.discriminatedUnion('action',[
 z.object({...scope,requestId:uuid,action:z.literal('create'),invitationId:z.null(),approved:z.literal(true)}).strict(),
 z.object({...scope,requestId:uuid,action:z.literal('renew'),invitationId:uuid,approved:z.literal(true)}).strict(),
 z.object({...scope,requestId:uuid,action:z.literal('revoke'),invitationId:uuid,approved:z.literal(true)}).strict(),
]);
const LinkSchema=z.object({...scope,invitationId:uuid}).strict();
const AcceptSchema=z.discriminatedUnion('mode',[
 z.object({...scope,token:uuid,invitationId:uuid,mode:z.literal('accept'),approved:z.literal(true)}).strict(),
 z.object({...scope,token:uuid,invitationId:uuid,mode:z.literal('lookup'),approved:z.literal(false).optional()}).strict(),
]);
const authenticated=[attachSupabaseAuth,requireSupabaseAuth];

export const listSlimInvitations=createServerFn({method:'POST'}).middleware(authenticated).inputValidator((d:unknown)=>z.object(scope).strict().parse(d)).handler(async({data,context})=>withSlimInvitationRequest(async signal=>{
 const sb=context.supabase as unknown as SlimInvitationDatabase,identity=await requireSlimInvitationOwner(sb,context.userId,data,signal);
 return {version:1 as const,...identity,invitations:await readSlimInvitations(sb,identity.workspaceId,signal)};
}));

export const getSlimInvitationContext=createServerFn({method:'POST'}).middleware(authenticated).inputValidator((d:unknown)=>ContextSchema.parse(d)).handler(async({data,context})=>withSlimInvitationRequest(async signal=>{
 const sb=context.supabase as unknown as SlimInvitationDatabase,identity=await requireSlimInvitationOwner(sb,context.userId,data,signal);
 const result=await slimInvitationRpc(sb,'slim_invitation_context',{p_workspace_id:identity.workspaceId,p_actor_id:identity.actorId,p_action:data.action,p_email:data.action==='create'?data.email:null,p_invitation_id:data.action==='create'?null:data.invitationId},signal);
 return validateSlimInvitationContext(result,data);
}));

export const changeSlimInvitation=createServerFn({method:'POST'}).middleware(authenticated).inputValidator((d:unknown)=>ChangeSchema.parse(d)).handler(async({data,context})=>withSlimInvitationRequest(async signal=>{
 const sb=context.supabase as unknown as SlimInvitationDatabase,identity=await requireSlimInvitationOwner(sb,context.userId,data,signal);
 const expected=slimInvitationAttempt({...identity,requestId:data.requestId,action:data.action,invitationId:data.action==='create'?null:data.payload.invitationId});
 const result=await slimInvitationRpc(sb,'slim_invitation_change',{p_workspace_id:identity.workspaceId,p_actor_id:identity.actorId,p_request_id:data.requestId,p_action:data.action,p_payload:data.payload,p_expected_fingerprint:data.expectedFingerprint,p_approved:true},signal,true);
 return validateSlimInvitationReceipt(result,expected);
}));

export const lookupSlimInvitationChange=createServerFn({method:'POST'}).middleware(authenticated).inputValidator((d:unknown)=>LookupSchema.parse(d)).handler(async({data,context})=>withSlimInvitationRequest(async signal=>{
 const sb=context.supabase as unknown as SlimInvitationDatabase,identity=await requireSlimInvitationOwner(sb,context.userId,data,signal);
 const result=await slimInvitationRpc(sb,'slim_invitation_change_lookup',{p_workspace_id:identity.workspaceId,p_actor_id:identity.actorId,p_request_id:data.requestId,p_action:data.action,p_invitation_id:data.invitationId},signal,true);
 return validateSlimInvitationReceipt(result,data);
}));

export const getSlimInvitationLink=createServerFn({method:'POST'}).middleware(authenticated).inputValidator((d:unknown)=>LinkSchema.parse(d)).handler(async({data,context})=>withSlimInvitationRequest(async signal=>{
 const sb=context.supabase as unknown as SlimInvitationDatabase,identity=await requireSlimInvitationOwner(sb,context.userId,data,signal);
 const result=await slimInvitationRpc(sb,'slim_invitation_link',{p_workspace_id:identity.workspaceId,p_actor_id:identity.actorId,p_invitation_id:data.invitationId},signal);
 const link=validateSlimInvitationLink(result,data),origin=new URL(resolvePublicAppUrl());
 if((origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('O endereço público da Vanessa Simoni não está configurado corretamente.');
 return {...link,inviteUrl:new URL(`/convite/${link.token}`,origin.origin).href};
}));

export const previewSlimInvitation=createServerFn({method:'POST'}).inputValidator((d:unknown)=>z.object({token:uuid}).strict().parse(d)).handler(async({data})=>withSlimInvitationRequest(async signal=>{
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const result=await slimInvitationRpc(supabaseAdmin as unknown as SlimInvitationDatabase,'slim_invitation_preview',{p_token:data.token},signal);
 return validateSlimInvitationPreview(result);
}));

export const acceptSlimInvitation=createServerFn({method:'POST'}).middleware(authenticated).inputValidator((d:unknown)=>AcceptSchema.parse(d)).handler(async({data,context})=>withSlimInvitationRequest(async signal=>{
 const identity=slimInvitationIdentity(data);
 if(context.userId!==identity.actorId)throw new Error('O usuário mudou. Entre novamente para conferir o convite.');
 // Deliberately no active-workspace resolver: only explicit SQL accept may select the invited company.
 const result=await slimInvitationRpc(context.supabase as unknown as SlimInvitationDatabase,'slim_invitation_accept',{p_token:data.token,p_actor_id:identity.actorId,p_approved:data.mode==='accept',p_mode:data.mode},signal,data.mode==='accept');
 return validateSlimInvitationAcceptance(result,data);
}));
