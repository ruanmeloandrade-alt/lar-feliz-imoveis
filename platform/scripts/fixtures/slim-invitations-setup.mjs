import {readFileSync,readdirSync} from 'node:fs';
const root=new URL('../../',import.meta.url);
export const W='c49945db-1960-461a-9339-a43b8403bdd9';
export const OTHER='00000000-0000-4000-8000-000000000902';
export const owner='00000000-0000-4000-8000-000000000901';
export const admin='00000000-0000-4000-8000-000000000903';
export const recipient='00000000-0000-4000-8000-000000000904';
export const unconfirmed='00000000-0000-4000-8000-000000000905';
export const outsider='00000000-0000-4000-8000-000000000906';
export const existing='00000000-0000-4000-8000-000000000907';
export const expired='00000000-0000-4000-8000-000000000908';
export const noProfile='00000000-0000-4000-8000-000000000909';
export const legacy='00000000-0000-4000-8000-000000000910';
export const legacyToken='00000000-0000-4000-8000-000000000911';
export const otherInvite='00000000-0000-4000-8000-000000000912';
export const otherToken='00000000-0000-4000-8000-000000000913';
export const emails={owner:'qa.owner@example.invalid',admin:'qa.admin@example.invalid',recipient:'qa.recipient@example.invalid',unconfirmed:'qa.unconfirmed@example.invalid',outsider:'qa.outsider@example.invalid',existing:'qa.existing@example.invalid',expired:'qa.expired@example.invalid',noProfile:'qa.no-profile@example.invalid'};
export const literal=value=>value===null?'NULL':"'"+String(value).replaceAll("'","''")+"'";
export const actorSql=(id=owner)=>`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub',${literal(id)},true);`;
export const serviceSql="SET LOCAL ROLE service_role; SELECT set_config('request.jwt.claim.sub','',true);";
export const contextSql=({action='create',email=emails.recipient,id=null,actor=owner,workspace=W}={})=>`SELECT public.slim_invitation_context(${literal(workspace)},${literal(actor)},${literal(action)},${literal(action==='create'?email:null)},${literal(id)});`;
export const createPayload=(email=emails.recipient)=>({email,accessRole:'admin',accessDays:null});
export const changeSql=({request,action='create',payload=createPayload(),fingerprint,approved=true,actor=owner,workspace=W})=>`SELECT public.slim_invitation_change(${literal(workspace)},${literal(actor)},${literal(request)},${literal(action)},${literal(JSON.stringify(payload))}::jsonb,${literal(fingerprint)},${approved===null?'NULL':approved?'true':'false'});`;
export const lookupSql=({request,action='create',id=null,actor=owner,workspace=W})=>`SELECT public.slim_invitation_change_lookup(${literal(workspace)},${literal(actor)},${literal(request)},${literal(action)},${literal(id)});`;
export const linkSql=(id,{actor=owner,workspace=W}={})=>`SELECT public.slim_invitation_link(${literal(workspace)},${literal(actor)},${literal(id)});`;
export const previewSql=token=>`SELECT public.slim_invitation_preview(${literal(token)});`;
export const acceptSql=(token,{actor=recipient,approved=true,mode='accept'}={})=>`SELECT public.slim_invitation_accept(${literal(token)},${literal(actor)},${approved===null?'NULL':approved?'true':'false'},${literal(mode)});`;
export const invitationMigration=()=>{
 const files=readdirSync(new URL('supabase/migrations/',root)).filter(name=>name.endsWith('_slim_invitations_explicit_access.sql'));
 if(files.length!==1)throw new Error('Expected one CLI-generated explicit invitation migration.');
 return readFileSync(new URL('supabase/migrations/'+files[0],root),'utf8');
};
export const stateSql=`SELECT jsonb_build_object(
 'users',(SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY id),'[]') FROM auth.users u),
 'profiles',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM public.profiles p),
 'members',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id),'[]') FROM public.workspace_members m),
 'modules',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id),'[]') FROM public.module_permissions m),
 'permissions',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM public.user_permissions p),
 'invites',(SELECT coalesce(jsonb_agg(to_jsonb(i)-ARRAY['access_role','accepted_at','accepted_by'] ORDER BY id),'[]') FROM public.workspace_invitations i));`;
export const permissionStateSql=`SELECT jsonb_agg(jsonb_build_object('table',c.relname,'acl',c.relacl::text,'rls',c.relrowsecurity,
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname=n.nspname AND p.tablename=c.relname)) ORDER BY c.relname)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';`;
export const functionStateSql=`SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'body',p.prosrc,'definer',p.prosecdef,'acl',p.proacl::text,'config',p.proconfig) ORDER BY p.oid::regprocedure::text)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private','auth') AND p.proname NOT LIKE 'slim_invitation_%';`;

