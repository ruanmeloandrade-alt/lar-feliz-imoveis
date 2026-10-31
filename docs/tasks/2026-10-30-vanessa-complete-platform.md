# Complete Vanessa platform from Saude Slim

## Authorized scope

Copy the complete working Saude Slim system (dashboard, CRM/funnel, products,
SalesBots, AI, Brain, Inbox, settings and related modules) and adapt only the
identity and dedicated integration/environment contracts. Preserve Vanessa's
public site and 12 existing properties. Private entry is /admin; no login link
on the public sales page. Use GitHub, Railway, Vanessa-owned Supabase and the
existing Railway Evolution infrastructure with a dedicated Vanessa instance.

## Verified source and destination

- Source repository: ruanmeloandrade-alt/saude-slim.
- Source branch: restauracao/sistema-completo-20261014.
- Exact source commit: 472d7ef1050807f3f05880fcc770053831d29b29.
- Source cloned separately; original checkout was not modified.
- Destination: lar-feliz-imoveis, branch codex/vanessa-complete-platform.
- Dedicated Supabase organization Vanessa Thais Simoni, xtnxmzwxhjfrfvjfnloo.
- Dedicated Supabase project fnuhmypmhcwecziswbat, account corretoravanessasimoni@gmail.com.
- Chrome: exactly one task tab. Other accounts/tabs preserved.

## Current evidence

- Public /admin entry and Produtos labels deployed in commit 74921c0, PR #5.
- Existing standalone platform has a real owner login and 12 authenticated properties.
- Current source SQLite snapshot taken consistently via node:sqlite backup.
- Vanessa's 28 business records and 74 media metadata rows were imported into
  vanessa_private in her Supabase, preserving IDs. The binaries remain on the
  owned Railway volume pending storage cutover.
- Schema-only metadata was read from the source Supabase, without customer data,
  identities, sessions or integration secrets. Source database was not modified.
- Full source archived into platform/. Custom Postgres-adapter work preceding
  the explicit full-copy clarification is preserved in a Git stash, not deployed.

## Completion gates

1. Native build without Lovable SDKs; same complete operational source modules.
2. Vanessa-only database/Auth/Storage with RLS and native source RPC contracts.
3. All 12 properties in Products and preserved public gallery/form.
4. Authenticated private routes and original visual identity.
5. Dedicated Evolution instance and webhook; real phone pairing plus send/receive
   must be distinguished from merely displaying a QR.
6. Real AI/Brain persistence and provider integration; no simulated responses.
7. Railway deployment and authenticated production checks before completion claim.

No new paid plan or unapproved production dependency may be added. Do not delete
the old remote provider or source backups before parity is verified.

## Verified integration on 2026-10-30

- Canonical source prebuild/domain regression suite passed after LF normalization.
- Native Vite/TanStack/Nitro build succeeds without provider SDK wrappers.
- Dedicated Auth owner signs in; authenticated RLS returns the 12 original products.
- 74 media binaries, 1,011,338,294 bytes, uploaded in bounded parts and downloaded/hash-verified.
- Original public media URLs are reconstructed with HTTP Range support from Supabase Storage.
- Two original leads, 20 original custom-field values, two historical form submissions retained.
- A temporary public form submission created a real native lead and form submission in the correct workspace/funnel; only that fixture was removed.
- Six real-estate funnel stages, one property catalog and 12 factual Brain sources are present.
- Dedicated Evolution instance ws_2a0e0d29_vanessa-simoni created; webhook and encrypted session stored. Phone is not paired yet.
- No Vanessa OpenAI/Gemini credential is configured. AI modules must report this honestly; no borrowed client keys or simulated responses.
- Public site typecheck/build, 20 tests, two server tests and migration verification pass.
- Broad inherited platform typecheck reports errors in the original source graph; it is not a release check that passed. New adaptation type issues were corrected.
- Root sales bundle no longer includes the reduced platform. /admin is served by the complete native runtime.

## Pending production evidence

- Merge and Railway SUCCESS for this complete-platform branch.
- Authenticated production module checks and retained public gallery/form.
- Real WhatsApp pairing and send/receive depend on the owner handset.
- Real AI inference depends on a Vanessa-owned provider key.
- Hostinger domain cutover requires the exact paid domain to be established; no domain was guessed or DNS changed.

## Production and domain evidence

- PR #6 merged as 3313d6c; Railway 6c31ef1e-a854-47bd-a081-f9393b4e70d2 reached SUCCESS.
- PR #7 identity cleanup merged as 33fc121; Railway 83b9c4b7-f19b-435a-83e0-7f20dd9036b7 reached SUCCESS.
- Production owner login opened the complete runtime; Produtos showed 12 properties.
- Production public form returned 201 and created a native active lead in the intended pipeline. Only the fixture was removed.
- Production SalesBot editor opened and persisted an inactive test draft; that draft was removed.
- Broad compiled output scan found no inherited provider gateway or source Supabase URLs.
- Temporary Railway SSH key codex-vanessa-transfer was revoked. Local test servers were stopped.
- Hostinger authenticated domain inventory confirmed corretoravanessasimoni.com active through 2027-07-03. Existing DNS has only two website A records and two obsolete provider-verification TXT records; no email records are present in that zone. Nameservers remain unchanged.
- Railway registered apex and www for this service; target CNAMEs are p33g7q13.up.railway.app and rerwq3gx.up.railway.app. DNS originals are retained in the local delivery outputs.
- The domain cutover update permits both owned application origins, redirects www to the apex, and keeps the Railway URL for compatibility. DNS/HTTPS completion is verified separately after deployment.

## Certified primary hostname

