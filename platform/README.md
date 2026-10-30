# Saúde Slim | Recuperação da aplicação original

Repositório exclusivo da Saúde Slim. **Não confundir o aplicativo completo com o `index.html` reduzido que foi publicado anteriormente.**

## Estado desta branch

- A interface original TanStack Start continua no projeto, com seus componentes, páginas, estilos e navegação.
- Páginas originais adaptadas para obter dados do Supabase exclusivo: **Histórico de vendas** (`src/routes/saude-slim.tsx`), **Pedidos** (`src/routes/pedidos.tsx`), **Estoque** (`src/routes/crm.estoque.tsx`) e **Clientes** (`src/routes/crm.leads.tsx`). O componente original de **Produtos/catálogos** (`src/legacy/crm.produtos.legacy.tsx`) foi integrado a adaptadores autenticados de CRUD e importação. O design desses módulos foi mantido.
- `src/hooks/use-permissions.ts` consulta o vínculo real no Supabase e restringe o acesso aos módulos do proprietário/administrador enquanto a matriz granular não for portada.
- A inicialização automática de pixel e provisionamento vinculados à MktOn foi removida desta branch.
- As telas acima **ainda não foram homologadas em navegador com uma compilação desta branch**. Dependências residuais de outros componentes podem chamar funções legadas.
- Outros módulos legados, automações, Inbox e integrações utilizam `createServerFn` ou rotas de API e **continuam dependendo do servidor ou de uma adaptação para Supabase Edge Functions**.
- O Supabase exclusivo é o projeto `vyzvfcgpjjzvcjegzzza`; o banco contém apenas parte das tabelas esperadas pelo sistema original.
- Esta branch **não está publicada em** `slimesaude.com`. A publicação atual na branch `main` continua sendo a interface estática simplificada.

## Arquitetura acordada

- **GitHub:** repositório do código e hospedagem estática da interface via Pages. O GitHub Pages **não executa processos Node.js persistentes nem funções TanStack Start**.
- **Supabase:** Auth, banco de dados, RLS e Edge Functions quando necessário.
- **Railway:** exclusivamente Evolution/WhatsApp e seus próprios PostgreSQL e Redis, sem deploy do aplicativo.
- **Hostinger:** DNS já configurado; não alterar.

O projeto Node original já possui `npm start` usando `node .output/server/index.mjs` e Nitro `node-server`. Esses arquivos **não colocam um servidor Node no ar sozinhos**. Para publicar todas as funcionalidades sem nova hospedagem Node, é preciso converter as chamadas de servidor a Supabase (consultas diretas autenticadas ou Edge Functions para lógica sensível), criar estruturas de banco que faltam e validar cada módulo.

## Segurança

Nunca enviar ao cliente ou fazer commit de `SUPABASE_SERVICE_ROLE_KEY`, credenciais Evolution, tokens de IA ou dados de outros projetos. Nunca expor chaves privilegiadas em JavaScript do navegador.

## Validação antes da entrega

1. Build da aplicação original, sem erros; revisão de `check:routes`.
2. Login autenticado com workspace real, permissões RLS e uso de dados isolados.
3. Operação de histórico de vendas, pedidos, produtos, CRM e módulos relevantes.
4. Endpoints, permissões, automações e integrações em condições reais.
5. Publicação HTTPS do conjunto completo, não só de HTML estático.

**Status real: em recuperação e migração, não homologado e não entregue.**
