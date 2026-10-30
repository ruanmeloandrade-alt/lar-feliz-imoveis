import {readFileSync,readdirSync} from 'node:fs';

// Shared by the disposable PGlite and real PostgreSQL checks. Reuse the shipped
// financial, freight, document and Funnel contracts verbatim, not a substitute
// INSERT-only RPC. Every row below is synthetic and belongs to a local database.
const root=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
export const W='c49945db-1960-461a-9339-a43b8403bdd9';
export const OTHER='00000000-0000-4000-8000-000000000102';
export const owner='00000000-0000-4000-8000-000000000001';
export const operator='00000000-0000-4000-8000-000000000002';
export const outsider='00000000-0000-4000-8000-000000000005';
export const source='00000000-0000-4000-8000-000000000201';
export const pipeline='00000000-0000-4000-8000-000000000202';
export const stage='00000000-0000-4000-8000-000000000203';
export const product='00000000-0000-4000-8000-000000000301';
export const historical='00000000-0000-4000-8000-000000000401';
export const alias='00000000-0000-4000-8000-000000000402';
export const nullAlias='00000000-0000-4000-8000-000000000403';
export const historicalPhone='5511900000001';
export const literal=value=>value===null?'NULL':"'"+String(value).replaceAll("'","''")+"'";
export const actorSql=(id=owner)=>`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub',${literal(id)},true);`;
export function createSql(phone,request){
 return `SELECT public.slim_create_lead_and_emit('${W}','${source}','${pipeline}','${stage}','Synthetic Funnel contact',NULL,${literal(phone)},10,${literal(request)});`;
}
export function quote(phone,{customerId=null,shipping=327}={}){
 return {workspaceId:W,customer:customerId?{kind:'existing',id:customerId}:{kind:'new',name:'Synthetic checkout contact',email:'qa@example.invalid',phone},
  items:[{productId:product,quantity:2,unitPriceCents:950}],subtotalCents:1900,discountCents:101,totalCents:1799+shipping,
  payment:{method:'pix',status:'pending',installments:1},notes:'Synthetic order',shippingCents:shipping,
  fulfillment:{mode:'delivery',recipient:'Synthetic recipient',phone:'5511999999999',postalCode:'01001000',street:'Rua Sintética',number:'12',complement:'',neighborhood:'Centro',city:'São Paulo',state:'SP',notes:''}};
}
export const confirmSql=(phone,request,options)=>`SELECT public.slim_confirm_order('${W}',${literal(request)},${literal(JSON.stringify(quote(phone,options)))}::jsonb);`;
export const directSql=(phone,id,patch={})=>`INSERT INTO public.leads(id,workspace_id,name,phone,status,source,custom_data) VALUES(${literal(id)},${literal(patch.workspace??W)},'Synthetic direct contact',${literal(phone)},${literal(patch.status===undefined?'active':patch.status)},${literal(patch.source??'integration')},${literal(JSON.stringify(patch.custom??{}))}::jsonb);`;
export const guardMigration=()=>{
 const files=readdirSync(new URL('supabase/migrations/',root)).filter(name=>name.endsWith('_slim_contact_phone_guard.sql'));
 if(files.length!==1)throw new Error('Expected one CLI-generated contact phone guard migration.');
 return read('supabase/migrations/'+files[0]);
};
export const businessStateSql=`SELECT jsonb_build_object(
 'leads',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]') FROM public.leads l),
 'orders',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY id),'[]') FROM public.slim_orders o),
 'products',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM public.products p),
 'links',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]') FROM public.lead_products l),
 'movements',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id),'[]') FROM public.slim_stock_movements m),
 'events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]') FROM public.slim_stage_move_events e),
 'requests',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY request_id),'[]') FROM private.slim_funnel_write_requests r),
 'documents',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM public.slim_order_documents d),
 'deliveries',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM public.slim_order_document_deliveries d),
 'changes',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY id),'[]') FROM public.slim_order_changes c));`;
export const dependencyStateSql=`SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'body',p.prosrc,'definer',p.prosecdef,'acl',p.proacl::text,'config',p.proconfig) ORDER BY p.oid::regprocedure::text)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname IN ('slim_confirm_order','slim_cancel_order','slim_guard_caller_document','slim_create_lead_and_emit','slim_create_lead_and_emit_impl','slim_move_lead_and_emit','slim_move_lead_and_emit_impl','slim_bulk_move_leads_and_emit','slim_bulk_move_leads_and_emit_impl','slim_change_order','slim_lookup_order_change','slim_funnel_contact_phone_key');`;
export const permissionStateSql=`SELECT jsonb_agg(jsonb_build_object('table',c.relname,'acl',c.relacl::text,'rls',c.relrowsecurity,'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname=n.nspname AND p.tablename=c.relname)) ORDER BY c.relname)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';`;

