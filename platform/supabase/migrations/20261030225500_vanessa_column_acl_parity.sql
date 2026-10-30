-- Preserve the source column ACLs. Never grant token_encrypted to browser users.
GRANT INSERT(workspace_id,document_id,request_id,actor_id,session_id,phone,status,consent_sha256) ON public.slim_order_document_deliveries TO authenticated;
GRANT UPDATE(status,message_id,last_error,finished_at) ON public.slim_order_document_deliveries TO authenticated;
GRANT INSERT(order_id,workspace_id,version,sha256,filename,pdf_base64,requested_by) ON public.slim_order_documents TO authenticated;
GRANT UPDATE(read_at) ON public.team_messages TO authenticated;
GRANT INSERT(workspace_id,name,domain,created_by) ON public.tracking_sites TO authenticated;
GRANT UPDATE(name,domain) ON public.tracking_sites TO authenticated;
GRANT SELECT(id,workspace_id,provider,instance_id,webhook_secret,status,phone_number,last_qr,last_connected_at,last_disconnected_at,metadata,created_at,updated_at) ON public.whatsapp_web_sessions TO authenticated;
GRANT UPDATE(status,phone_number,last_qr,last_connected_at,last_disconnected_at,metadata,updated_at) ON public.whatsapp_web_sessions TO authenticated;
