# MktOn MCP Runtime

Base de infraestrutura do projeto Telegram + Hermes + Executor + MCP da MktOn.

Este diretório é independente da aplicação web principal da MktOn e deve ser implantado na Railway como um serviço próprio.

## Railway

Configuração inicial do serviço:

1. Source: repositório `ruanmeloandrade-alt/code-to-lovely-ui`.
2. Branch de trabalho inicial: `work/telegram-mcp-f1-infra-runtime`.
3. Root Directory: `/services/mkton-mcp-runtime`.
4. Public Networking: habilitado apenas para o endpoint que futuramente receberá o webhook do Telegram.
5. Healthcheck: `/health`.
6. Não cadastrar secrets no GitHub.

A Railway injeta `PORT` automaticamente e este runtime escuta em `0.0.0.0:$PORT`.

## Endpoints atuais

- `GET /`: identificação do serviço.
- `GET /health`: liveness.
- `GET /ready`: readiness.

Nesta F1 esses endpoints validam apenas a infraestrutura. Telegram, identidade, Hermes, Executor e tools entram nas frentes F2, F3 e F4.

## Segurança

- container executa como usuário não-root;
- nenhum secret é necessário nesta etapa;
- respostas de health não exibem configuração;
- desligamento trata SIGTERM para deploys controlados.
