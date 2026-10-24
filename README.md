# Lar Feliz Imoveis

Site independente da corretora Vanessa Simoni com catalogo de imoveis, painel administrativo e integracao Supabase.

## Rodar localmente

```bash
npm install
npm run dev
```

## Variaveis

A aplicacao usa `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no build.
Configure-as no Railway com o projeto da Vanessa; nao use chaves de outra empresa.
Nunca coloque chave secreta/service_role em variaveis `VITE_`.
Para desenvolvimento, use `.env.local`, ignorado pelo Git.

## Build

```bash
npm run build
```

## Railway

`railway.json` define build, inicio e healthcheck. O servidor Node serve apenas
`dist/`, com suporte as rotas `/login` e `/admin`. Nao usa GitHub Actions.

```bash
npm ci
npm run typecheck
npm run build
npm run test:server
npm start
```

O backend Supabase original permanece ativo: login, permissoes administrativas,
imoveis, uploads e fichas de clientes. O WhatsApp atual abre a conversa com a
corretora. Isso nao representa um Inbox bidirecional integrado.

A integracao dos motores comerciais esta registrada em
`docs/tasks/2026-10-24-plataforma-imobiliaria.md`.
