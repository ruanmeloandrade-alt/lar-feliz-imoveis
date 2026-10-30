-- Saúde Slim: índice para FK de mensagem -> sessão, conforme Performance Advisor.
create index if not exists whatsapp_web_messages_session_id_idx
  on public.whatsapp_web_messages (session_id);
