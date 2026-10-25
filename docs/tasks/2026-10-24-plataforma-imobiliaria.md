# Plataforma Lar Feliz Imoveis

Status: retomado pelo usuario; migracao em andamento, sem desligamento da hospedagem atual.

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
