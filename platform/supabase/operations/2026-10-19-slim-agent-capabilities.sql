-- Coerência entre as ações configuradas e a seleção visível de capacidades.
-- Não ativa agentes, não altera o modelo e não executa atendimento.
begin;
update conversation_ai_agents
set metadata=jsonb_set(metadata,'{settings,allowed_actions}','["trocar-etapa","transferir-humano","encerrar-conversa","adicionar-tag"]'::jsonb),updated_at=now()
where workspace_id='c49945db-1960-461a-9339-a43b8403bdd9'
and id in ('05f9404d-d48e-4e5b-8bf3-bbe2fe85c11e','df55ea0e-5cd8-45ae-953c-5ef1a25a4f95')
and not enabled
and metadata#>'{settings,allowed_actions}'='[]'::jsonb
and jsonb_array_length(metadata#>'{settings,actions}')=11;
commit;
