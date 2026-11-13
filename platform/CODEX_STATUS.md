
## 2026-10-29 - SalesBot audio and Lobo Paraguaio quiz
Restored missing private salesbot-media bucket with workspace-scoped insert/read policies; verified real WAV upload/signed download, public denial and cleanup. No bot data or application auth changes. Added approved standalone public /quiz route, static document/styles/script, eight approved assets including supplied logo with transparent exterior. Full build and local production runtime checks passed; full browser path and group URL verified. Publishing to existing saude-slim-web service; no new dependencies/infrastructure. Scoped details: docs/tasks/2026-10-29-salesbot-media-storage.md and docs/tasks/2026-10-29-lobo-paraguaio-quiz.md.

## 2026-10-30 - Saúde Slim visual identity
Owner supplied logo and offer artwork. Added shared black/cyan/pink tokens and brand stylesheet for all application pages plus quiz. Replaced sidebar/auth/favicon branding, restored Saúde Slim name in quiz, and replaced offer image and displayed options with R$299,99 / R$899,99 Pix. Three editorial expressions changed to thoughtful seriousness, preserving people and bodies. Existing handlers, membership, data, bots, group destination and ERP prices preserved. Validation and publication in progress; scope docs/tasks/2026-10-30-saude-slim-visual-identity.md.

Full npm run build passed (prebuild suites, client, SSR and Nitro). Quiz tested through all seven steps and result in browser, offer full artwork and current values confirmed, exact WhatsApp URL preserved, mobile portrait crop verified at 390px and viewport restored. Source diff in auth is limited to classes, logo tags and unused icon import; handlers unchanged. Browser login visual check and production deployment pending.

Compiled-runtime login checked on desktop/mobile with real environment configuration in memory; logo and controls visible and no horizontal overflow. Development-server dependency mismatch avoided by using the production Node bundle. No user login or protected-module E2E claimed. Publishing approved presentation changes only.

## Vanessa - 2026-10-31 - Persistent client gallery
Dedicated private Storage bucket vanessa-client-gallery in Vanessa's exclusive Supabase; nine supplied originals seeded. Root BFF exposes only validated active image paths; owner/admin membership and MFA are enforced for management. Gallery manager in Negociacoes uploads images and archives withdrawn photos without permanent deletion. No source customer data or integrations changed. Verified: root typecheck/build, native production build, 3 security tests, real owner listing 200, anonymous denial 403, invalid image 415, real upload 201/archive 200 with nine originals retained. Public UI verification pending this release.
Changed: server/client-gallery.mjs, server/client-gallery.test.mjs, server/full-platform.mjs, src/components/ClientPhotoGallery.tsx, platform/src/components/erp/VanessaGalleryManager.tsx, platform/src/routes/pedidos.tsx, this status file.

## Vanessa - 2026-10-31 - Property interest capture and final alignment
Property details now collect only name and WhatsApp before opening WhatsApp. Reuses the existing signed site-chat registration RPC, atomic phone deduplication, first pipeline stage and CRM automation dispatch. Start validates the published property and saves canonical context in the conversation. Direct card contact opens property details instead of bypassing capture. Removed public MRV tag and aligned all final CTA elements on the same center axis.
Validation: root typecheck/build, native build, three focused tests passed; real compiled endpoint start 200, nonexistent property 404, registration 200, correct exclusive pipeline/first stage and canonical property context confirmed. Own QA records removed. No active bot/stage automation exists and Evolution session is erro_qr; no WhatsApp delivery claimed. No dependencies or schema changes.
Changed: PropertyInterestForm, PropertyDetailDialog, PropertiesSection, FinalCTASection, index.css, property-interest test, native public vanessa-chat route, this status file.

## Vanessa · 2026-11-13 · Acesso compacto

Acesso interno em cartão único, com e-mail, senha, Avançar e recuperação. `/admin` conserva o tratamento das contas legadas. `/auth` respeita o destino interno solicitado e usa `/painel` como entrada padrão. A redefinição usa o evento de recuperação do Supabase com a proteção de sessão existente e oferece novo link quando o anterior expirou.

Arquivos: `src/components/auth/VanessaAccessCard.tsx`, `src/routes/auth.tsx`, `src/routes/login.tsx`, `src/routes/__root.tsx` e este registro. A verificação de autenticação passou em 11 casos e a árvore de rotas passou. A primeira compilação esbarrou na leitura de diretórios do Windows. A execução com acesso autorizado compilou o site público e seguiu para o sistema interno. A entrega de e-mail e a redefinição com a conta da Vanessa exigem validação em produção.

## Vanessa · 2026-11-13 · Menu inferior e verificação

Menu inferior com ícones da Vanessa e opções em sanfona. A Home oferece a Dashboard detalhada. O menu usa termos como Conversas, Imóveis e Origem dos leads. A entrada após o login mostra a verificação por cinco segundos e só libera conteúdo depois da validação real. O retorno de login ignora a rota legada `/login`, que não está disponível no domínio publicado.

