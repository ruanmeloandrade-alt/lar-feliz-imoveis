# Vanessa Simoni - Plataforma imobiliaria

Site publico e gestao imobiliaria com API propria Node 24, SQLite e arquivos
no volume exclusivo da Vanessa. Infraestrutura: Railway, GitHub e Hostinger.
Nenhuma dependencia de banco/Auth/Storage externo em runtime.

## Executar

```sh
npm ci
npm run typecheck
npm test
npm run test:server
npm run build
npm start
```

O servidor usa PORT (8080 por padrao). Localmente os dados ficam em
.local-data, ignorado pelo Git. Para desenvolvimento Vite, rode o servidor
com PORT=8099 e npm run dev; /api e encaminhada ao servidor local.

## Railway

- Reutilizar somente o projeto Lar Feliz Imoveis, servico lar-feliz-web.
- Volume persistente obrigatorio montado em /data. O processo recusa iniciar
  na Railway se esse volume nao estiver declarado.
- Definir BOOTSTRAP_TOKEN com segredo aleatorio de pelo menos 32 caracteres,
  NODE_ENV=production e Node 24. Nunca colocar segredos em VITE_* ou no Git.
- Primeiro administrador criado em /plataforma#token=SEGREDO, escolhendo
  e-mail e senha de pelo menos 12 caracteres. O token vai no fragmento, nao
  nos logs HTTP. Depois do primeiro cadastro o endpoint de configuracao fecha.
- Sessoes opacas em cookie HttpOnly/Secure/SameSite=Strict; senhas com scrypt.
- Banco /data/vanessa.sqlite; midias em /data/media ou /data/import/media.
  Banco e midias nunca sao publicados pelo servidor estatico.
- Healthcheck /healthz. Nao usar GitHub Actions.

## Modulos

Clientes; negociacoes em funil com recibos idempotentes e eventos atomicos;
carteira de imoveis; tarefas; regras de criacao de tarefas; propostas e PDFs
privados. O motor de recibos/funil foi adaptado do codigo da Saude Slim, sem
copiar seus dados, credenciais ou banco.

Captacoes anonimas entram em fichas, clientes e negociacoes na mesma transacao.
Renda da ficha nao vira valor de negociacao. Erros de leitura nao viram zeros.
Regras criam tarefas com prazo persistido; nao enviam mensagens externas.
Status de contrato e manual, nao assinatura eletronica. WhatsApp abre conversa
externa; Inbox bidirecional e SalesBots completos nao estao integrados.

## Importacao local

scripts/prepare-local-import.mjs recupera somente dados de negocio e midias
da copia local criptografada. Nao acessa servicos externos nem importa usuarios,
senhas, sessoes ou credenciais antigas. Reescreve todas as midias para a API
propria e valida hashes. O pacote privado deve ficar fora do repositorio.

Enviar a pasta import ao volume, em /import, antes da primeira inicializacao.
O servidor importa /data/import/catalog.json uma unica vez. Arquivos iguais
sao deduplicados pelo hash, preservando todas as referencias do catalogo.

## Validacao

- npm test: contratos do motor, acesso, estados de erro e site publico.
- npm run test:server: HTTP real local, login, CRM, automacoes, documentos,
  isolamento, CSRF, cookies, repeticoes e persistencia apos reiniciar.
- npm run verify:migration: imagens originais e ausencia de SDKs/URLs antigos
  nos bundles. npm run verify:live -- URL_HTTPS: publicacao e modulos.
- Nao usar ferramentas Lovable, nem contornar essa proibicao com outro acesso.
- A exclusao remota do projeto antigo nao foi executada e nao pode ser
  declarada concluida. Limpeza da conta QA antiga requer autorizacao adequada.
