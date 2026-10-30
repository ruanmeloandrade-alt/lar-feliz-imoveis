-- Compatibility adapter for the inherited server executor; browser roles cannot decrypt credentials.
create or replace function public.get_evolution_credentials_service(_session_id uuid, _key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.whatsapp_web_sessions%rowtype;
begin
 select * into s from public.whatsapp_web_sessions where id=_session_id and provider='evolution';
 if not found then return null; end if;
 if length(coalesce(_key,''))<32 then raise exception 'Chave de integração inválida.'; end if;
 return pg_catalog.jsonb_build_object('workspace_id',s.workspace_id,'instance_name',s.instance_id,'api_key',extensions.pgp_sym_decrypt(s.token_encrypted,_key),'status',s.status);
end $$;
revoke all on function public.get_evolution_credentials_service(uuid,text) from public,anon,authenticated;
grant execute on function public.get_evolution_credentials_service(uuid,text) to service_role;
notify pgrst,'reload schema';