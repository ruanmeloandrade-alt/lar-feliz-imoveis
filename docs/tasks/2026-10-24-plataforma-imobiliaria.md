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