- Railway verified www.corretoravanessasimoni.com and issued its certificate. The Hostinger CNAME and ownership TXT are public.
- Apex ALIAS remains configured correctly, but authoritative Hostinger nodes have temporarily returned mixed old/new A answers. Its Railway certificate was still provisioning during validation.
- Primary PUBLIC_APP_URL is therefore https://www.corretoravanessasimoni.com. The app redirects apex requests to www and accepts both owned origins plus the Railway compatibility URL.
- A real HTTP test proves the primary www host serves the public page and apex redirects preserve /admin paths and query strings. All three server tests pass; native build passes.

## Column ACL parity

- Inbox validation detected missing column-level grants on whatsapp_web_sessions. Table ACLs alone did not preserve these source permissions.
- Read pg_attribute.attacl from the canonical source, without customer rows or secrets. Restored eight exact grant statements for sessions, document delivery, team read markers and tracking writes.
- Verified authenticated owner metadata read: 200 with one own session. Selecting token_encrypted stays denied (403); anonymous session reads stay denied (401).
- Baseline and forward migration now include the same column permissions, with RLS unchanged.


## Ajustes imobiliários, marketplace e suporte

Cadastro de novos imóveis ligado diretamente ao catálogo público por vanessa_catalog, sem exigir registro legado. public_property armazena apenas os campos públicos; RPC retorna lista explícita sem custos, import_snapshot, contatos ou dados privados. Mantidos os 12 imóveis e todos os dados originais. Rascunhos e imóveis inativos são excluídos do público. Galeria usa Storage exclusivo vanessa-listings, upload restrito ao usuário membro da Vanessa; fotos, vídeos e PDFs servidos pela própria origem.

Menu: CRM antes de Gestão imobiliária; Pedidos passa a Negociações e Fornecedores passa a Parceiros; Estoque retirado do menu e do formulário de produto. Ícones SVG próprios e distintos. Barra de rolagem do menu escondida mantendo a navegação. Parceiros reutiliza companies, com tipo, responsável, email, telefone, CNPJ, região, endereço, CRECI e condições comerciais persistentes.

Conta de suporte independente criada para o email confirmado no histórico da Saúde Slim. Apenas seu UUID tem edição em tutorial_modules/tutorial_lessons, por interface e RLS; Vanessa pode consultar. Credenciais somente em arquivo privado local, fora do Git. YouTube nocookie permitido no frame-src da área privada.

Tracking: site oficial cadastrado por padrão, pixel instalado só no site público; Fontes mostra o site próprio e integrações realmente conectadas; removidos cadastro de outros sites, instalação manual, Eventos do site, Conversões e Diagnóstico; Eventos e UTMs permanecem. Nenhum evento ou conexão fictícia é exibido. WhatsApp connecting não é interpretado como conectado.

Validação: 23 testes de contrato imobiliário e tutoriais passaram; os 12 cadastros originais validaram pelo schema; insert público de imóvel novo, rascunho oculto e ausência de custos no retorno foram testados na própria Vanessa; dados de teste removidos. Upload autenticado no Storage e persistência de parceiro foram testados. Vanessa recebeu 403 na edição de tutorial e suporte inseriu/removeu módulo temporário com sucesso.

DNS: WWW com certificado válido, porém há divergência entre resolvedores e o apex ainda está VALIDATING_OWNERSHIP. Não ignorar avisos. Acesso alternativo Railway permanece disponível.


## Página pública profissional, atendimento e VGV

Nova apresentação pública com fotos originais Vanessa, paleta refinada, cabeçalho editorial e formulário de8etapas sem gamificação. Removida a estimativa genérica de crédito baseada em regras antigas; exibido resumo dos dados declarados, sem promessa de aprovação. O formulário só confirma envio após cadastro real e preserva dados ao falhar.

Botão flutuante e CTA do cabeçalho abrem atendimento virtual. Chave própria de IA obrigatória; ausência de chave não produz resposta simulada e mantém captura de nome/WhatsApp com autorização do cliente. Sessões assinadas, limites de corpo/frequência, conversas privadas, imóveis sugeridos restritos ao catálogo público. Registro idempotente na primeira etapa do funil existente; não foi criado gatilho específico, conforme instrução final. As informações explicitamente declaradas preenchem campos da ficha, incluindo idade e cidade. Teste confirmou primeira etapa, duas sessões com mesmo WhatsApp sem duplicar lead e2campos preenchidos; fixtures removidas.

VGV e comissões ligados ao valor do lead e às etapas reais, separado de valor de catálogo. Percentual ou valor fixo, recebimento informado, previsão, imóvel e parceiro. RPC atômica valida acesso e concorrência e mantém trilha de atividade. Teste: R$200.000 ×3%=R$6.000, R$1.500 de recebimento informado; edição concorrente e recebimento acima do combinado rejeitados. Fixtures removidas.

Tracking: compatibilidade real do schema nativo restaurada, visita anônima coletada200, retry deduplicado200/1registro, propriedades/visitante sincronizados; fixtures removidas. Medição adicional somente no site público: botões, imóvel visualizado e segundos com detalhe visível. Sistema interno não carrega o coletor público. Meta não dispara sem conexão configurada.

Verificações:27testes de imóvel/tutoriais/finanças/dados declarados, builds público/nativo e typecheck da página pública passaram. Inferência IA e envio/recebimento WhatsApp ainda dependem de chave própria e pareamento físico. DNS apex pendente na última consulta; WWW certificado válido, mas resolvedores locais divergiram. Não afirmar certificado universal ou nova versão publicada antes de SUCCESS e prova visual no Chrome.
