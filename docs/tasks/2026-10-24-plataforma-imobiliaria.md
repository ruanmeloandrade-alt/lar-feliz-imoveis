# Plataforma Lar Feliz Imoveis

Status: retomado pelo usuario; migracao em andamento, sem desligamento da hospedagem atual.

## Backend independente - 28/10/2026 (estado mais recente)

- Confirmados Railway, GitHub e Hostinger. Usuario autorizou expressamente o
  disco persistente e seu custo por uso. Volume criado apenas em Lar Feliz
  Imoveis: 1615e35c-13fc-47e1-9731-17c4142c48ab, mount /data, servico lar-feliz-web.
- Substituida a integracao antiga por API propria same-origin, SQLite nativo do
  Node 24 e arquivos no volume. SDK externo removido, nenhuma dependencia nova.
- Login proprio com scrypt, cookie HttpOnly/Secure/SameSite Strict, limitacao
  de tentativas, bloqueio de origem para escrita e bootstrap de uso unico.
- Registros privados exigem sessao no servidor. Somente catalogo publicado e
  envio de ficha sao publicos. PDFs privados usam link assinado de ate 5 minutos.
- Captacao, contato, negociacao, eventos e regras de tarefas sao transacionais.
  Recibos idempotentes preservados no motor adaptado da Saude Slim.
- Recuperacao somente da copia local criptografada: 12 imoveis, 2 fichas,
  78 referencias de midia e 74 arquivos unicos. Hashes validados e todas as URLs
  convertidas para a API propria. Nenhum usuario, senha ou sessao antiga copiado.
- Dados/midias de negocio fora do Git; importacao privada no volume. Nenhuma
  chamada Lovable nem acesso indireto ao backend proibido nesta retomada.
- Removidos adaptador, configuracoes e migrations executaveis antigas. O
  historico anterior abaixo e apenas registro, nao instrucao para reutiliza-los.
- Verificacao independente HTTP LOCAL passou: bootstrap, login real, cookies,
  CRM, repeticoes, selecao invalida sem escrita parcial, automacoes com prazo,
  propostas, upload/download, assinatura expirada/adulterada, acesso anonimo,
  CSRF, logout e persistencia apos reinicio. Sem banco/servico remoto nesses testes.
- Build, typecheck, 22 testes de interface/motor e verificacao de bundle sem
  SDK/URLs antigos passaram. Nenhum teste visual em navegador realizado.
- Dominio exato da Hostinger solicitado; nao inventar nome nem alterar MX/TXT.
- Exclusao remota da publicacao e conta QA antigas NAO executada. Nao contornar
  a proibicao para faze-la nem declarar retirada remota completa.
- Inbox WhatsApp bidirecional, SalesBots completos e assinatura eletronica
  continuam pendentes. Regras atuais criam tarefas; status de contrato e manual.

## Implementacao local de 28/10/2026

### Instrucao mais recente e obrigatoria

- Correcao expressa mais recente do usuario: exclusivamente Railway, GitHub e
  Hostinger. Heroku e HostGator foram corrigidos e nao sao o destino.
- Usuario RECUSOU publicacao provisoria dependente do backend antigo. Nao
  publicar esta implementacao enquanto a integracao antiga nao for substituida.
- Nenhum acesso Lovable, nem diretamente nem por outra ferramenta. Pedido de
  exclusao remota nao foi executado: nao ha operacao de exclusao disponivel
  dentre as ferramentas autorizadas. Nao declarar exclusao confirmada.
- Verificacao local: nao foi encontrado CLI Heroku, sessao netrc ou conector
  Heroku disponivel. Nome do app Heroku de destino ainda nao foi confirmado.
- Nao foram criados recursos, assumidas cobrancas ou alterados DNS nesta retomada.

- Branch codex/vanessa-platform. Nova area /plataforma, acesso administrativo,
  clientes, negociacoes em funil, carteira de imoveis, agenda, regras de tarefas,
  propostas, documentos PDF privados e visualizacao/impressao de proposta.
- Motor atomico adaptado de saude-slim@b4b3df96, arquivo
  src/lib/slim-funnel-mutations.core.ts. Recibos, idempotencia, selecao exata,
  timeout e validacao mantidos; somente RPCs vanessa_* sao utilizados.
- Nenhum dado, credencial ou banco da clinica utilizado. Nenhuma dependencia
  de producao adicionada. Site publico, imagens e captacao preservados.
- Foram aplicadas migrations no backend original pela ponte SQL ANTES da
  interrupcao expressa do usuario. Isso contrariou a proibicao de usar Lovable.
  Nova regra: nenhuma chamada Lovable nem acesso indireto para contornar a regra.
- As duas fichas reais anteriores foram vinculadas a dois clientes/negociacoes.
  Testes SQL com rollback passaram para recibos, repeticoes, duplicidade,
  movimentacao, eventos, tarefas, captacao e protecao anon/nonadmin.