// Exact invitation column types recorded from production metadata on 18 Oct;
// generated TS types are stale (text[]/updated_at/accepted_at) and are not this fixture.
// Unrelated financial/CRM tables are not needed: this migration never touches them.
export function setupSql({includeRoles=true}={}){
 return `
 ${includeRoles?'CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;':''}
 CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA private;
 CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
 GRANT USAGE ON SCHEMA public,private,auth TO authenticated,service_role;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE public.workspaces(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES auth.users(id),name text NOT NULL);
 CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),current_workspace_id uuid REFERENCES public.workspaces(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at:=clock_timestamp(); RETURN NEW; END;$$;
 CREATE TRIGGER touch_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
 CREATE TABLE public.workspace_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',role_type text NOT NULL DEFAULT 'funcionario',is_partner boolean NOT NULL DEFAULT false,access_expires_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(workspace_id,user_id));
 CREATE TABLE public.workspace_invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,email text NOT NULL,
  role_type text NOT NULL DEFAULT 'funcionario',is_partner boolean NOT NULL DEFAULT false,modules jsonb NOT NULL DEFAULT '[]'::jsonb,access_days integer,status text NOT NULL DEFAULT 'pending',
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.module_permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),user_id uuid NOT NULL REFERENCES auth.users(id),modules jsonb NOT NULL DEFAULT '[]'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,user_id));
 CREATE TABLE public.user_permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),user_id uuid NOT NULL REFERENCES auth.users(id),permissions jsonb NOT NULL DEFAULT '{}'::jsonb,updated_by uuid REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,user_id));
 ${['workspaces','profiles','workspace_members','workspace_invitations','module_permissions','user_permissions'].map(table=>`
 ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.${table} FROM PUBLIC,anon,authenticated;
 GRANT SELECT,INSERT,UPDATE,DELETE ON public.${table} TO authenticated;
 GRANT ALL ON public.${table} TO service_role;`).join('\n')}
 CREATE POLICY workspace_owner ON public.workspaces FOR ALL TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
 CREATE POLICY own_profile ON public.profiles FOR ALL TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
 ${['workspace_members','workspace_invitations','module_permissions','user_permissions'].map(table=>`
 CREATE POLICY workspace_owner ON public.${table} FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=workspace_id AND w.owner_id=auth.uid()))
  WITH CHECK(EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=workspace_id AND w.owner_id=auth.uid()));`).join('\n')}
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
  ('${owner}','${emails.owner}',clock_timestamp()),('${admin}','${emails.admin}',clock_timestamp()),('${recipient}','${emails.recipient}',clock_timestamp()),
  ('${unconfirmed}','${emails.unconfirmed}',NULL),('${outsider}','${emails.outsider}',clock_timestamp()),('${existing}','${emails.existing}',clock_timestamp()),
  ('${expired}','${emails.expired}',clock_timestamp()),('${noProfile}','${emails.noProfile}',clock_timestamp());
 INSERT INTO public.workspaces(id,owner_id,name) VALUES('${W}','${owner}','Synthetic Saúde Slim'),('${OTHER}','${outsider}','Synthetic Other');
 INSERT INTO public.profiles(id,current_workspace_id) SELECT id,CASE WHEN id='${owner}'::uuid THEN '${W}'::uuid ELSE '${OTHER}'::uuid END FROM auth.users WHERE id<>'${noProfile}';
 INSERT INTO public.workspace_members(workspace_id,user_id,role,role_type,is_partner,access_expires_at) VALUES
  ('${W}','${admin}','admin','admin',false,NULL),('${W}','${existing}','member','funcionario',false,NULL),('${W}','${expired}','member','visualizador',false,clock_timestamp()-interval '1 day');
 INSERT INTO public.module_permissions(workspace_id,user_id,modules) VALUES('${W}','${existing}','["crm"]'),('${W}','${recipient}','["legacy-orphan-metadata"]');
 INSERT INTO public.user_permissions(workspace_id,user_id,permissions,updated_by) VALUES('${W}','${existing}','{"modules":{"crm":{"enabled":true,"pipelines":["preserved"]}}}','${owner}'),('${W}','${recipient}','{"modules":{},"historical":true}','${owner}');
 INSERT INTO public.workspace_invitations(id,workspace_id,email,role_type,is_partner,modules,access_days,token,invited_by) VALUES
  ('${legacy}','${W}','qa.legacy@example.invalid','parceiro',true,'["legacy"]',30,'${legacyToken}','${owner}'),
  ('${otherInvite}','${OTHER}','${emails.recipient}','funcionario',false,'[]',NULL,'${otherToken}','${outsider}');
 `;
}
