import { createFileRoute, Link } from "@tanstack/react-router";
import { MouseGlow, NavBar } from "@/components/landing/shell";
import { Footer } from "@/components/landing/closing";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Serviço, Vanessa Simoni" },
      {
        name: "description",
        content:
          "Termos de Serviço da Vanessa Simoni: condições de uso da plataforma, planos, pagamentos, propriedade intelectual, responsabilidades e cancelamento.",
      },
      { property: "og:title", content: "Termos de Serviço, Vanessa Simoni" },
      {
        property: "og:description",
        content:
          "Condições de uso da plataforma Vanessa Simoni, assinatura, pagamentos, obrigações, limites de responsabilidade e cancelamento.",
      },
      { property: "og:url", content: "https://saudeslim.com.br/termos" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://saudeslim.com.br/termos" }],
  }),
  component: TermsPage,
});

const LAST_UPDATE = "02 de julho de 2026";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-white/8 py-10">
      <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-white">
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-white/70">{children}</div>
    </section>
  );
}

function TermsPage() {
  const toc = [
    ["1", "aceitacao", "Aceitação dos termos"],
    ["2", "definicoes", "Definições"],
    ["3", "cadastro", "Cadastro e conta"],
    ["4", "planos", "Planos, trial e assinatura"],
    ["5", "pagamentos", "Pagamentos, reembolso e inadimplência"],
    ["6", "uso", "Uso aceitável da plataforma"],
    ["7", "conteudo", "Conteúdo do cliente e licenças"],
    ["8", "integracoes", "Integrações com terceiros"],
    ["9", "propriedade", "Propriedade intelectual"],
    ["10", "privacidade", "Privacidade e proteção de dados"],
    ["11", "disponibilidade", "Disponibilidade, suporte e SLA"],
    ["12", "responsabilidade", "Limitação de responsabilidade"],
    ["13", "indenizacao", "Indenização"],
    ["14", "rescisao", "Rescisão e suspensão"],
    ["15", "alteracoes", "Alterações destes termos"],
    ["16", "lei", "Lei aplicável e foro"],
    ["17", "contato", "Contato"],
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
              Termos de Serviço
            </h1>
            <p className="mt-4 text-white/60 max-w-3xl">
              Estes Termos de Serviço (“Termos”) regem o uso do site{" "}
              <a href="https://saudeslim.com.br" className="text-[#a855f7] hover:underline">saudeslim.com.br</a>{" "}
              e da plataforma <strong className="text-white">Vanessa Simoni</strong>. Ao criar uma conta,
              acessar ou contratar qualquer plano, você concorda integralmente com estes Termos e
              com a nossa{" "}
              <Link to="/privacidade" className="text-[#a855f7] hover:underline">
                Política de Privacidade
              </Link>
              .
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

            <Section id="aceitacao" title="1. Aceitação dos termos">
              <p>
                Ao se cadastrar, contratar um plano ou utilizar qualquer funcionalidade da
                Vanessa Simoni, você declara ter lido, compreendido e aceitado estes Termos, bem como
                todas as políticas neles referenciadas. Se você contrata em nome de uma pessoa
                jurídica, declara ter poderes suficientes para vinculá-la.
              </p>
              <p>
                Caso não concorde com qualquer disposição, você deve deixar de usar a
                plataforma imediatamente.
              </p>
            </Section>

            <Section id="definicoes" title="2. Definições">
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong className="text-white">Vanessa Simoni:</strong> plataforma de marketing, vendas,
                  atendimento e automação, seus subdomínios, aplicativos e APIs.
                </li>
                <li>
                  <strong className="text-white">Cliente:</strong> pessoa física ou jurídica que
                  contrata a Vanessa Simoni.
                </li>
                <li>
                  <strong className="text-white">Usuário:</strong> qualquer pessoa autorizada
                  pelo Cliente a acessar sua conta (ex.: funcionários, parceiros).
                </li>
                <li>
                  <strong className="text-white">Workspace:</strong> ambiente isolado da conta do
                  Cliente, contendo seus dados, integrações e configurações.
                </li>
                <li>
                  <strong className="text-white">Conteúdo do Cliente:</strong> dados inseridos,
                  importados, integrados ou gerados pelo Cliente e seus Usuários dentro do
                  Workspace.
                </li>
              </ul>
            </Section>

            <Section id="cadastro" title="3. Cadastro e conta">
              <p>
                Para usar a Vanessa Simoni é necessário criar uma conta fornecendo informações verdadeiras,
                completas e atualizadas (nome, CPF/CNPJ, e-mail, WhatsApp, empresa e nicho). Você
                é responsável pela guarda das credenciais e por todas as atividades realizadas
                na sua conta e nas contas dos Usuários que autorizar.
              </p>
              <p>
                Você deve notificar imediatamente a Vanessa Simoni em caso de uso não autorizado ou
                violação de segurança. Reservamo-nos o direito de suspender ou encerrar contas
                com dados falsos, incompletos ou utilizadas para fins ilícitos.
              </p>
            </Section>

            <Section id="planos" title="4. Planos, trial e assinatura">
              <p>
                A Vanessa Simoni é oferecida em planos com diferentes limites de empresas, Usuários e
                módulos ativos. Os planos vigentes, valores e condições são apresentados dentro
                da plataforma após o cadastro.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong className="text-white">Trial:</strong> novos Clientes podem
                  experimentar a plataforma por até 20 (vinte) dias, sem necessidade de cartão
                  de crédito. Ao final do trial, a conta pode ser convertida em plano pago ou
                  desativada.
                </li>
                <li>
                  <strong className="text-white">Recorrência:</strong> planos pagos são cobrados
                  em ciclos mensais ou anuais, com renovação automática, salvo cancelamento pelo
                  Cliente antes do próximo ciclo.
                </li>
                <li>
                  <strong className="text-white">Upgrade e downgrade:</strong> podem ser
                  realizados a qualquer momento; ajustes proporcionais são aplicados no ciclo
                  vigente ou no próximo, conforme o caso.
                </li>
              </ul>
            </Section>

            <Section id="pagamentos" title="5. Pagamentos, reembolso e inadimplência">
              <p>
                Pagamentos com cartão de crédito são processados pela Stripe. Pagamentos via
                Pix e boleto (Brasil) são processados pela Cora. A Vanessa Simoni não armazena dados
                completos de cartão.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong className="text-white">Reembolso:</strong> por se tratar de serviço
                  digital de utilização imediata, valores pagos por ciclos já iniciados não são
                  reembolsáveis, salvo obrigação legal em contrário. O trial gratuito supre o
                  direito de arrependimento previsto no art. 49 do CDC.
                </li>
                <li>
                  <strong className="text-white">Inadimplência:</strong> em caso de falha de
                  pagamento, o acesso pode ser suspenso após aviso prévio. Após 30 dias de
                  inadimplência, a conta pode ser cancelada e o Conteúdo do Cliente excluído
                  conforme a Política de Privacidade.
                </li>
                <li>
                  <strong className="text-white">Reajuste:</strong> valores podem ser
                  reajustados anualmente pelo IPCA ou índice equivalente, mediante comunicação
                  prévia de 30 dias.
                </li>
              </ul>
            </Section>

            <Section id="uso" title="6. Uso aceitável da plataforma">
              <p>O Cliente e seus Usuários se comprometem a NÃO:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Utilizar a plataforma para fins ilícitos, fraudulentos ou enganosos.</li>
                <li>
                  Enviar spam, mensagens não solicitadas ou conteúdo que viole a LGPD, a Lei do
                  Marketing Direto, políticas do WhatsApp, Meta, Google ou TikTok.
                </li>
                <li>
                  Comercializar bases de dados de terceiros sem consentimento válido dos
                  titulares.
                </li>
                <li>
                  Fazer engenharia reversa, descompilar, tentar burlar limites técnicos, obter
                  acesso não autorizado ou realizar testes de intrusão sem autorização por
                  escrito.
                </li>
                <li>
                  Revender, sublicenciar ou disponibilizar acessos a terceiros fora do próprio
                  Workspace.
                </li>
                <li>
                  Utilizar a plataforma para promoção de discurso de ódio, violência, pornografia
                  infantil, jogos ilegais, produtos proibidos ou qualquer prática que infrinja
                  direitos de terceiros.
                </li>
              </ul>
              <p>
                A Vanessa Simoni pode suspender imediatamente contas em caso de violação, sem prejuízo
                das medidas legais cabíveis.
              </p>
            </Section>

            <Section id="conteudo" title="7. Conteúdo do cliente e licenças">
              <p>
                Todo Conteúdo do Cliente permanece de propriedade exclusiva do Cliente. Ao
                utilizar a plataforma, o Cliente concede à Vanessa Simoni uma licença limitada, não
                exclusiva e revogável para armazenar, processar, transmitir, exibir e realizar
                backup do Conteúdo com o único propósito de operar e melhorar os serviços
                contratados.
              </p>
              <p>
                O Cliente é o único responsável pela legalidade, precisão e adequação do
                Conteúdo, bem como por obter todas as autorizações necessárias dos titulares
                dos dados.
              </p>
            </Section>

            <Section id="integracoes" title="8. Integrações com terceiros">
              <p>
                A Vanessa Simoni oferece integrações com plataformas de terceiros (Meta, Google, TikTok,
                HubSpot, RD Station, WhatsApp Cloud API, Evolution API, OpenAI, Gemini,
                Stripe, Cora, entre outras). O uso dessas integrações está sujeito aos termos e
                políticas dos respectivos provedores. A Vanessa Simoni não se responsabiliza por
                indisponibilidade, mudanças de API, revogação de tokens ou alterações nos termos
                de terceiros.
              </p>
            </Section>

            <Section id="propriedade" title="9. Propriedade intelectual">
              <p>
                Todos os direitos sobre a plataforma Vanessa Simoni, incluindo software, marcas,
                logotipos, layouts, textos, imagens, código-fonte, algoritmos de IA proprietários
                e documentação, pertencem à Vanessa Simoni ou aos seus licenciantes. Nada nestes Termos
                transfere ao Cliente qualquer direito de propriedade intelectual, exceto a
                licença de uso limitada, pessoal e intransferível durante a vigência do
                contrato.
              </p>
            </Section>

            <Section id="privacidade" title="10. Privacidade e proteção de dados">
              <p>
                O tratamento de dados pessoais é regido pela nossa{" "}
                <Link to="/privacidade" className="text-[#a855f7] hover:underline">
                  Política de Privacidade
                </Link>
                , que integra estes Termos. Nas situações em que a Vanessa Simoni atua como Operadora,
                aplicam-se as cláusulas de tratamento previstas na LGPD e no GDPR, sendo
                observado o isolamento estrito entre Workspaces.
              </p>
            </Section>

            <Section id="disponibilidade" title="11. Disponibilidade, suporte e SLA">
              <p>
                A Vanessa Simoni envida os melhores esforços para manter a plataforma disponível 24x7,
                com meta de disponibilidade mensal de 99,5% (excluídas janelas de manutenção
                programada e eventos de força maior).
              </p>
              <p>
                O suporte é prestado por chat e e-mail em português, em horário comercial (dias
                úteis, das 09h às 18h, fuso de Brasília). Planos superiores podem contar com
                atendimento prioritário e/ou dedicado, conforme descrição do plano.
              </p>
            </Section>

            <Section id="responsabilidade" title="12. Limitação de responsabilidade">
              <p>
                Na máxima extensão permitida por lei, a Vanessa Simoni não será responsável por:
                (i) lucros cessantes; (ii) perda de receita, oportunidade de negócio ou
                reputação; (iii) danos indiretos ou consequenciais; (iv) atos ou omissões de
                terceiros integrados; (v) uso indevido da plataforma pelo Cliente ou seus
                Usuários; (vi) indisponibilidades causadas por caso fortuito, força maior, falhas
                de internet ou de provedores de terceiros.
              </p>
              <p>
                A responsabilidade agregada da Vanessa Simoni, por qualquer causa, fica limitada ao
                total efetivamente pago pelo Cliente nos 12 (doze) meses anteriores ao evento
                que originou a responsabilidade.
              </p>
            </Section>

            <Section id="indenizacao" title="13. Indenização">
              <p>
                O Cliente se compromete a indenizar e manter a Vanessa Simoni, seus sócios, funcionários
                e parceiros, isentos de quaisquer reclamações, perdas, danos, custos e despesas
                (incluindo honorários advocatícios razoáveis) decorrentes de: (i) violação
                destes Termos; (ii) violação de leis aplicáveis; (iii) violação de direitos de
                terceiros; (iv) Conteúdo do Cliente inserido na plataforma.
              </p>
            </Section>

            <Section id="rescisao" title="14. Rescisão e suspensão">
              <p>
                O Cliente pode cancelar sua assinatura a qualquer momento diretamente na
                plataforma, sem multa. O cancelamento é efetivado ao final do ciclo pago, sem
                direito a reembolso proporcional.
              </p>
              <p>
                A Vanessa Simoni pode suspender ou rescindir o acesso, sem aviso prévio, em caso de:
                (i) violação destes Termos; (ii) risco à segurança da plataforma ou de terceiros;
                (iii) ordem judicial; (iv) inadimplência superior a 30 dias.
              </p>
              <p>
                Após o encerramento, o Conteúdo do Cliente será excluído nos prazos previstos
                na Política de Privacidade, salvo quando a lei exigir retenção adicional.
              </p>
            </Section>

            <Section id="alteracoes" title="15. Alterações destes termos">
              <p>
                A Vanessa Simoni pode atualizar estes Termos periodicamente. Alterações materiais serão
                comunicadas por e-mail e/ou aviso na plataforma com antecedência mínima de 15
                (quinze) dias. O uso continuado após a vigência das alterações constitui aceite.
              </p>
            </Section>

            <Section id="lei" title="16. Lei aplicável e foro">
              <p>
                Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica
                eleito o foro da Comarca do Rio de Janeiro/RJ como competente para dirimir
                quaisquer controvérsias, com renúncia expressa a qualquer outro, por mais
                privilegiado que seja.
              </p>
            </Section>

            <Section id="contato" title="17. Contato">
              <p>
                Dúvidas, solicitações ou notificações relativas a estes Termos devem ser
                enviadas para{" "}
                <a href="mailto:contato@saudeslim.com.br" className="text-[#a855f7] hover:underline">
                  contato@saudeslim.com.br
                </a>
                . Assuntos relacionados a privacidade e dados pessoais:{" "}
                <a href="mailto:privacidade@saudeslim.com.br" className="text-[#a855f7] hover:underline">
                  privacidade@saudeslim.com.br
                </a>
                .
              </p>
              <p>
                <strong className="text-white">Vanessa Simoni</strong>, Rio de Janeiro/RJ, Brasil.
              </p>
            </Section>

            <div className="mt-12 flex flex-wrap gap-3">
              <Link to="/" className="ml-btn-ghost !py-3 !text-[12px]">
                Voltar à página inicial
              </Link>
              <Link to="/privacidade" className="ml-btn-ghost !py-3 !text-[12px]">
                Ver Política de Privacidade
              </Link>
              <a href="mailto:contato@saudeslim.com.br" className="ml-btn-primary !py-3 !text-[12px]">
                Falar com a Vanessa Simoni
              </a>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
