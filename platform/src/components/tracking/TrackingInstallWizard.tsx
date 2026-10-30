import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Check,
  ChevronRight,
  Globe,
  ShoppingCart,
  Facebook,
  Search,
  Mail,
  PhoneCall,
  Database,
  Circle,
  Info,
  ExternalLink,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { TrackingCodeBlock } from "./TrackingCodeBlock";
import { EmailTrackingBuilder } from "./EmailTrackingBuilder";
import { WhatsappCallsPanel } from "@/components/tracking/WhatsappCallsPanel";
import { GoogleAdsTrackingGuide } from "./GoogleAdsTrackingGuide";
import { useIsSuperAdmin } from "@/hooks/use-roles";
import { getTrackingSourceStatuses, type SourceStatus } from "@/lib/tracking-sources.functions";

type SourceOpt = {
  id: string;
  label: string;
  desc: string;
  Icon: typeof Globe;
  badge?: string;
  /** code = precisa colar script. connect = ativado em Integrações. auto = sempre ligado. */
  mode: "code" | "connect" | "auto";
  /** Visível apenas para super admin, escondido do cliente final. */
  superAdminOnly?: boolean;
};

const SOURCES: SourceOpt[] = [
  { id: "site",      label: "Site / Landing page",     desc: "Visitas, cliques, formulários e scroll.",               Icon: Globe,        mode: "code" },
  { id: "ecommerce", label: "E-commerce",              desc: "Um código único que puxa carrinho, checkout e compra.", Icon: ShoppingCart, mode: "code", superAdminOnly: true },
  { id: "meta",      label: "Meta Ads (Face + Insta)", desc: "Ativado em Integrações, sem código para colar.",        Icon: Facebook,     mode: "connect" },
  { id: "wa_calls",  label: "Ligações WhatsApp",       desc: "Ativado em Integrações, sem código para colar.",        Icon: PhoneCall,    mode: "connect", badge: "beta" },
  { id: "google",    label: "Google Ads",              desc: "Avisa o Google quando o clique vira lead.",        Icon: Search,       mode: "code" },
  { id: "email",     label: "E-mail marketing",        desc: "UTMs padronizadas + pixel de abertura.",                Icon: Mail,         mode: "code" },
  { id: "crm",       label: "CRM Vanessa Simoni",               desc: "Casa cada lead com a origem certa. Já ligado.",         Icon: Database,     mode: "auto", badge: "auto" },
];


const STATUS_UI: Record<SourceStatus, { dot: string; label: string; chip: string }> = {
  ok:      { dot: "bg-success",     label: "Integrado",             chip: "text-success border-success/30 bg-success/10" },
  partial: { dot: "bg-warning",     label: "Parcialmente integrado", chip: "text-warning border-warning/30 bg-warning/10" },
  off:     { dot: "bg-destructive", label: "Não integrado",         chip: "text-destructive border-destructive/30 bg-destructive/10" },
};

