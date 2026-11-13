
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