Próximas etapas: páginas internas e Inbox na paleta Vanessa, Gestor de CRM, Cérebro da IA e Públicos. O Cérebro da IA usará as seis referências visuais enviadas em 13/11 para orientar volume, silhueta e divisão do modelo 3D. As regiões serão acionáveis e abrirão Informações, Documentos, Links, Promoções e Palavras proibidas, com preenchimento baseado no conteúdo já salvo.
Validação: 28 verificações de segurança passaram, incluindo o intervalo real de cinco segundos com sessão de teste, além de 11 verificações de autenticação e a árvore de 147 rotas.
Referência do menu recebida em 13/11: barra inferior escura inspirada no OSD do monitor AOC, com ícones alinhados, módulo ativo em vermelho e uma faixa acoplada para opções.

### Refinamento do acesso e da navegação

Cartão de acesso reduzido para até 304 px. A verificação após a senha ganhou um painel escuro com escudo, cadeado, barra de cinco segundos e indicação da validação da sessão. A recuperação e o autenticador continuam ligados ao fluxo de acesso existente.

A barra inferior é a navegação principal das páginas internas novas e reformuladas. A barra compacta tem efeito de vidro fumê e fica centralizada na largura dos cinco botões. A sanfona acompanha essa largura. O desenho dos cinco ícones combina formas próprias para Home, CRM, Gestão imobiliária, Configurações e Origem dos leads. Configurações gerais usa fundo branco, destaque vinho e seções horizontais acima do conteúdo, respeitando as permissões e os links existentes.

Arquivos: `src/components/auth/SlimSessionGate.tsx`, `src/components/auth/VanessaAccessCard.tsx`, `src/routes/auth.tsx`, `src/routes/login.tsx`, `src/styles.css`, `src/components/dashboard/AppSidebar.tsx`, `src/components/dashboard/VanessaIcons.tsx`, `src/styles/slim-shell.css`, `src/legacy/configuracoes.legacy.tsx`, `src/components/settings/RobustConfigSurface.tsx` e este registro.

### Inbox e Gestor de CRM

Inbox em branco, vinho e malva, incluindo lista, mensagens, controles, não lidos e cores das etiquetas legadas na tela. As conversas e atribuições continuam nos mesmos registros. O Gestor de CRM abre no Cérebro da IA e usa o serviço existente e o CRM da empresa ativa, com linguagem imobiliária. O modo Consultor disponibiliza apenas ferramentas de consulta.

Arquivos: `src/routes/inbox.tsx`, `src/styles.css`, `src/components/inbox/InboxPage.legacy.tsx`, `src/components/inbox/LeadProfilePanel.tsx`, `src/components/inbox/LeadWhatsappOrigin.tsx`, `src/routes/crm.agente-ia.tsx`, `src/components/ai-agent/AiAgentChat.tsx`, `src/lib/ai-agent/prompts.ts`, `src/lib/ai-agent/crm-tools.server.ts`, `src/routes/api/ai-agent/chat.ts` e este registro.

### Cérebro da IA em 3D

Modelo original inspirado nas referências de silhueta, volume e divisão por regiões. Arrastar gira o modelo e tocar uma região abre seu editor. Os botões das regiões também operam por teclado. Cada região é preenchida a partir das fontes ativas e palavras cadastradas. Os rascunhos de texto são independentes por região. As fontes e os termos usam o armazenamento que já existia.

Arquivos: `src/components/crm/BrainAtlas.tsx`, `src/routes/crm.agente-ia.tsx`, `src/styles.css` e este registro.

### Navegação e acabamento das páginas internas

Gestor de CRM movido do Cérebro da IA para o Funil de Vendas, ao lado de Automações. Tracking e Analytics abre Visão geral, Fontes, Eventos e UTMs e campanhas pela sanfona inferior. Configurações gerais, Integrações e Tutoriais usam a mesma superfície branca. A troca de e-mail faz parte da seção Equipe. Tutoriais abre um player escuro somente ao iniciar o vídeo. A Dashboard detalhada apresenta os indicadores e gráficos, e o painel de VGV e comissões fica em Gestão imobiliária.

Os botões de ação do sistema interno recebem reflexo sutil. Contornos e botões secundários usam uma superfície translúcida com desfoque. As cores de texto, ícones, foco e ações destrutivas mantêm os papéis existentes.

### Públicos · rotação de disparos

O formulário aceita até 50 frases e 50 intervalos em segundos, um por linha. As duas listas rodam em sequência independente. O intervalo histórico de 0,5 a 15 segundos segue disponível, com vírgula ou ponto para decimais. A fila atribui frase e intervalo a cada destinatário elegível na ordem do público, preserva a origem do WhatsApp, bloqueios de contato e deduplicação, e mantém o formato dos disparos antigos.

O teste local em PostgreSQL confirmou a sequência, as permissões, a origem de WhatsApp e a compatibilidade com a fila anterior. A migração foi aplicada ao banco exclusivo da Vanessa em 13/11. A leitura posterior confirmou os três campos da fila, a rotina de rotação e as permissões de execução esperadas.

Arquivos: `src/components/crm/SlimMassBroadcastPanel.tsx`, `src/components/crm/BroadcastRotationFields.tsx`, `src/lib/slim-broadcast-rotation.ts`, `src/lib/crm-audiences.functions.ts`, `src/lib/slim-audience-queue.functions.ts`, `src/lib/slim-audience-runtime.server.ts`, `supabase/migrations/20261113095700_vanessa_audience_rotation.sql`, `scripts/test-vanessa-audience-rotation.mjs` e este registro.