- Conta Auth administrativa e workspace QA temporarios foram criados. Nao
  constam nas migrations do repo. O teste HTTP NAO executou: importacao do SDK
  falhou antes do login. Nenhum e-mail enviado e nenhuma senha real alterada.
  Remocao dessas fixtures permanece pendente de acesso autorizado; nao fazer
  novas chamadas Lovable para limpa-las sem autorizacao expressa.
- Checkers remotos foram bloqueados contra o projeto antigo para impedir
  repeticao acidental. Validacao atual limitada a arquivos locais/GitHub/Railway.
- Persistencia implementada usa o contrato do backend original; a publicacao
  provisoria com ele foi submetida a confirmacao explicita do usuario.
- Ainda pendentes: backend independente, limpeza QA autorizada, Inbox WhatsApp
  bidirecional com sessao exclusiva, SalesBots completos, envio externo de
  mensagens, assinatura eletronica e homologacao visual/autenticada real.
- Regras de automacao entregues aqui CRIAM TAREFAS com prazo persistido. Nao
  significam mensagens enviadas nem prova de horas/dias transcorridos.
- Status de proposta "Contrato firmado" e manual; nao e assinatura eletronica.
- Validacao local anterior: typecheck/build, 22 testes Vitest, 2 testes de
  servidor e lint dos novos modulos passaram. Testes visuais em navegador nao
  foram feitos, por proibicao do usuario.

## Redefinicao de escopo em 26/10/2026

- Usuario determinou manter o site externo e substituir o painel interno antigo
  pelos motores reais da Saude Slim, adaptados ao negocio imobiliario.
- Vanessa deve ter projeto/banco independente. Nao compartilhar bancos de outros clientes.
- Retirada nesta entrega: link Login do site, rotas React /login e /admin e
  AuthProvider global. Servidor devolve 404 para essas rotas e subrotas.
- Codigo antigo permanece recuperavel no repositorio, mas nao e importado pelo
  aplicativo publico. Nenhuma tabela, usuario, ficha ou arquivo de negocio apagado.
- Catalogo e formulario publico continuam utilizando o backend original ate a
  substituicao independente validada. Retirar painel nao significa retirar backend.
- Medicao real do storage: 114 arquivos, 1.431.115.865 bytes; 78 referenciados
  pelos imoveis publicados (1.042.630.430 bytes), 36 sem referencia encontrada no
  catalogo publicado (388.485.435 bytes). Sem referencia nao prova descarte seguro.
- Composicao: JPEG 936.781.563 bytes, PNG 207.208.426 bytes, PDF 191.736.123 bytes,
  MP4 95.389.753 bytes. Esse volume e midia, nao codigo do painel interno.
- Substituicao completa pelo sistema adaptado da Saude Slim permanece pendente.
  Nao anunciar CRM, Inbox ou automacoes como entregues por retirar o painel antigo.

## Objetivo

Preservar o site original da Vanessa Simoni e integrar os motores reais da
Saude Slim com identidade e linguagem imobiliaria. Trabalhar apenas no codigo.
Nao usar Chrome, GitHub Actions, mocks ou dados de outras empresas.

## Fontes verificadas

- Destino: ruanmeloandrade-alt/lar-feliz-imoveis, main d7f98be.
- Branch de trabalho: codex/lar-feliz-original-pages (criada antes da ampliacao de escopo).
- Original exportado integralmente da Lovable, commit 05d4bd329a8447b40da0555db2b0d38e875b4f29.
- Motores: ruanmeloandrade-alt/saude-slim, branch de producao
  restauracao/sistema-completo-20261014, b4b3df96c499e3f78108b11760ded925cb3eae32.
- A copia historica em code-to-lovely-ui nao e a referencia atual de producao.

## Preservacao

O GitHub continha uma reconstrucao reduzida, sem imagens originais, formulario
de oito etapas e recursos do painel. Restaurados componentes, estilos, imagens,
formularios, autenticacao, permissoes, uploads e migrations do original.
Arquivo .env fica apenas local, ignorado pelo Git. Nenhum segredo foi copiado
para o codigo. Dependencias restauradas sao as do site original, sem nova
dependencia de producao para o servidor Node.

## Contratos e integracao

O banco atual fxeuzdjygpfsdhvsffnj tem somente leads, properties e user_roles.
Nao possui workspace_id, pipelines, pipeline_stages, mensagens ou automacoes.
Nao conectar os servicos da Saude Slim a esse schema, nem usar o banco/dados
da Saude Slim como fallback. Preservar o backend original ate migracao validada.

| Motor existente | Nome imobiliario | Dependencias ainda necessarias |
| --- | --- | --- |
| CRM/funis e identidade de contatos | Negociacoes e clientes | Workspace, permissoes, funis, eventos atomicos |
| Inbox e conector WhatsApp | Atendimento | Servidor, sessao exclusiva e credenciais da Vanessa |
| Produtos/catalogos/estoque | Carteira de imoveis | Adaptador de properties, midias e disponibilidade |
| Pedidos/ERP | Propostas e contratos | Modelo imobiliario e regras de negociacao |
| Dashboard | Visao geral | Leituras reais e estados de erro; sem vendas inferidas por renda |
| Salesbots e automacoes | Automacoes de atendimento | Fila, eventos, worker e fontes de conhecimento |

