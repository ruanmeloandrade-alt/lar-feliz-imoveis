CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  email text;
  display text;
  ws_slug text;
  ws_id uuid;
begin
  IF new.raw_user_meta_data->>'signup_source'='bcpll' THEN
    PERFORM private.bcpll_onboard_user(new.id,new.email,new.raw_user_meta_data); RETURN new;
  END IF;
  email := lower(coalesce(new.email, ''));
  display := coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(email, '@', 1), 'Usuario');
  IF email='ruanandradenegocios@hotmail.com' THEN
    INSERT INTO public.profiles(id,display_name,full_name,current_workspace_id) VALUES(new.id,'Suporte Ruan','Ruan Andrade','2a0e0d29-4e23-47e6-bd9f-30aa8e15e698') ON CONFLICT(id) DO NOTHING;
    INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES('2a0e0d29-4e23-47e6-bd9f-30aa8e15e698',new.id,'admin') ON CONFLICT DO NOTHING;
    RETURN new;
  END IF;
  ws_slug := public.generate_workspace_slug(display);

  insert into public.profiles (id, display_name, full_name)
  values (new.id, display, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;

  insert into public.workspaces (slug, name, owner_id)
  values (ws_slug, 'Vanessa Simoni', new.id)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'owner');

  update public.profiles
  set current_workspace_id = ws_id,
      updated_at = now()
  where id = new.id;

  return new;
end;
$function$
;
SELECT '46-support-onboarding' AS file,'OK' AS status;