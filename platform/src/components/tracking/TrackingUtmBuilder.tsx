import { useMemo, useState } from "react";
import { Check, Copy, Info, QrCode, Wand2, Download } from "lucide-react";
import QRCode from "qrcode";
import { ModuleSection } from "@/components/modules/ModuleShell";
import { Input } from "@/components/ui/input";
import { TrackingEmptyState } from "./EmptyState";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { listUtmRanking } from "@/lib/tracking-live.functions";
import { getActiveWorkspace } from "@/lib/workspace.functions";

const PRESETS = [
  { label: "Meta Ads · Feed",  vals: { source: "meta",   medium: "cpc",   campaign: "campanha" } },
  { label: "Meta Ads · Story", vals: { source: "meta",   medium: "story", campaign: "campanha" } },
  { label: "Instagram Bio",    vals: { source: "instagram", medium: "bio", campaign: "perfil" } },
  { label: "Google Search",    vals: { source: "google", medium: "cpc",   campaign: "brand"    } },
  { label: "Newsletter",       vals: { source: "mailing", medium: "email", campaign: "news"    } },
];

type FieldHelp = { label: string; help: string; example: string };
const HELP: Record<string, FieldHelp> = {
  source:   { label: "utm_source",   help: "DE ONDE veio o clique. Nome do site/plataforma.", example: "meta, google, instagram, mailing, blog" },
  medium:   { label: "utm_medium",   help: "COMO chegou. Tipo de mídia usada.",              example: "cpc, story, email, bio, organic" },
  campaign: { label: "utm_campaign", help: "QUAL campanha. Use um nome único e consistente.", example: "black-friday-2026, lancamento-curso" },
  content:  { label: "utm_content",  help: "QUAL criativo/botão específico dentro da campanha.", example: "botao-hero, video-30s, headline-b" },
  term:     { label: "utm_term",     help: "Palavra-chave (só para Google Search Ads).",     example: "curso de marketing" },
};