Os modulos completos ainda nao foram portados. Restaurar a landing page nao
equivale a integrar CRM, Inbox, automacoes e gestao comercial.

## Bloqueios atuais

- Railway: conector retornou UNAUTHORIZED, mas CLI oficial autenticada funciona.
- Usuario confirmou Railway e autorizou retomar migracao/publicacao. Inventario
  autenticado nao encontrou projeto/servico Lar Feliz existente.
- Supabase conectado lista Saude Slim, Harpia e MKTon legado; nao lista o banco
  original da Vanessa. Schema original consultado em leitura pela ponte SQL.
- Falta definir acesso administrativo ao banco independente de destino e
  credenciais/sessao WhatsApp exclusivas da Vanessa, sem copiar as de outro cliente.
- Dominios/DNS nao foram alterados. Nenhum CNAME encontrado no repositorio.

## Aceite e verificacao

Build, typecheck, testes do site e servidor local; paridade de conteudo/assets;
integracao real autenticada; banco isolado; WhatsApp bidirecional; dominio/HTTPS;
publicacao e smoke. Somente depois retirar Lovable. Sem validacao visual por
navegador por instrucao expressa do usuario.

## Registro da retomada

- Instalacao original concluida, tagger removido do lockfile.
- Primeiro build/typecheck encontraram referencia residual ao asset JSON da
  bandeira no Hero; substituida pelo SVG original baixado localmente.
- Teste do servidor passou antes da retomada do build; healthcheck agora exige
  index.html do build e o processo atende SIGTERM.
- Arquivos originais e backend preservados; nenhuma escrita no banco nesta etapa.

## Publicacao e descoberta operacional

- Codigo enviado ao GitHub: ffce2e4, PR #1.
- Railway projeto Lar Feliz Imoveis aefc3cb7-5f83-421e-9398-5c07f639b4bc,
  servico lar-feliz-web a39e93c9-0c05-4c02-afa8-72674f4a24e6,
  production 36fae760-1f90-42b6-a092-ea67fd75141a.
- Dominio gerado: https://lar-feliz-web-production.up.railway.app.
- Fonte conectada ao GitHub na branch de trabalho; primeiro build remoto iniciado.
- Typecheck e build locais aprovados; servidor e validacao de chaves publicas
  aprovados (2 testes). Auditoria de build confirmou hashes de imagens originais
  e ausencia de endpoints/assets Lovable. Teste exemplo herdado passa, mas nao
  constitui validacao funcional do painel.
- Checagem real: Auth HTTP 200, catalogo HTTP 401/42501, causado por falta de
  EXECUTE anon em has_role. Politica SELECT antiga era TO public e chamava
  has_role mesmo na consulta publica. Mantida a protecao da funcao: restringir
  a politica existente a authenticated e criar leitura anon apenas de published.
- Snapshot anterior: politica "Anyone can view published properties",
  TO public, USING (published = true OR has_role(auth.uid(), 'admin'::app_role)).
  Nenhuma outra politica de imoveis ou fichas e alterada. Rollback: remover
  "Visitors can view published properties" e voltar a politica antiga TO public.
- Migration gerada pela CLI oficial em 20261025000157_lar_feliz_public_catalog.sql.
- Migration aplicada pela ponte SQL: Auth e catalogo HTTP 200. Leitura anonima
  de fichas retorna [] (sem exposicao). Nenhum registro de negocio gravado/apagado.
- Fixture/config Playwright herdados apontavam para pacote Lovable inexistente;
  agora usam apenas @playwright/test existente. Nenhum navegador executado.
- Primeiro deploy ffce2e4 SUCCESS. HTTPS /, /login, /admin e /healthz HTTP 200;
  bundle e imagens remotas conferidos pelo script check-live, sem navegador.
- Ajustado o carregamento de permissoes: login espera user_roles e respostas de
  sessoes antigas nao reativam admin depois de sair. Painel espera isAdmin.
- Regressao local: dois testes de corrida de autenticacao e dois de preservacao
  do site passaram. Sao testes de componente/transporte controlado, nao login
  real com a senha da Vanessa. O teste exemplo herdado tambem passou.
- Atualizado somente o lockfile com correcoes compativeis (npm audit fix sem
  force); npm ci concluido. Nao houve inclusao de dependencia de producao.
  Auditoria ainda aponta itens que exigem upgrades de major (Vite/Vitest,
  roteador e Zod); nao aplicados para evitar migracao de framework neste corte.
- Tentativa de testar durante npm ci falhou por modulos em substituicao;
  apos terminar a instalacao, testes repetidos e aprovados.
