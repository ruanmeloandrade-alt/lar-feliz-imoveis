-- Install only after reviewing and linking the proven legacy aliases. Fails atomically on unresolved duplicates.
CREATE UNIQUE INDEX slim_active_contact_phone_identity ON public.leads(workspace_id,public.slim_contact_phone_key(phone))
 WHERE merged_into_id IS NULL AND status NOT IN('deleted','merged','archived') AND public.slim_contact_phone_key(phone) IS NOT NULL;
-- A group JID, LID, missing/invalid phone or a homonym alone never participates in this identity key.
NOTIFY pgrst,'reload schema';