function normalize(v: string) {
  return v.trim().toLowerCase().replace(/\s+/g, "-").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function TrackingUtmBuilder() {
  const [url, setUrl] = useState("https://");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const { data: ws } = useQuery({ queryKey: ["active-workspace"], queryFn: () => getActiveWorkspace() });
  const workspaceId = ws?.id ?? "";
  const { data: ranking = [] } = useQuery({
    queryKey: ["tracking-utm-ranking", workspaceId],
    queryFn: () => listUtmRanking({ data: { workspaceId } }),
    enabled: !!workspaceId,
  });

  const dirty = [source, medium, campaign, content, term].some((v) => v && v !== normalize(v));

  const finalUrl = useMemo(() => {
    try {
      const u = new URL(url);
      const set = (k: string, v: string) => v && u.searchParams.set(k, normalize(v));
      set("utm_source", source);
      set("utm_medium", medium);
      set("utm_campaign", campaign);
      set("utm_content", content);
      set("utm_term", term);
      return u.toString();
    } catch {
      return url;
    }
  }, [url, source, medium, campaign, content, term]);

  const copy = async () => {
    await navigator.clipboard.writeText(finalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const generateQr = async () => {
    try {
      const dataUrl = await QRCode.toDataURL(finalUrl, { width: 512, margin: 2, errorCorrectionLevel: "M" });
      setQrDataUrl(dataUrl);
      setQrOpen(true);
    } catch { /* noop */ }
  };
  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = "qrcode-Vanessa Simoni.png";
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Guia rápido */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-primary" />
          <div className="text-sm font-semibold">Como ler os par-metros UTM</div>
        </div>
        <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">
          UTM é um sufixo na URL. Ao clicar, o pixel Vanessa Simoni lê e mostra na dashboard <em>de onde veio</em> cada visita, lead e venda.
          Pense assim:
        </p>
        <div className="grid md:grid-cols-3 gap-2 text-[11.5px]">
          <div className="rounded-md border border-border bg-background/50 p-2">
            <div className="font-semibold">Meta Ads (feed)</div>
            <code className="text-muted-foreground break-all">?utm_source=meta&utm_medium=cpc&utm_campaign=black-friday&utm_content=video-hero</code>
          </div>
          <div className="rounded-md border border-border bg-background/50 p-2">
            <div className="font-semibold">Google Search</div>
            <code className="text-muted-foreground break-all">?utm_source=google&utm_medium=cpc&utm_campaign=brand&utm_term=agencia-marketing</code>
          </div>
          <div className="rounded-md border border-border bg-background/50 p-2">
            <div className="font-semibold">E-mail marketing</div>
            <code className="text-muted-foreground break-all">?utm_source=mailing&utm_medium=email&utm_campaign=news-nov</code>
          </div>
        </div>
      </div>

      <ModuleSection
        title="Gerador de link com UTM"
        description="Preencha os campos abaixo, a URL final aparece pronta pra copiar. O Vanessa Simoni normaliza acentos, espaços e maiúsculas automaticamente."
      >
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2.5">
            <LabeledInput
              label="URL de destino"
              help="A página que você quer abrir depois do clique."
              example="https://seu-site.com/promocao"
              value={url}
              onChange={setUrl}
              placeholder="https://seu-site.com/pagina"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <LabeledInput {...HELP.source}   value={source}   onChange={setSource} />
              <LabeledInput {...HELP.medium}   value={medium}   onChange={setMedium} />
              <LabeledInput {...HELP.campaign} value={campaign} onChange={setCampaign} />
              <LabeledInput {...HELP.content}  value={content}  onChange={setContent} />
              <LabeledInput {...HELP.term}     value={term}     onChange={setTerm} />
            </div>
            <div className="flex items-center gap-1 flex-wrap pt-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground mr-1">Presets:</span>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    setSource(p.vals.source);
                    setMedium(p.vals.medium);
                    setCampaign(p.vals.campaign);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border hover:bg-muted"
                >
                  <Wand2 className="w-3 h-3" /> {p.label}
                </button>
              ))}
            </div>
            {dirty && (
              <div className="text-[11px] rounded-md border border-warning/40 bg-warning/10 text-warning-foreground p-2">
                Detectamos espaço, maiúscula ou acento nos campos. A URL final já foi normalizada (tudo minúsculo, sem acento, com traço no lugar de espaço).
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-muted/40 p-3 flex flex-col">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">URL final</div>
            <div className="font-mono text-[11.5px] leading-relaxed break-all bg-background rounded-md p-3 border border-border flex-1">
              {finalUrl}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={copy}
                className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copiado" : "Copiar link"}
              </button>
              <button onClick={generateQr} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-md border border-border hover:bg-muted">
                <QrCode className="w-3.5 h-3.5" /> QR Code
              </button>
            </div>
          </div>
        </div>
      </ModuleSection>

      <ModuleSection title="Ranking de UTMs" description="O que está trazendo sessão, lead e venda de verdade nos últimos 30 dias.">
        {(ranking as Array<{ source: string; medium: string; campaign: string; sessions: number; leads: number; conversions: number; value: number }>).length === 0 ? (
          <TrackingEmptyState
            title="Sem dados de UTM ainda"
            hint="Gere links acima, distribua nos seus canais e volte aqui para ver o ranking real."
          />
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="p-2">Source</th><th className="p-2">Medium</th><th className="p-2">Campaign</th>
                  <th className="p-2 text-right">Sessões</th><th className="p-2 text-right">Leads</th>
                  <th className="p-2 text-right">Conversões</th><th className="p-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(ranking as Array<{ source: string; medium: string; campaign: string; sessions: number; leads: number; conversions: number; value: number }>).map((r) => (
                  <tr key={`${r.source}|${r.medium}|${r.campaign}`}>
                    <td className="p-2 font-mono text-[11px]">{r.source}</td>
                    <td className="p-2 font-mono text-[11px]">{r.medium}</td>
                    <td className="p-2 font-mono text-[11px]">{r.campaign}</td>
                    <td className="p-2 text-right tabular-nums">{r.sessions}</td>
                    <td className="p-2 text-right tabular-nums">{r.leads}</td>
                    <td className="p-2 text-right tabular-nums">{r.conversions}</td>
                    <td className="p-2 text-right tabular-nums">{r.value ? r.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ModuleSection>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>QR Code do link</DialogTitle></DialogHeader>
          {qrDataUrl && (
            <div className="flex flex-col items-center gap-3">
              <img src={qrDataUrl} alt="QR Code" className="w-64 h-64 rounded-lg border border-border" />
              <p className="text-[11px] text-muted-foreground text-center break-all font-mono">{finalUrl}</p>
              <button onClick={downloadQr} className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                <Download className="w-3.5 h-3.5" /> Baixar PNG
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LabeledInput({
  label, help, example, value, onChange, placeholder,
}: { label: string; help?: string; example?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      {help && <span className="block text-[11px] text-foreground/80 mt-0.5">{help}</span>}
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? example} className="h-8 text-xs mt-1" />
      {example && <span className="block text-[10px] text-muted-foreground mt-0.5">Ex.: {example}</span>}
    </label>
  );
}