export function setupSql({includeRoles=true}={}){
 const schema=read('scripts/fixtures/slim-legacy-isolated-schema.sql');
 return [
  includeRoles?schema:schema.replace(/^CREATE ROLE (authenticated|anon|service_role)( BYPASSRLS)?;\n/gm,''),
  `ALTER TABLE public.products ADD COLUMN promo_price numeric;
   CREATE TABLE public.slim_checkout_attempt_closures(workspace_id uuid,request_id uuid);
   CREATE TABLE public.crm_sources(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id));
   CREATE TABLE public.pipelines(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id),crm_source_id uuid REFERENCES public.crm_sources(id));
   CREATE TABLE public.pipeline_stages(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id),pipeline_id uuid NOT NULL REFERENCES public.pipelines(id));
   CREATE TABLE public.crm_source_funnels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),crm_source_id uuid NOT NULL REFERENCES public.crm_sources(id),pipeline_id uuid NOT NULL REFERENCES public.pipelines(id));
   ALTER TABLE public.leads ADD COLUMN crm_source_id uuid REFERENCES public.crm_sources(id),ADD COLUMN pipeline_id uuid REFERENCES public.pipelines(id),ADD COLUMN stage_id uuid REFERENCES public.pipeline_stages(id),ADD COLUMN company_id uuid,ADD COLUMN phone_normalized text,ADD COLUMN updated_at timestamptz DEFAULT clock_timestamp(),ADD COLUMN last_message_from text;
   ALTER TABLE public.leads ALTER COLUMN status DROP NOT NULL;`,
  read('supabase/migrations/20261015115919_slim_restore_audiences_fields_stage_automations.sql').split('CREATE TABLE public.crm_lead_audiences')[0],
  read('scripts/fixtures/slim-document-isolated-schema.sql'),
  ...['workspaces','workspace_members','leads','products','lead_products','slim_orders','slim_stock_movements','whatsapp_web_sessions','slim_order_documents','slim_order_document_deliveries'].map(table=>
   `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.${table} FROM PUBLIC,anon,authenticated; GRANT SELECT ON public.${table} TO authenticated;
    CREATE POLICY fixture_read ON public.${table} FOR SELECT TO authenticated USING(private.slim_workspace_access(${table==='workspaces'?'id':'workspace_id'})${table==='leads'?" AND custom_data->>'hidden' IS DISTINCT FROM 'true'":''});`),
  `GRANT INSERT,UPDATE ON public.leads TO authenticated;
   CREATE POLICY fixture_insert ON public.leads FOR INSERT TO authenticated WITH CHECK(private.slim_workspace_access(workspace_id,'operator'));
   CREATE POLICY fixture_update ON public.leads FOR UPDATE TO authenticated USING(private.slim_workspace_access(workspace_id,'operator')) WITH CHECK(private.slim_workspace_access(workspace_id,'operator'));`,
  read('supabase/migrations/20261016153000_slim_stage_move_outbox.sql'),
  read('supabase/migrations/20261017213710_slim_funnel_create_bulk_outbox.sql'),
  read('scripts/fixtures/slim-confirm-order-live-contract.sql'),
  read('scripts/fixtures/slim-legacy-cancel-contract.sql'),
  `CREATE FUNCTION public.slim_confirm_order(_workspace_id uuid,_request_id uuid,_quote jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT private.slim_confirm_order(_workspace_id,_request_id,_quote)';
   REVOKE ALL ON FUNCTION public.slim_confirm_order(uuid,uuid,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.slim_confirm_order(uuid,uuid,jsonb) TO authenticated;`,
  read('supabase/migrations/20261018001819_slim_checkout_delivery_freight.sql'),
  read('supabase/migrations/20261016102253_slim_document_caller_rls_and_immutable_consent.sql'),
  read('supabase/migrations/20261018013336_slim_order_changes_delivery_reviewed.sql'),
  `INSERT INTO auth.users(id) VALUES('${owner}'),('${operator}'),('${outsider}');
   INSERT INTO public.workspaces(id,owner_id,name) VALUES('${W}','${owner}','Synthetic Slim workspace'),('${OTHER}','${outsider}','Synthetic other workspace');
   INSERT INTO public.workspace_members(workspace_id,user_id,role_type) VALUES('${W}','${operator}','funcionario');
   INSERT INTO public.crm_sources(id,workspace_id) VALUES('${source}','${W}');
   INSERT INTO public.pipelines(id,workspace_id,crm_source_id) VALUES('${pipeline}','${W}','${source}');
   INSERT INTO public.pipeline_stages(id,workspace_id,pipeline_id) VALUES('${stage}','${W}','${pipeline}');
   INSERT INTO public.products(id,workspace_id,name,sku,description,price,stock) VALUES('${product}','${W}','Synthetic product','QA','Synthetic description',9.50,100);
   INSERT INTO public.leads(id,workspace_id,name,phone,source,status,custom_data) VALUES
    ('${historical}','${W}','Historical original','${historicalPhone}','whatsapp','active','{"marker":"keep-original"}'),
    ('${alias}','${W}','Historical alias','+55 (11) 90000-0001','pedido_saude_slim','active','{"marker":"keep-alias"}'),
    ('${nullAlias}','${W}','Historical NULL status alias','${historicalPhone}','legacy',NULL,'{"marker":"keep-null-alias"}');
   INSERT INTO public.lead_products(workspace_id,lead_id,product_id,quantity,unit_price,kind) VALUES('${W}','${alias}','${product}',1,9.50,'comprou');
   BEGIN;
   ${actorSql()}
   ${confirmSql(null,'00000000-0000-4000-8000-000000000501',{customerId:historical})}
   COMMIT;`,
 ].join('\n');
}
