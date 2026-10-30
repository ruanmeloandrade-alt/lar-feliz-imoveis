import { useMemo, useState } from "react";
import { Copy, Check, Info, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Guia prático do Google Ads.
 * Dois caminhos: quem NÃO usa Gerenciador de Tags (caminho simples, cola um
 * código no site) e quem usa GTM (não cola nada no site, configura lá dentro).
 */

function CopyBtn({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          toast.success("Copiado");
          setTimeout(() => setDone(false), 1600);
        } catch {
          toast.error("Não foi possível copiar, selecione o texto na mão");
        }
      }}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border text-[11px] font-medium hover:bg-muted shrink-0"
    >
      {done ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
      {done ? "Copiado" : label}
    </button>
  );
}

/** Linha com um valor pequeno e um botão de copiar só daquele valor. */
function ValueRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
          <code className="text-[11.5px] break-all">{value}</code>
        </div>
        <CopyBtn value={value} />
      </div>
      {hint && <p className="text-[10.5px] text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  );
}

export function GoogleAdsTrackingGuide() {
  const [mode, setMode] = useState<"simples" | "gtm">("simples");
  const [convId, setConvId] = useState("");
  const [label, setLabel] = useState("");

  const idOk = /^AW-\d{6,}$/i.test(convId.trim());
  const id = idOk ? convId.trim().toUpperCase() : "AW-000000000";
  const lb = label.trim() || "SEU_ROTULO";

  const siteCode = useMemo(
    () => `<!-- Google Ads, cole antes de </head> do seu site -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${id}');

  // Avisa o Google toda vez que alguém vira lead no seu site
  window.addEventListener('Vanessa Simoni:lead', function () {
    gtag('event', 'conversion', { send_to: '${id}/${lb}' });
  });
</script>`,
    [id, lb],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex gap-3">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[11.5px] leading-relaxed text-foreground/85">
          Em português claro: o Google Ads precisa saber quando alguém que clicou no seu anúncio virou lead
          ou cliente. Sem isso ele gasta o seu dinheiro no escuro. O que você vai fazer aqui é avisar o Google.
          Isso <strong>não substitui</strong> o pixel Vanessa Simoni do card Site, os dois convivem, cada um alimenta um lado.
          O Vanessa Simoni identifica o clique e dispara o sinal no navegador; a confirmação de que a conversão chegou ao Google
          precisa ser feita no próprio Google Ads.
        </p>
      </div>

      {/* Antes de começar */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="text-xs font-semibold">Antes de começar, pegue dois dados no Google Ads</div>
        <ol className="space-y-1.5">
          {[
            "Entre no Google Ads com a conta que roda os anúncios.",
            "No menu de cima, clique em Ferramentas, depois em Conversões (em algumas contas aparece como Medição, Conversões).",
            "Clique em Nova ação de conversão, escolha Website, digite o seu site e clique em Verificar.",
            "Escolha Adicionar manualmente, dê o nome de Lead, categoria Envio de formulário de lead, e salve.",
            "Na tela seguinte, escolha Instalar a tag manualmente. Aparecem duas informações: o ID de conversão, que começa com AW- e o rótulo de conversão, um código curto de letras e números.",
            "Copie esses dois dados e cole nos campos abaixo. Só isso, o resto a gente monta pra você.",
          ].map((s, i) => (
            <li key={i} className="text-[11.5px] flex gap-2 text-foreground/85">
              <span className="h-4 w-4 mt-[1px] shrink-0 rounded-full bg-muted grid place-items-center text-[9px] font-bold">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Campos */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="text-xs font-semibold">Seus dois dados</div>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="text-[11px] space-y-1">
            <span className="text-muted-foreground">ID de conversão</span>
            <input
              value={convId}
              onChange={(e) => setConvId(e.target.value)}
              placeholder="AW-123456789"
              className="w-full h-8 px-2 rounded-md border border-border bg-background text-[11.5px]"
            />
          </label>
          <label className="text-[11px] space-y-1">
            <span className="text-muted-foreground">Rótulo de conversão</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="AbCdEfGhIj-1AB"
              className="w-full h-8 px-2 rounded-md border border-border bg-background text-[11.5px]"
            />
          </label>
        </div>
        {!idOk && convId.trim().length > 0 && (
          <div className="flex gap-2 text-[11px] text-warning">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
            O ID de conversão precisa começar com AW- seguido de números, por exemplo AW-123456789.
          </div>
        )}
      </div>

      {/* Escolha do caminho */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="text-xs font-semibold">Como você mexe no seu site?</div>
        <div className="grid sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("simples")}
            className={cn(
              "text-left rounded-lg border p-2.5",
              mode === "simples" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
            )}
          >
            <div className="text-[11.5px] font-semibold">Não uso Gerenciador de Tags</div>
            <div className="text-[10.5px] text-muted-foreground">
              O normal. Você cola um código no site, igual fez com o pixel Vanessa Simoni.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMode("gtm")}
            className={cn(
              "text-left rounded-lg border p-2.5",
              mode === "gtm" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
            )}
          >
            <div className="text-[11.5px] font-semibold">Uso o Gerenciador de Tags (GTM)</div>
            <div className="text-[10.5px] text-muted-foreground">
              Aqui você não cola nada no site, configura tudo dentro do Gerenciador.
            </div>
          </button>
        </div>
      </div>

      {mode === "simples" ? (
        <div className="rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="text-xs font-semibold">Caminho simples, um código só</div>
          {!idOk || !label.trim() ? (
            <p className="text-[11.5px] text-muted-foreground">
              Preencha o ID de conversão e o rótulo aí em cima. O código aparece pronto aqui, já com os seus dados dentro.
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-border bg-muted/40 p-2.5 flex items-start gap-2">
                <pre className="text-[11px] leading-relaxed flex-1 overflow-x-auto whitespace-pre-wrap break-all">
                  {siteCode}
                </pre>
                <CopyBtn value={siteCode} label="Copiar código" />
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                  Onde colar esse código
                </div>
                <ul className="text-[11.5px] space-y-1 list-disc list-inside text-foreground/85">
                  <li>É no mesmo lugar onde você colou o pixel Vanessa Simoni, dentro do &lt;head&gt; do site, em todas as páginas.</li>
                  <li>WordPress: plugin Insert Headers and Footers, campo Header.</li>
                  <li>Wix: Configurações, Ferramentas de marketing, Tags personalizadas, Head.</li>
                  <li>Shopify: Temas, Editar código, arquivo theme.liquid, logo antes de &lt;/head&gt;.</li>
                  <li>Site feito por agência ou programador: mande esse código para a pessoa e peça para colar no head.</li>
                </ul>
              </div>
              <p className="text-[11px] text-muted-foreground">
                É um código só, colado uma vez. Ele avisa o Google automaticamente sempre que o pixel Vanessa Simoni
                registrar um lead no site. A confirmação final de recebimento aparece no próprio Google Ads.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="text-xs font-semibold">Caminho pelo Gerenciador de Tags</div>
          <p className="text-[11.5px] text-muted-foreground">
            Aqui não existe um código para colar. Você vai criar uma tag dentro do Gerenciador e preencher
            três campinhos. Copie um por um, cada botão abaixo copia só aquele valor.
          </p>
          <ol className="space-y-1.5">
            {[
              "No Gerenciador de Tags, clique em Tags, depois Novo.",
              "Em Configuração da tag, escolha o tipo Rastreamento de conversões do Google Ads.",
              "Preencha o ID de conversão e o rótulo com os valores abaixo.",
              "Em Acionamento, crie um gatilho do tipo Evento personalizado e use o nome de evento abaixo.",
              "Salve e clique em Enviar, depois Publicar. Se não publicar, nada funciona.",
            ].map((s, i) => (
              <li key={i} className="text-[11.5px] flex gap-2 text-foreground/85">
                <ChevronRight className="w-3 h-3 mt-[3px] shrink-0 text-primary" />
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <div className="grid sm:grid-cols-3 gap-2">
            <ValueRow label="ID de conversão" value={id} />
            <ValueRow label="Rótulo" value={lb} />
            <ValueRow label="Nome do evento (gatilho)" value="Vanessa Simoni_lead" hint="Campo Nome do evento, no gatilho de Evento personalizado." />
          </div>
        </div>
      )}

      {/* Validação */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="text-xs font-semibold">Como saber que está funcionando de verdade</div>
        <ul className="text-[11.5px] space-y-1 text-foreground/85">
          {[
            "Quando o Vanessa Simoni identificar uma visita com gclid, o status mostra que a atribuição do clique Google está chegando. Isso não confirma sozinho que a conversão foi recebida pelo Google Ads.",
            "Teste rápido da atribuição Vanessa Simoni: abra o seu site adicionando ?gclid=teste123 no fim do endereço, navegue em uma página e volte aqui em 1 ou 2 minutos.",
            "Validação final do envio: no Google Ads, abra Ferramentas, Conversões e confira o diagnóstico/status da ação de conversão. É ali que o Google confirma se recebeu o evento.",
            "Se o Vanessa Simoni reconhecer gclid mas o Google continuar sem atividade, revise o ID/rótulo, o código no head ou se o container do Gerenciador foi publicado.",
          ].map((c, i) => (
            <li key={i} className="flex gap-2">
              <Check className="w-3 h-3 mt-[3px] shrink-0 text-success" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