export function TrackingInstallWizard({ workspaceId, pixelToken }: { workspaceId: string; pixelToken: string }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Nada vem pré-selecionado, o usuário escolhe o que quer instalar.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [infoSource, setInfoSource] = useState<string | null>(null);

  const fetchStatuses = useServerFn(getTrackingSourceStatuses);
  const { data: statuses } = useQuery({
    queryKey: ["tracking-source-statuses", workspaceId],
    queryFn: () => fetchStatuses({ data: { workspaceId } }),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const snippets = useMemo(() => buildSnippets(workspaceId, pixelToken), [workspaceId, pixelToken]);

  const { isSuperAdmin } = useIsSuperAdmin();
  const visibleSources = useMemo(
    () => SOURCES.filter((s) => !s.superAdminOnly || isSuperAdmin),
    [isSuperAdmin],
  );

  const progress = ((step - 1) / 2) * 100;
  const infoOpt = visibleSources.find((s) => s.id === infoSource) ?? null;


  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4 md:p-5 border-b border-border">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold">Instalar tracking</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Escolha a fonte que quer ativar. Cada uma abre a explicação dela, com o que muda no seu dia a dia.
              </p>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              <StepDot n={1} active={step === 1} done={step > 1} label="Escolher" onClick={() => setStep(1)} />
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <StepDot n={2} active={step === 2} done={step > 2} label="Configurar" onClick={() => selected.size > 0 && setStep(2)} />
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <StepDot n={3} active={step === 3} done={false} label="Validar" onClick={() => selected.size > 0 && setStep(3)} />
            </div>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress + 33}%` }} />
          </div>
        </div>

        <div className="p-4 md:p-5">
          {step === 1 && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {visibleSources.map((s) => {
                  const isCode = s.mode === "code";
                  const on = isCode && selected.has(s.id);
                  const st = statuses?.[s.id]?.status ?? "off";
                  const ui = STATUS_UI[st];
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => (isCode ? toggle(s.id) : setInfoSource(s.id))}
                      className={cn(
                        "text-left rounded-xl border p-3 transition-all relative",
                        on
                          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                          : "border-border bg-background/50 hover:border-primary/40",
                      )}
                    >
                      {s.badge && (
                        <span className="absolute top-2 right-2 text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {s.badge}
                        </span>
                      )}
                      <div className="flex items-center justify-between mb-2">
                        <div className={cn("h-8 w-8 rounded-lg grid place-items-center", on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                          <s.Icon className="w-4 h-4" />
                        </div>
                        {isCode ? (
                          <div className={cn("h-4 w-4 rounded-full grid place-items-center border", on ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                            {on ? <Check className="w-3 h-3" /> : <Circle className="w-2 h-2 opacity-0" />}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-xs font-semibold">{s.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{s.desc}</div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className={cn("h-2 w-2 rounded-full shrink-0", ui.dot)} />
                        <span className="text-[10px] text-muted-foreground">{ui.label}</span>
                      </div>
                      {!isCode && (
                        <div className="mt-1 text-[10px] text-primary">Ver como ativar</div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[11px] text-muted-foreground">
                  Meta Ads, Ligações WhatsApp e CRM não geram código e não precisam de validação aqui.
                </p>
                <button
                  onClick={() => setStep(2)}
                  disabled={selected.size === 0}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50 hover:bg-primary/90"
                >
                  Continuar <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Accordion type="multiple" defaultValue={Array.from(selected)}>
                {visibleSources.filter((s) => s.mode === "code" && selected.has(s.id)).map((s) => {
                  const snip = snippets[s.id];
                  return (
                    <AccordionItem key={s.id} value={s.id} className="border border-border rounded-xl px-3 mb-2">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-md bg-primary/15 text-primary grid place-items-center">
                            <s.Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="text-left">
                            <div className="text-xs font-semibold">{s.label}</div>
                            <div className="text-[10px] text-muted-foreground">{snip?.where}</div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4 space-y-3">
                        <SnippetDetails snip={snip} workspaceId={workspaceId} />
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Voltar
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
                >
                  Validar instalação <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-background/50 divide-y divide-border">
                {visibleSources.filter((s) => s.mode === "code" && selected.has(s.id)).map((s) => {
                  const st = statuses?.[s.id]?.status ?? "off";
                  const ui = STATUS_UI[st];
                  return (
                    <div key={s.id} className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-2">
                        <s.Icon className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs font-medium">{s.label}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {statuses?.[s.id]?.detail ?? "Vai para OK assim que chegar o primeiro evento"}
                          </div>
                        </div>
                      </div>
                      <span className={cn("text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border", ui.chip)}>
                        {st === "ok" ? "OK" : st === "partial" ? "Parcial" : "Aguardando"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Para site e loja: cole o código, abra o seu site e navegue em pelo menos uma página. Para e-mail marketing: envie um teste para você mesmo e clique no botão do e-mail. Volte aqui em 1 ou 2 minutos e rode o teste em <strong>Diagnóstico</strong>.
              </p>
              <div className="flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Voltar
                </button>
                <button
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-md bg-success text-success-foreground text-xs font-medium hover:bg-success/90"
                >
                  <Check className="w-3.5 h-3.5" /> Concluir instalação
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Janela informativa das fontes ativadas em Integrações */}
      <Dialog open={!!infoOpt} onOpenChange={(o) => !o && setInfoSource(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          {infoOpt && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-sm">
                  <infoOpt.Icon className="w-4 h-4 text-primary" />
                  {infoOpt.label}
                  <span className={cn("h-2 w-2 rounded-full", STATUS_UI[statuses?.[infoOpt.id]?.status ?? "off"].dot)} />
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {STATUS_UI[statuses?.[infoOpt.id]?.status ?? "off"].label}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-[11.5px]">
                  {statuses?.[infoOpt.id]?.detail ?? snippets[infoOpt.id]?.where}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <SnippetDetails snip={snippets[infoOpt.id]} hideCode workspaceId={workspaceId} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SnippetDetails({ snip, hideCode, workspaceId }: { snip?: Snippet; hideCode?: boolean; workspaceId: string }) {
  if (!snip) return null;

  return (
    <>
      {(snip.title || snip.benefit) && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex gap-3">
          <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/15 text-primary grid place-items-center">
            <Info className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            {snip.title && <div className="text-[12.5px] font-semibold">{snip.title}</div>}
            {snip.benefit && (
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">{snip.benefit}</p>
            )}
          </div>
        </div>
      )}
      <p className="text-[12px] text-muted-foreground leading-relaxed">{snip.explain}</p>

      {snip.notice && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex gap-2">
          <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <p className="text-[11.5px] leading-relaxed text-foreground/85">{snip.notice}</p>
        </div>
      )}
      {snip.cta && (
        <Link
          to={snip.cta.to}
          className="inline-flex items-center gap-1 text-[11.5px] font-medium px-3 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10"
        >
          {snip.cta.label} <ExternalLink className="w-3 h-3" />
        </Link>
      )}
      {snip.custom === "email" && <EmailTrackingBuilder workspaceId={workspaceId} />}
      {snip.custom === "google" && <GoogleAdsTrackingGuide />}
      {snip.custom === "wa_calls" && <WhatsappCallsPanel workspaceId={workspaceId} />}
      {!hideCode && snip.code && <TrackingCodeBlock code={snip.code} filename={snip.filename} />}
      {snip.howTo && (
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Passo a passo
          </div>
          <ul className="text-[11.5px] space-y-1 list-disc list-inside text-foreground/85">
            {snip.howTo.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      )}
      {snip.checklist && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Bom saber
          </div>
          <ul className="text-[11.5px] space-y-1 text-foreground/85">
            {snip.checklist.map((c, i) => (
              <li key={i} className="flex gap-2">
                <Check className="w-3 h-3 mt-[3px] shrink-0 text-success" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}


function StepDot({
  n, active, done, label, onClick,
}: { n: number; active: boolean; done: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full border transition-colors",
        active ? "border-primary bg-primary/10 text-primary"
              : done ? "border-success/40 bg-success/10 text-success"
              : "border-border text-muted-foreground",
      )}
    >
      <span className={cn("h-4 w-4 rounded-full grid place-items-center text-[10px] font-semibold",
        active ? "bg-primary text-primary-foreground" : done ? "bg-success text-success-foreground" : "bg-muted",
      )}>
        {done ? <Check className="w-2.5 h-2.5" /> : n}
      </span>
      {label}
    </button>
  );
}

type Snippet = {
  where: string;
  title?: string;
  benefit?: string;
  explain: string;

  notice?: string;
  code?: string;
  filename?: string;
  howTo?: string[];
  checklist?: string[];
  cta?: { to: string; label: string };
  /** Renderiza uma ferramenta dedicada no lugar do bloco de código. */
  custom?: "email" | "google" | "wa_calls";
};


function buildSnippets(ws: string, _tok: string): Record<string, Snippet> {
  const base = typeof window !== "undefined" ? window.location.origin : "https://saude-slim.local";
  return {
    site: {
      title: "O que é o Pixel Vanessa Simoni",
      benefit:
        "Benefício: é o script que você cola no seu site para saber quem visitou, de onde veio, o que clicou e onde desistiu. Sem ele, os relatórios de origem e funil ficam vazios e você fica no achismo sobre o que traz cliente.",

      where: "Cole no <head> do seu site, funciona em qualquer plataforma.",
      explain:
        "Este é o pixel principal do Vanessa Simoni. Ele rastreia page_view, cliques em botões, tempo na página, scroll, envio de formulário e leva os UTMs junto. É o coração da aba Tracking.",
      filename: "saude-slim-pixel.html",
      code: `<!-- Vanessa Simoni Pixel, cole antes de </head> -->
<script async src="${base}/api/public/track/px.js?w=${ws}"></script>`,
      howTo: [
        "WordPress: plugin “Insert Headers and Footers” → campo Header.",
        "Shopify: Admin → Loja online → Temas → Editar código → theme.liquid, dentro de <head>.",
        "Wix: Configurações → Ferramentas de marketing → Tags personalizadas → Head.",
        "GTM: nova tag HTML customizada, gatilho All Pages.",
      ],
    },
    ecommerce: {
      title: "O que é o tracking de e-commerce",
      benefit:
        "Benefício: você vê onde o cliente abandona a compra, do produto ao checkout, e quanto cada canal fatura em reais. Dá para recuperar carrinho e comparar campanha por receita, não por clique.",

      where: "Um único código no <head>, ele detecta carrinho, checkout e thank-you page sozinho.",
      explain:
        "Se você já colou o pixel do Site, o e-commerce está 90% pronto. Este script adicional escuta os eventos de loja mais comuns (view_item, add_to_cart, begin_checkout, purchase, refund) e envia pra dashboard automaticamente. Funciona com Shopify, Nuvemshop, WooCommerce, Tray e Yampi.",
      filename: "saude-slim-ecommerce.html",
      code: `<!-- Vanessa Simoni E-commerce, cole depois do pixel principal -->
<script src="${base}/ecommerce.js?w=${ws}" async></script>
<!--
Eventos capturados automaticamente:
  · view_item        (visualizou produto)
  · add_to_cart      (adicionou ao carrinho)
  · begin_checkout   (iniciou checkout)
  · purchase         (finalizou compra, valor real)
  · refund           (reembolso via webhook do e-commerce)

Quer disparar manual em uma thank-you page customizada? Use:
  mkton("track","purchase",{ value: 197.00, currency:"BRL", order_id:"12345" });
-->`,
      howTo: [
        "Shopify: Admin → Configurações → Checkout → Order status page → cola no campo Additional scripts.",
        "WooCommerce: use o plugin “Insert Headers and Footers” e cola no Footer.",
        "Nuvemshop: Loja → Configurações avançadas → Códigos externos → Head.",
        "Tray / Yampi: Personalizar tema → editar tema → tag <head>.",
      ],
    },
    meta: {
      title: "O que é o tracking do Meta Ads",
      benefit:
        "Benefício: o Meta passa a saber quem virou lead de verdade, mesmo quando o navegador bloqueia o pixel, e o clique de anúncio para WhatsApp deixa de virar “origem desconhecida”. Na prática você para de dar crédito errado para as campanhas e otimiza pelo que fecha venda.",

      where: "Não tem código para colar. A ativação do Meta Ads acontece na aba Integrações.",
      explain:
        "Aqui no Tracking você só acompanha os resultados do Meta (visão geral, origens, funil e conversões). A ligação em si é feita uma única vez na aba Integrações, clicando em Conectar com o Facebook. Nesse momento você entra com o login do Facebook que administra a página e o Gerenciador de Negócios, autoriza o Vanessa Simoni e escolhe a conta de anúncios, a página e o pixel que quer usar. Depois disso, tudo passa a chegar sozinho: os eventos do site vão para o Meta pela Conversion API (server-side, não depende do navegador do visitante) e os contatos que vêm de anúncio de WhatsApp, o famoso Click-to-WhatsApp, são identificados pelo próprio Meta, porque esse tipo de clique não carrega UTM no link.",
      notice:
        "Resumindo em uma frase: instalação do Meta é em Integrações, leitura dos números é aqui no Tracking. Se os cards do Meta estiverem zerados, quase sempre é porque a conexão em Integrações ainda não foi feita ou o token expirou e precisa reconectar.",
      cta: { to: "/integracoes", label: "Ir para Integrações e conectar o Meta" },
      howTo: [
        "Passo 1: abra Integrações no menu lateral e localize o card do Meta (Facebook e Instagram).",
        "Passo 2: clique em Conectar e faça login com o Facebook que é administrador da página. Aceite todas as permissões pedidas, se tirar alguma, os relatórios ficam incompletos.",
        "Passo 3: escolha a conta de anúncios, a página e o pixel. Se você tem mais de um cliente, confira se selecionou o certo.",
        "Passo 4: no Gerenciador de Negócios, confirme que o seu domínio está verificado em Configurações do negócio, Segurança da marca, Domínios. Sem isso o Meta descarta parte das conversões.",
        "Passo 5: ainda no Meta Business Suite, ative Conversas (Conversations) para que os cliques de anúncio para WhatsApp sejam contabilizados.",
        "Passo 6: volte aqui no Tracking, aba Visão geral, e aguarde até 20 minutos para os primeiros números aparecerem.",
      ],
      checklist: [
        "Você nunca precisa colar token, ID de pixel ou código do Meta na mão. Tudo é feito pelo login autorizado.",
        "O pixel do Vanessa Simoni (aquele do card Site) continua sendo necessário: é ele que gera os eventos que o Vanessa Simoni envia ao Meta.",
        "Trocou a senha do Facebook ou removeu o app? A conexão cai. Basta reconectar em Integrações.",
        "Enquanto o Meta não estiver conectado, os relatórios de anúncios ficam vazios, o que não significa erro na sua conta.",
      ],
    },

    wa_calls: {
      title: "O que é o rastreio de ligações do WhatsApp",
      benefit:
        "Benefício: ligação perdida é venda perdida. Com isso ligado você enxerga quantas chamadas o seu time recebeu, quantas ficaram sem atendimento e em qual horário, e consegue escalar gente na hora certa.",

      where: "Precisa de uma sessão Evolution (WhatsApp Web) conectada em Integrações.",
      explain:
        "Não é call-center com número virtual. Aqui o Vanessa Simoni lê o histórico de chamadas do próprio WhatsApp Business via Evolution API: quem ligou, quando, quanto durou, se foi atendida. Vira evento de tracking e alimenta o KPI de ligações no dashboard.",
      custom: "wa_calls",
    },
    google: {
      title: "O que é o tracking do Google Ads",
      benefit:
        "Benefício: o Google passa a receber a conversão certa e otimiza as campanhas para quem realmente vira lead, o que costuma baixar o custo por resultado em vez de gastar com clique curioso.",

      where: "Passo a passo guiado, com os seus dados do Google Ads.",
      explain:
        "Você pega dois dados dentro do Google Ads e cola nos campos abaixo. A partir daí o Vanessa Simoni monta tudo pronto para você, seja colando um código no site ou preenchendo os campos do Gerenciador de Tags.",
      custom: "google",
    },
    email: {
      title: "O que é o tracking de e-mail marketing",
      benefit:
        "Benefício: você descobre quais disparos realmente geram visita e venda, não só abertura. Dá para cortar a lista morta e repetir o assunto que funcionou.",

      where: "Vai dentro da sua ferramenta de disparo, não no seu site.",
      explain:
        "Aqui você monta o link rastreado que entra no botão do e-mail e, se quiser, o pixel de abertura que vai no rodapé do HTML do e-mail. Não existe código para colar no head do site.",
      custom: "email",
    },

    crm: {
      title: "O que é a origem automática do CRM Vanessa Simoni",
      benefit:
        "Benefício: você para de perguntar “como você chegou até a gente?”. Cada lead já nasce com a origem carimbada, então você sabe qual anúncio, post ou página trouxe a venda e para de investir no que não retorna.",

      where: "Já vem ligado, nada para instalar.",
      explain:
        "Todo lead que entra no CRM Vanessa Simoni (WhatsApp, formulário, importação) já sai carimbado com utm_source/medium/campaign, primeira página visitada, dispositivo, cidade e canal de origem. Nada a colar.",
      code: `# CRM Vanessa Simoni, pronto
Workspace: ${ws}
Token: ${_tok}

Cada lead novo já traz:
- utm_source / medium / campaign / content / term
- primeira página visitada (landing_url)
- dispositivo, cidade, canal de origem`,
    },
  };
}
