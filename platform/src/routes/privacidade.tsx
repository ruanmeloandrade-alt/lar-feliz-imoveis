import { createFileRoute, Link } from "@tanstack/react-router";
import { MouseGlow, NavBar } from "@/components/landing/shell";
import { Footer } from "@/components/landing/closing";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade, Vanessa Simoni" },
      {
        name: "description",
        content:
          "Política de Privacidade da Vanessa Simoni: como coletamos, usamos, armazenamos e protegemos dados pessoais em conformidade com a LGPD, GDPR e políticas de Meta, Google e TikTok.",
      },
      { property: "og:title", content: "Política de Privacidade, Vanessa Simoni" },
      {
        property: "og:description",
        content:
          "Como a Vanessa Simoni trata dados pessoais, cookies, integrações com Meta, Google, TikTok e direitos do titular.",
      },
      { property: "og:url", content: "https://saudeslim.com.br/privacidade" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://saudeslim.com.br/privacidade" }],
  }),
  component: PrivacyPage,
});

const LAST_UPDATE = "02 de julho de 2026";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-white/8 py-10">
      <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-white">
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-white/70">
        {children}
      </div>
    </section>
  );
}

function PrivacyPage() {
  const toc = [
    ["1", "quem-somos", "Quem somos e escopo"],
    ["2", "dados-coletados", "Dados que coletamos"],
    ["3", "como-usamos", "Como usamos seus dados"],
    ["4", "bases-legais", "Bases legais de tratamento"],
    ["5", "compartilhamento", "Compartilhamento e subprocessadores"],
    ["6", "integracoes", "Integrações com Meta, Google, TikTok e outras plataformas"],
    ["7", "cookies", "Cookies e tecnologias de rastreamento"],
    ["8", "retencao", "Retenção e exclusão de dados"],
    ["9", "seguranca", "Segurança da informação"],
    ["10", "direitos", "Seus direitos como titular"],
    ["11", "criancas", "Crianças e adolescentes"],
    ["12", "transferencias", "Transferências internacionais"],
    ["13", "alteracoes", "Alterações desta política"],
    ["14", "contato", "Encarregado (DPO) e contato"],
  ] as const;

  return (
    <div className="mkton-landing relative min-h-screen bg-[#050505] text-white">
      <MouseGlow />
      <NavBar />
      <main className="relative z-10 pt-32 pb-20">
        <div className="mx-auto max-w-[1100px] px-6">
          <div className="ml-card p-8 md:p-12">
            <span className="ml-chip ml-chip-neon">Documento legal</span>
            <h1 className="font-display font-bold text-4xl md:text-5xl tracking-tight mt-5">
              Política de Privacidade
            </h1>
            <p className="mt-4 text-white/60 max-w-3xl">
              Esta Política descreve como a <strong className="text-white">Vanessa Simoni</strong> coleta,
              utiliza, compartilha, armazena e protege dados pessoais tratados por meio do site{" "}
              <a href="https://saudeslim.com.br" className="text-[#a855f7] hover:underline">saudeslim.com.br</a>{" "}
              e da plataforma Vanessa Simoni, em conformidade com a Lei Geral de Proteção de Dados
              (Lei 13.709/2018, LGPD), com o Regulamento Geral de Proteção de Dados da União
              Europeia (GDPR) e com as políticas de plataforma da Meta, Google e TikTok.
            </p>
            <p className="mt-3 font-tech text-[11px] uppercase text-white/40">
              Última atualização: {LAST_UPDATE}
            </p>

            <nav className="mt-10 grid gap-2 md:grid-cols-2 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
              <div className="md:col-span-2 font-tech text-[11px] uppercase text-white/40 mb-1">
                Índice
              </div>
              {toc.map(([n, id, t]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="text-sm text-white/70 hover:text-[#a855f7] transition-colors"
                >
                  <span className="text-white/40 mr-2">{n}.</span>
                  {t}
                </a>
              ))}
            </nav>

            <Section id="quem-somos" title="1. Quem somos e escopo">
              <p>
                A Vanessa Simoni (“Vanessa Simoni”, “nós”, “nossa plataforma”) é uma plataforma de marketing,
                vendas, atendimento e automação para empresas. Operamos como{" "}
                <strong className="text-white">Controladora</strong> em relação aos dados dos
                visitantes do site institucional e dos clientes que contratam a plataforma, e
                como <strong className="text-white">Operadora</strong> em relação aos dados que
                nossos clientes tratam dentro de seus próprios workspaces (por exemplo, leads
                importados via CRM, mensagens de WhatsApp, contatos de campanhas).
              </p>
              <p>
                Esta política aplica-se ao site saudeslim.com.br, subdomínios, painel administrativo,
                integrações oficiais, APIs, comunicações transacionais e materiais de marketing
                da Vanessa Simoni.
              </p>
            </Section>

            <Section id="dados-coletados" title="2. Dados que coletamos">
              <p>Coletamos apenas os dados necessários para operar a plataforma:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong className="text-white">Dados de cadastro:</strong> nome completo, CPF
                  ou documento equivalente, e-mail, WhatsApp/telefone, empresa, nicho, cargo,
                  Instagram e site profissional.
                </li>
                <li>
                  <strong className="text-white">Dados de autenticação:</strong> senha
                  criptografada, tokens de sessão, registros de login e endereço IP.
                </li>
                <li>
                  <strong className="text-white">Dados de faturamento:</strong> plano contratado,
                  histórico de assinatura, dados fiscais e status de pagamento. Dados de cartão
                  de crédito são processados diretamente pela Stripe; a Vanessa Simoni não armazena números
                  completos de cartão.
                </li>
                <li>
                  <strong className="text-white">Dados operacionais:</strong> leads, contatos,
                  mensagens, mídias, campanhas, métricas, notas e demais registros inseridos por
                  você ou por sua equipe na plataforma.
                </li>
                <li>
                  <strong className="text-white">Dados de integração:</strong> tokens OAuth,
                  chaves de API e identificadores de conta das plataformas conectadas (Meta,
                  Google, TikTok, HubSpot, RD Station, WhatsApp Cloud API, Evolution API,
                  OpenAI, entre outras).
                </li>
                <li>
                  <strong className="text-white">Dados de navegação:</strong> páginas visitadas,
                  cliques, tempo de sessão, dispositivo, sistema operacional, navegador,
                  referenciador e cookies (ver Seção 7).
                </li>
              </ul>
            </Section>

            <Section id="como-usamos" title="3. Como usamos seus dados">
              <ul className="list-disc pl-6 space-y-2">
                <li>Criar, autenticar e manter sua conta e a de seus usuários.</li>
                <li>Fornecer, operar e melhorar as funcionalidades da plataforma.</li>
                <li>Processar pagamentos, emitir notas fiscais e prevenir fraudes.</li>
                <li>Prestar suporte técnico e responder a solicitações.</li>
                <li>
                  Enviar comunicações transacionais (segurança, faturamento, mudanças no
                  serviço) e, com sua permissão, comunicações de marketing.
                </li>
                <li>Cumprir obrigações legais, regulatórias, contratuais e fiscais.</li>
                <li>
                  Executar rotinas de agregação e anonimização para fins estatísticos e de
                  produto.
                </li>
              </ul>
            </Section>

            <Section id="bases-legais" title="4. Bases legais de tratamento">
              <p>
                Tratamos dados com base em: execução de contrato, cumprimento de obrigação
                legal, exercício regular de direitos, legítimo interesse (equilibrado com seus
                direitos) e consentimento (para marketing direto, cookies não essenciais e
                integrações que você habilita voluntariamente). Você pode revogar o
                consentimento a qualquer momento.
              </p>
            </Section>

            <Section id="compartilhamento" title="5. Compartilhamento e subprocessadores">
              <p>Compartilhamos dados apenas quando estritamente necessário, com:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong className="text-white">Infraestrutura em nuvem:</strong> Cloudflare,
                  Supabase, provedores de armazenamento e CDN.
                </li>
                <li>
                  <strong className="text-white">Pagamentos:</strong> Stripe (cartão internacional
                  e recorrência) e Cora (Pix e boleto no Brasil).
                </li>
                <li>
                  <strong className="text-white">Comunicação:</strong> provedores de e-mail
                  transacional e envio de mensagens via WhatsApp.
                </li>
                <li>
                  <strong className="text-white">Analytics e observabilidade:</strong> ferramentas
                  agregadas para métricas de uso, logs e correção de erros.
                </li>
                <li>
                  <strong className="text-white">IA:</strong> provedores como OpenAI e Google
                  Gemini, quando você opta por utilizar funcionalidades de inteligência
                  artificial.
                </li>
                <li>
                  <strong className="text-white">Autoridades:</strong> quando exigido por lei,
                  ordem judicial ou requisição regulatória.
                </li>
              </ul>
              <p>
                Nenhum dado é vendido a terceiros. Cada workspace é isolado, dados de um
                cliente nunca são acessíveis a outro cliente.
              </p>
            </Section>

            <Section
              id="integracoes"
              title="6. Integrações com Meta, Google, TikTok e outras plataformas"
            >
              <p>
                Quando você conecta uma conta externa à Vanessa Simoni, seguimos os termos das respectivas
                plataformas:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong className="text-white">Meta (Facebook, Instagram, WhatsApp):</strong>{" "}
                  respeitamos a{" "}
                  <a
                    href="https://developers.facebook.com/terms/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#a855f7] hover:underline"
                  >
                    Política da Plataforma Meta
                  </a>
                  , o{" "}
                  <a
                    href="https://www.whatsapp.com/legal/business-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#a855f7] hover:underline"
                  >
                    WhatsApp Business Policy
                  </a>{" "}
                  e as diretrizes de uso da Marketing API. Utilizamos tokens OAuth com os escopos
                  mínimos necessários para leitura de campanhas, insights, envio de mensagens e
                  gerenciamento de anúncios autorizados por você. Você pode revogar o acesso a
                  qualquer momento nas configurações do Business Manager.
                </li>
                <li>
                  <strong className="text-white">Google (Ads, Analytics, YouTube):</strong>{" "}
                  aderimos à{" "}
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#a855f7] hover:underline"
                  >
                    Google API Services User Data Policy
                  </a>
                  , incluindo os Requisitos de Uso Limitado. Dados obtidos via APIs do Google não
                  são usados para publicidade direcionada de terceiros, revenda ou treinamento
                  de modelos generalistas.
                </li>
                <li>
                  <strong className="text-white">TikTok (Business, Ads, Marketing API):</strong>{" "}
                  seguimos os{" "}
                  <a
                    href="https://ads.tiktok.com/marketing_api/homepage"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#a855f7] hover:underline"
                  >
                    Termos da TikTok Marketing API
                  </a>{" "}
                  e usamos os dados apenas para exibir métricas, gerenciar campanhas e otimizar
                  performance dentro do seu próprio workspace.
                </li>
                <li>
                  <strong className="text-white">CRMs e outras integrações</strong> (
                  HubSpot, RD Station, Stripe, Cora, OpenAI, Gemini, Evolution API): utilizamos
                  as credenciais fornecidas apenas para operar as funções contratadas pelo
                  cliente que as configurou.
                </li>
              </ul>
              <p>
                A Vanessa Simoni nunca compartilha dados obtidos de uma plataforma com outra sem
                instrução explícita do titular do workspace.
              </p>
            </Section>

            <Section id="cookies" title="7. Cookies e tecnologias de rastreamento">
              <p>
                Utilizamos cookies essenciais (sessão, segurança e preferências) e, mediante
                consentimento, cookies analíticos e de marketing. Você pode gerenciar cookies
                nas configurações do navegador. Cookies essenciais não podem ser desativados,
                pois são necessários para o funcionamento da plataforma.
              </p>
            </Section>

            <Section id="retencao" title="8. Retenção e exclusão de dados">
              <p>
                Retemos dados enquanto sua conta estiver ativa e pelo prazo necessário para
                cumprir obrigações legais, fiscais e contratuais. Após o encerramento da conta,
                dados operacionais são excluídos ou anonimizados em até 90 dias, exceto quando a
                lei exigir retenção adicional (por exemplo, registros fiscais por 5 anos).
                Backups criptografados podem ser mantidos por até 30 dias antes da purga
                automática.
              </p>
            </Section>

            <Section id="seguranca" title="9. Segurança da informação">
              <ul className="list-disc pl-6 space-y-2">
                <li>Criptografia AES-256 em repouso e TLS 1.3 em tr-nsito.</li>
                <li>Autenticação forte, senhas com hash e suporte a 2FA.</li>
                <li>Permissões granulares por usuário, papel, IP e horário.</li>
                <li>Logs auditáveis de acesso e ações críticas.</li>
                <li>Backups automáticos a cada 6 horas com retenção de 30 dias.</li>
                <li>Isolamento estrito multi-tenant entre workspaces.</li>
                <li>Monitoramento contínuo, testes periódicos e resposta a incidentes.</li>
              </ul>
              <p>
                Em caso de incidente de segurança que possa acarretar risco relevante aos
                titulares, notificaremos a ANPD e os titulares afetados nos prazos exigidos pela
                LGPD.
              </p>
            </Section>

            <Section id="direitos" title="10. Seus direitos como titular">
              <p>Nos termos da LGPD e do GDPR, você tem direito a:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Confirmar a existência de tratamento e acessar seus dados.</li>
                <li>Corrigir dados incompletos, inexatos ou desatualizados.</li>
                <li>
                  Solicitar anonimização, bloqueio ou eliminação de dados desnecessários ou
                  tratados em desconformidade.
                </li>
                <li>Portar seus dados para outro fornecedor.</li>
                <li>Revogar consentimento e opor-se a tratamentos com base em legítimo interesse.</li>
                <li>Solicitar revisão de decisões automatizadas que afetem seus interesses.</li>
                <li>Peticionar perante a Autoridade Nacional de Proteção de Dados (ANPD).</li>
              </ul>
              <p>
                Solicitações devem ser enviadas para{" "}
                <a href="mailto:privacidade@saudeslim.com.br" className="text-[#a855f7] hover:underline">
                  privacidade@saudeslim.com.br
                </a>{" "}
                e serão respondidas em até 15 dias.
              </p>
            </Section>

            <Section id="criancas" title="11. Crianças e adolescentes">
              <p>
                A Vanessa Simoni não é direcionada a menores de 18 anos e não coleta intencionalmente
                dados de crianças ou adolescentes. Caso identifiquemos coleta indevida,
                excluiremos os dados imediatamente.
              </p>
            </Section>

            <Section id="transferencias" title="12. Transferências internacionais">
              <p>
                Alguns subprocessadores estão localizados fora do Brasil (por exemplo, Stripe,
                Cloudflare, OpenAI). Ao contratar tais fornecedores, adotamos salvaguardas
                contratuais adequadas, como Cláusulas Padrão de Proteção e mecanismos previstos
                no art. 33 da LGPD e no Capítulo V do GDPR.
              </p>
            </Section>

            <Section id="alteracoes" title="13. Alterações desta política">
              <p>
                Podemos atualizar esta Política periodicamente. Mudanças materiais serão
                comunicadas por e-mail e/ou aviso destacado na plataforma com antecedência
                razoável. A versão vigente sempre estará disponível nesta página com a data da
                última atualização.
              </p>
            </Section>

            <Section id="contato" title="14. Encarregado (DPO) e contato">
              <p>
                <strong className="text-white">Encarregado pelo Tratamento de Dados (DPO):</strong>{" "}
                Ruan Andrade
                <br />
                E-mail:{" "}
                <a href="mailto:privacidade@saudeslim.com.br" className="text-[#a855f7] hover:underline">
                  privacidade@saudeslim.com.br
                </a>
                <br />
                Suporte geral:{" "}
                <a href="mailto:contato@saudeslim.com.br" className="text-[#a855f7] hover:underline">
                  contato@saudeslim.com.br
                </a>
                <br />
                Endereço: Rio de Janeiro, RJ, Brasil.
              </p>
              <p>
                Para exercer direitos, relatar incidentes ou tirar dúvidas sobre esta política,
                utilize os canais acima.
              </p>
            </Section>

            <div className="mt-12 flex flex-wrap gap-3">
              <Link to="/" className="ml-btn-ghost !py-3 !text-[12px]">
                Voltar à página inicial
              </Link>
              <a
                href="mailto:privacidade@saudeslim.com.br"
                className="ml-btn-primary !py-3 !text-[12px]"
              >
                Falar com o DPO
              </a>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
