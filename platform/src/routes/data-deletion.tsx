import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail, Trash2, ShieldCheck, Clock, FileText } from "lucide-react";

export const Route = createFileRoute("/data-deletion")({
  head: () => ({
    meta: [
      { title: "Exclusão de Dados | Vanessa Simoni" },
      {
        name: "description",
        content:
          "Solicite a exclusão dos seus dados pessoais da plataforma Vanessa Simoni. Instruções completas conforme LGPD, GDPR e políticas de Meta, Google e TikTok.",
      },
      { property: "og:title", content: "Exclusão de Dados | Vanessa Simoni" },
      {
        property: "og:description",
        content:
          "Como solicitar a exclusão dos seus dados na Vanessa Simoni, processo, prazos e canais de contato.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: DataDeletionPage,
});

const CONTACT_EMAIL = "privacidade@mkton.io";
const SUPPORT_EMAIL = "suporte@mkton.io";

function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="absolute inset-x-0 top-0 h-[500px] bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.12),transparent_70%)]" />

      <header className="relative border-b border-white/8">
        <div className="mx-auto flex max-w-[900px] items-center justify-between px-6 py-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao site
          </Link>
          <span className="font-tech text-[10px] uppercase tracking-widest text-white/40">
            Vanessa Simoni · Data Deletion
          </span>
        </div>
      </header>

      <main className="relative mx-auto max-w-[900px] px-6 py-16 md:py-24">
        <div className="mb-14">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#a855f7]/30 bg-[#a855f7]/10 px-3 py-1 font-tech text-[10px] uppercase tracking-widest text-[#a855f7]">
            <Trash2 className="h-3 w-3" />
            Exclusão de dados
          </span>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight md:text-6xl">
            Solicitação de exclusão de dados
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-white/60 leading-relaxed">
            Esta página é mantida pela Vanessa Simoni para explicar como você pode solicitar
            a exclusão dos seus dados pessoais da nossa plataforma, incluindo dados
            obtidos por meio de integrações com Meta, Google e TikTok.
          </p>
          <p className="mt-4 font-tech text-[11px] uppercase text-white/40">
            Última atualização: 03 de julho de 2026
          </p>
        </div>

        <section className="mb-12 rounded-2xl border border-white/10 bg-white/[0.02] p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-xl border border-[#a855f7]/30 bg-[#a855f7]/10 p-3">
              <ShieldCheck className="h-5 w-5 text-[#a855f7]" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold">Seus direitos</h2>
              <p className="mt-3 text-white/70 leading-relaxed">
                Nos termos da <strong>LGPD (Lei 13.709/2018)</strong>, do{" "}
                <strong>GDPR</strong> e das políticas de plataformas parceiras (Meta,
                Google, TikTok), você tem o direito de solicitar, a qualquer momento
                e sem custo, a exclusão dos seus dados pessoais tratados pela Vanessa Simoni.
              </p>
            </div>
          </div>
        </section>

        <Section n="01" title="Como solicitar a exclusão">
          <p>
            Você pode solicitar a exclusão dos seus dados de duas formas:
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <div className="font-tech text-[10px] uppercase text-[#a855f7]">
                Opção 1 · Dentro da plataforma
              </div>
              <div className="mt-3 font-display text-lg font-semibold">
                Excluir minha conta
              </div>
              <p className="mt-2 text-sm text-white/60 leading-relaxed">
                Acesse <strong>Configurações → Conta → Excluir conta</strong> dentro
                da Vanessa Simoni. A exclusão é iniciada imediatamente após a confirmação.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <div className="font-tech text-[10px] uppercase text-[#a855f7]">
                Opção 2 · Por e-mail
              </div>
              <div className="mt-3 font-display text-lg font-semibold">
                Enviar solicitação
              </div>
              <p className="mt-2 text-sm text-white/60 leading-relaxed">
                Envie um e-mail para{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o%20de%20dados`}
                  className="text-[#a855f7] hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>{" "}
                com o assunto "Exclusão de dados".
              </p>
            </div>
          </div>
        </Section>

        <Section n="02" title="Informações necessárias">
          <p>Para localizar e excluir seus dados com segurança, precisamos de:</p>
          <ul className="mt-4 space-y-2">
            {[
              "Nome completo cadastrado na plataforma",
              "E-mail utilizado no cadastro",
              "WhatsApp cadastrado (se aplicável)",
              "Nome da empresa (se aplicável)",
              "Motivo da solicitação (opcional)",
              "Se a solicitação envolve dados de integrações (Meta, Google, TikTok, etc.)",
            ].map((x) => (
              <li key={x} className="flex items-start gap-2 text-white/70">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#a855f7]" />
                {x}
              </li>
            ))}
          </ul>
        </Section>

        <Section n="03" title="Prazo de processamento">
          <div className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <Clock className="h-5 w-5 shrink-0 text-[#a855f7]" />
            <div>
              <div className="font-display text-lg font-semibold">Até 15 dias úteis</div>
              <p className="mt-2 text-sm text-white/60 leading-relaxed">
                Sua solicitação é processada em até <strong>15 dias úteis</strong> a
                partir da confirmação da identidade. Você receberá uma confirmação por
                e-mail quando a exclusão for concluída.
              </p>
            </div>
          </div>
        </Section>

        <Section n="04" title="O que é excluído">
          <ul className="space-y-2">
            {[
              "Dados de perfil (nome, e-mail, WhatsApp, CPF, empresa)",
              "Leads, contatos e pipelines armazenados no CRM MKTOn",
              "Mensagens, conversas e histórico de atendimento",
              "Campanhas, criativos e materiais enviados",
              "Configurações, preferências e chaves de integração",
              "Tokens OAuth do Meta, Google e TikTok",
              "Dados obtidos via integrações com plataformas parceiras",
              "Logs de acesso e telemetria vinculados à conta",
            ].map((x) => (
              <li key={x} className="flex items-start gap-2 text-white/70">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#a855f7]" />
                {x}
              </li>
            ))}
          </ul>
        </Section>

        <Section n="05" title="O que pode ser mantido">
          <p>
            Algumas informações podem ser retidas mesmo após a exclusão, quando
            exigido por lei ou para cumprimento de obrigações legítimas:
          </p>
          <ul className="mt-4 space-y-2">
            {[
              "Registros fiscais e contábeis (5 anos, art. 173 CTN)",
              "Notas fiscais e comprovantes de pagamento",
              "Logs mínimos de segurança e prevenção a fraudes (6 meses, Marco Civil)",
              "Dados anonimizados para fins estatísticos (sem identificação pessoal)",
            ].map((x) => (
              <li key={x} className="flex items-start gap-2 text-white/70">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#a855f7]" />
                {x}
              </li>
            ))}
          </ul>
        </Section>

        <Section n="06" title="Dados de integrações com Meta, Google e TikTok">
          <p>
            Quando você conecta contas do Meta (Facebook/Instagram), Google Ads ou
            TikTok à Vanessa Simoni, tratamos apenas os dados necessários para operar as
            funcionalidades contratadas (métricas de campanhas, gestão de anúncios,
            pixels, conversões).
          </p>
          <p className="mt-3">
            Ao solicitar a exclusão, todos os tokens de acesso são revogados
            imediatamente e os dados obtidos via APIs dessas plataformas são
            eliminados dos nossos sistemas. Você também pode revogar o acesso
            diretamente nas configurações de cada plataforma:
          </p>
          <ul className="mt-4 space-y-2">
            <li className="flex items-start gap-2 text-white/70">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#a855f7]" />
              <a
                href="https://www.facebook.com/settings?tab=business_tools"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#a855f7] hover:underline"
              >
                Meta · Configurações de Business Integrations
              </a>
            </li>
            <li className="flex items-start gap-2 text-white/70">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#a855f7]" />
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#a855f7] hover:underline"
              >
                Google · Permissões de terceiros
              </a>
            </li>
            <li className="flex items-start gap-2 text-white/70">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#a855f7]" />
              <a
                href="https://ads.tiktok.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#a855f7] hover:underline"
              >
                TikTok Ads · Configurações da conta
              </a>
            </li>
          </ul>
        </Section>

        <Section n="07" title="Contato do Encarregado (DPO)">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-start gap-4">
              <Mail className="h-5 w-5 shrink-0 text-[#a855f7]" />
              <div className="space-y-2 text-sm text-white/70">
                <div>
                  <strong className="text-white">Privacidade e LGPD:</strong>{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="text-[#a855f7] hover:underline"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </div>
                <div>
                  <strong className="text-white">Suporte geral:</strong>{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="text-[#a855f7] hover:underline"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </div>
                <div className="pt-2 text-xs text-white/50">
                  Vanessa Simoni · Rio de Janeiro · Brasil
                </div>
              </div>
            </div>
          </div>
        </Section>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-white/8 pt-8">
          <div className="flex items-center gap-2 text-sm text-white/50">
            <FileText className="h-4 w-4" />
            Veja também:
            <Link to="/privacidade" className="text-[#a855f7] hover:underline">
              Política de Privacidade
            </Link>
            <span className="text-white/30">·</span>
            <Link to="/termos" className="text-[#a855f7] hover:underline">
              Termos de Serviço
            </Link>
          </div>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o%20de%20dados`}
            className="inline-flex items-center gap-2 rounded-lg bg-[#a855f7] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#9333ea]"
          >
            <Trash2 className="h-4 w-4" />
            Solicitar exclusão agora
          </a>
        </div>
      </main>
    </div>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <div className="mb-5 flex items-baseline gap-4">
        <span className="font-tech text-[11px] uppercase tracking-widest text-[#a855f7]">
          {n}
        </span>
        <h2 className="font-display text-2xl font-bold md:text-3xl">{title}</h2>
      </div>
      <div className="space-y-3 text-white/70 leading-relaxed">{children}</div>
    </section>
  );
}
