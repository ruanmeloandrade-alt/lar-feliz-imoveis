import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
const ORDER=z.object({workspaceId:z.string().uuid(),orderId:z.string().uuid()}).strict();
const INTENT=ORDER.extend({sessionId:z.string().uuid(),requestId:z.string().uuid(),expectedSha256:z.string().regex(/^[a-f0-9]{64}$/),expectedPhone:z.string().regex(/^\+[1-9]\d{7,14}$/),approved:z.literal(true)}).strict();
export const prepareSlimReceiptDispatch=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>ORDER.parse(v)).handler(async({data,context})=>{
 const {prepareReceiptDispatch}=await import('./slim-receipt-dispatch.server');return prepareReceiptDispatch(context,data);
});
export const approveSlimReceiptDispatch=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>INTENT.parse(v)).handler(async({data,context})=>{
 const {sendReceiptDispatch}=await import('./slim-receipt-dispatch.server');return sendReceiptDispatch(context,data);
});
export const lookupSlimReceiptDispatch=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>ORDER.extend({requestId:z.string().uuid()}).strict().parse(v)).handler(async({data,context})=>{
 const {lookupReceiptDispatch}=await import('./slim-receipt-dispatch.server');return lookupReceiptDispatch(context,data);
});
