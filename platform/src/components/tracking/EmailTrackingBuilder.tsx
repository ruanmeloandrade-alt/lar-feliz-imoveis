import { useMemo, useState } from "react";
import { Copy, Check, Link2, Image as ImageIcon, Info, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Ferramenta prática de tracking de e-mail marketing.
 * Nada aqui vai no site: o link vai dentro do botão do e-mail e o pixel
 * vai no rodapé do HTML do e-mail, dentro da própria ferramenta de disparo.
 */

const PROVIDERS: { id: string; name: string; steps: string[] }[] = [
  {
    id: "rd",
    name: "RD Station",
    steps: [
      "Abra o e-mail em Relacionamento, E-mails, e edite a peça.",
      "Clique no botão ou link do e-mail, campo Link, e cole o link já rastreado que você gerou aqui em cima.",
      "Para o pixel: no editor, escolha o bloco de código HTML no rodapé e cole a tag de imagem.",
      "Salve e envie um teste para você mesmo antes do disparo real.",
    ],
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    steps: [
      "Campaign, Edit design, clique no botão e cole o link rastreado no campo Web Address (URL).",
      "Para o pixel, arraste um bloco Code no rodapé e cole a tag de imagem.",
      "Se o Mailchimp perguntar sobre acrescentar UTMs automáticas, deixe desligado para não duplicar.",
    ],
  },
  {
    id: "brevo",
    name: "Brevo (Sendinblue)",
    steps: [
      "Campanhas, edite o template, selecione o botão e cole o link rastreado.",
      "Adicione um bloco HTML no rodapé e cole a tag de imagem do pixel.",
      "Envie um teste e abra no celular para confirmar que nada aparece na tela.",
    ],
  },
  {
    id: "ac",
    name: "ActiveCampaign",
    steps: [
      "Campaigns, edite a mensagem, clique no botão e cole o link rastreado em Link URL.",
      "Bloco HTML no rodapé recebe a tag de imagem do pixel.",
      "Desative o Google Analytics tracking da ferramenta para não sobrescrever as UTMs.",
    ],
  },
  {
    id: "manual",
    name: "Gmail, Outlook ou disparo manual",
    steps: [
      "Use somente o link rastreado, cole no texto do e-mail ou no botão.",
      "O pixel de abertura não funciona em e-mail escrito direto no Gmail, porque não dá para inserir HTML puro.",
      "Nesse caso você acompanha só os cliques, o que já resolve para medir venda.",
    ],
  },
];

function slug(v: string) {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

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

export function EmailTrackingBuilder({ workspaceId }: { workspaceId: string }) {
  const base = typeof window !== "undefined" ? window.location.origin : "https://saudeslim.com.br";
  const [dest, setDest] = useState("");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [provider, setProvider] = useState("rd");

  const camp = slug(campaign) || "minha-campanha";

  const trackedLink = useMemo(() => {
    const raw = dest.trim();
    if (!raw) return "";
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(withProto);
      u.searchParams.set("utm_source", "mailing");
      u.searchParams.set("utm_medium", "email");
      u.searchParams.set("utm_campaign", camp);
      if (slug(content)) u.searchParams.set("utm_content", slug(content));
      return u.toString();
    } catch {
      return "";
    }
  }, [dest, camp, content]);

  const pixelTag = `<img src="${base}/api/public/track/open.gif?w=${workspaceId}&c=${camp}" width="1" height="1" border="0" alt="" style="display:block;width:1px;height:1px;border:0" />`;

  const prov = PROVIDERS.find((p) => p.id === provider)!;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex gap-3">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[11.5px] leading-relaxed text-foreground/85">
          Atenção, este tracking <strong>não vai no seu site</strong>. Nada de head ou rodapé de página.
          Ele vive dentro da sua ferramenta de disparo de e-mail. São só duas coisas: o
          <strong> link rastreado</strong>, que você cola no botão do e-mail, e o
          <strong> pixel de abertura</strong>, uma imagem invisível que você cola no rodapé do HTML do e-mail.
          O link é o que realmente importa, porque é ele que mostra visita e venda. O pixel é um extra que
          mede quem abriu.
        </p>
      </div>

      {/* 1. Link rastreado */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground grid place-items-center text-[10px] font-bold">1</span>
          <div className="text-xs font-semibold flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-primary" /> Monte o link do botão do e-mail
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-2">
          <label className="text-[11px] space-y-1 sm:col-span-3">
            <span className="text-muted-foreground">Para onde o botão leva</span>
            <input
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              placeholder="https://seusite.com.br/promocao"
              className="w-full h-8 px-2 rounded-md border border-border bg-background text-[11.5px]"
            />
          </label>
          <label className="text-[11px] space-y-1 sm:col-span-2">
            <span className="text-muted-foreground">Nome da campanha</span>
            <input
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="black-friday-2026"
              className="w-full h-8 px-2 rounded-md border border-border bg-background text-[11.5px]"
            />
          </label>
          <label className="text-[11px] space-y-1">
            <span className="text-muted-foreground">Identificação do botão (opcional)</span>
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="botao-topo"
              className="w-full h-8 px-2 rounded-md border border-border bg-background text-[11.5px]"
            />
          </label>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-2.5 flex items-start gap-2">
          <code className="text-[11px] break-all flex-1 leading-relaxed">
            {trackedLink || "Preencha o endereço acima para gerar o link rastreado."}
          </code>
          {trackedLink && <CopyBtn value={trackedLink} label="Copiar link" />}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Gere um link por botão. Se o e-mail tem três botões, mude só a identificação do botão em cada um,
          assim você descobre qual deles as pessoas clicam.
        </p>
      </div>

      {/* 2. Pixel de abertura */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground grid place-items-center text-[10px] font-bold">2</span>
          <div className="text-xs font-semibold flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-primary" /> Pixel de abertura (opcional)
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-2.5 flex items-start gap-2">
          <code className="text-[11px] break-all flex-1 leading-relaxed">{pixelTag}</code>
          <CopyBtn value={pixelTag} label="Copiar pixel" />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Cole essa tag no bloco de HTML do rodapé do e-mail, dentro da ferramenta de disparo. Ela é uma
          imagem de 1 pixel transparente, ninguém vê. Cada abertura vira um evento na sua conta.
          Lembre que Gmail e Outlook às vezes bloqueiam imagens, então abertura sempre vem subestimada,
          por isso o número de cliques é mais confiável.
        </p>
      </div>

      {/* 3. Onde colar, por ferramenta */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground grid place-items-center text-[10px] font-bold">3</span>
          <div className="text-xs font-semibold">Onde colar, na sua ferramenta</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProvider(p.id)}
              className={cn(
                "px-2.5 py-1 rounded-full border text-[11px]",
                provider === p.id
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border text-muted-foreground hover:border-primary/40",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
        <ol className="space-y-1.5">
          {prov.steps.map((s, i) => (
            <li key={i} className="text-[11.5px] flex gap-2 text-foreground/85">
              <ChevronRight className="w-3 h-3 mt-[3px] shrink-0 text-primary" />
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* 4. Como conferir */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground grid place-items-center text-[10px] font-bold">4</span>
          <div className="text-xs font-semibold">Como saber que está funcionando</div>
        </div>
        <ul className="text-[11.5px] space-y-1 text-foreground/85">
          {[
            "Envie um teste para o seu próprio e-mail e clique no botão. O link precisa abrir seu site com utm_source=mailing na barra de endereço.",
            "O pixel do site (card Site / Landing page) precisa estar instalado, é ele que registra a visita que veio do e-mail.",
            "Volte aqui em 1 ou 2 minutos: o status vira verde assim que chegar o primeiro clique ou a primeira abertura.",
            "Depois acompanhe em Visão geral e Origens, filtrando por mailing.",
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
