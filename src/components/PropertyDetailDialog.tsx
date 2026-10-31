import {trackPublicEvent,openVanessaChat} from "@/lib/public-site";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, BedDouble, Bath, Ruler, MessageCircle, Sparkles, ChevronLeft, ChevronRight, X, HandCoins, FileText, Image as ImageIcon, Download, ExternalLink, Building2, CheckCircle2, CalendarClock } from "lucide-react";
import { useState, useEffect } from "react";
import { waUrl } from "@/lib/brand";
import { isVideoUrl, fileNameFromUrl } from "@/lib/media";
import type { Property } from "@/types/property";

interface Props {
  property: Property | null;
  onOpenChange: (open: boolean) => void;
}

const money = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const formatLaunch = (iso: string | null) => {
  if (!iso) return null;
  const [y, m] = iso.split("-");
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const mi = parseInt(m, 10) - 1;
  if (isNaN(mi) || mi < 0 || mi > 11) return null;
  return `${months[mi]}/${y}`;
};

const PropertyDetailDialog = ({ property, onOpenChange }: Props) => {
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<"media" | "pdf">("media");
  const [pdfIdx, setPdfIdx] = useState(0);
  useEffect(()=>{
    if(!property)return;const current=property;setIdx(0);let since=document.visibilityState==='visible'?performance.now():0;let elapsed=0;
    const flush=()=>{if(since){elapsed+=performance.now()-since;since=document.visibilityState==='visible'?performance.now():0;}const seconds=Math.floor(elapsed/1000);if(seconds>0){trackPublicEvent('product_view_time',{product_id:current.id,product_name:current.title,duration_seconds:seconds});elapsed-=seconds*1000;}};
    const visibility=()=>{flush();since=document.visibilityState==='visible'?performance.now():0;};trackPublicEvent('view_item',{product_id:current.id,product_name:current.title,city:current.city});document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',flush);const timer=window.setInterval(flush,15000);return()=>{flush();window.clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',flush);};
  },[property?.id]);
  if (!property) return null;

  const images = property.images.length ? property.images : [];
  const pdfs = property.pdfs ?? [];
  const hasPdf = pdfs.length > 0;
  const next = () => setIdx((i) => (i + 1) % images.length);
  const prev = () => setIdx((i) => (i - 1 + images.length) % images.length);

  const reset = () => { setIdx(0); setPdfIdx(0); setMode("media"); };

  return (
    <Dialog open={!!property} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="grid md:grid-cols-5">
          {/* Left column: media or PDF viewer */}
          <div className="md:col-span-3 relative bg-foreground flex flex-col md:min-h-[560px]">
            {/* Toggle bar (only if PDFs exist) */}
            {hasPdf && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex bg-background/95 backdrop-blur-sm rounded-full p-1 shadow-lg border border-border">
                <button
                  onClick={() => setMode("media")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${mode === "media" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <ImageIcon className="w-3.5 h-3.5" /> Fotos
                </button>
                <button
                  onClick={() => setMode("pdf")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${mode === "pdf" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <FileText className="w-3.5 h-3.5" /> Material ({pdfs.length})
                </button>
              </div>
            )}

            {mode === "pdf" && hasPdf ? (
              <div className="flex flex-col w-full h-full min-h-[560px] bg-muted">
                <div className="flex-1 relative bg-neutral-800">
                  <iframe
                    key={pdfIdx}
                    src={`${pdfs[pdfIdx]}#toolbar=1&navpanes=0`}
                    title={`PDF ${pdfIdx + 1}`}
                    className="absolute inset-0 w-full h-full border-0"
                  />
                </div>
                <div className="bg-background border-t border-border p-3 flex items-center justify-between gap-2 flex-wrap">
                  {pdfs.length > 1 ? (
                    <div className="flex gap-1 flex-wrap">
                      {pdfs.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => setPdfIdx(i)}
                          className={`text-xs px-3 py-1.5 rounded-md font-semibold transition truncate max-w-[180px] ${i === pdfIdx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent/10"}`}
                          title={fileNameFromUrl(p)}
                        >
                          {fileNameFromUrl(p)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground truncate">{fileNameFromUrl(pdfs[0])}</p>
                  )}
                  <div className="flex gap-2">
                    <a href={pdfs[pdfIdx]} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline"><ExternalLink className="w-3.5 h-3.5" /> Abrir</Button>
                    </a>
                    <a href={pdfs[pdfIdx]} download>
                      <Button size="sm" variant="default"><Download className="w-3.5 h-3.5" /> Baixar</Button>
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative w-full aspect-[4/3] md:aspect-auto md:min-h-[560px]">
                {images.length > 0 ? (
                  <>
                    {isVideoUrl(images[idx]) ? (
                      <video
                        key={idx}
                        src={images[idx]}
                        controls
                        playsInline
                        className="w-full h-full object-contain bg-foreground animate-in fade-in duration-300"
                      />
                    ) : (
                      <img
                        key={idx}
                        src={images[idx]}
                        alt={property.title}
                        className="w-full h-full object-cover animate-in fade-in duration-300"
                      />
                    )}
                    {images.length > 1 && (
                      <>
                        <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/90 flex items-center justify-center hover:bg-background transition shadow-lg">
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/90 flex items-center justify-center hover:bg-background transition shadow-lg">
                          <ChevronRight className="w-5 h-5" />
                        </button>
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {images.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setIdx(i)}
                              className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-secondary" : "w-1.5 bg-white/60"}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full bg-sp-stripe opacity-30" />
                )}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="md:col-span-2 p-6 md:p-8 flex flex-col">
            <button onClick={() => onOpenChange(false)} className="md:hidden absolute top-3 right-3 w-8 h-8 rounded-full bg-background/90 flex items-center justify-center z-30">
              <X className="w-4 h-4" />
            </button>

            <h2 className="font-heading text-2xl font-bold text-foreground leading-tight">{property.title}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="w-3.5 h-3.5" /> {property.city}
              {property.address && ` · ${property.address}`}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {property.construction_status === "na_planta" ? (
                <span className="inline-flex items-center gap-1 bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                  <Building2 className="w-3 h-3" /> Lançamento
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 bg-accent text-accent-foreground text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                  <CheckCircle2 className="w-3 h-3" /> Pronto para morar
                </span>
              )}
              {property.construction_status === "na_planta" && property.launch_date && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  <CalendarClock className="w-3.5 h-3.5" /> Lançamento em {formatLaunch(property.launch_date)}
                </span>
              )}
            </div>



            <div className="grid grid-cols-3 gap-2 mt-5 p-3 bg-muted rounded-lg">
              <div className="text-center">
                <BedDouble className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-xs text-muted-foreground">Dorms</p>
                <p className="font-heading font-bold text-sm text-foreground">{property.bedrooms}</p>
              </div>
              <div className="text-center border-x border-border">
                <Bath className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-xs text-muted-foreground">Banh.</p>
                <p className="font-heading font-bold text-sm text-foreground">{property.bathrooms}</p>
              </div>
              <div className="text-center">
                <Ruler className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-xs text-muted-foreground">Área</p>
                <p className="font-heading font-bold text-sm text-foreground">{property.area_m2 ? `${property.area_m2}m²` : "—"}</p>
              </div>
            </div>

            {property.plans && property.plans.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] uppercase tracking-widest font-bold text-primary mb-2 flex items-center gap-1">
                  <Ruler className="w-3 h-3" /> Opções de planta ({property.plans.length})
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {property.plans.map((plan, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2"
                    >
                      <p className="text-xs font-semibold text-foreground truncate">
                        {plan.name || `Planta ${i + 1}`}
                      </p>
                      {plan.area_m2 != null && (
                        <p className="font-heading text-base font-bold text-primary leading-tight">
                          {plan.area_m2}m²
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Valor</span>
                <span className="font-heading text-2xl font-bold text-foreground">{money(property.price)}</span>
              </div>
              {property.show_parcel && property.monthly_parcel && (
                <div className="flex items-center justify-between p-3 bg-accent/10 rounded border border-accent/20">
                  <span className="text-xs font-semibold text-accent uppercase tracking-wider">Parcela estimada</span>
                  <span className="font-heading font-bold text-accent">{money(property.monthly_parcel)}/mês</span>
                </div>
              )}
              {property.show_down_payment && property.down_payment && (
                <div className="flex items-center justify-between p-3 bg-primary/10 rounded border border-primary/20">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider">Renda mínima</span>
                  <span className="font-heading font-bold text-primary">{money(property.down_payment)}</span>
                </div>
              )}
              {property.subsidy_estimate && (
                <div className="flex items-center justify-between p-3 bg-secondary/15 rounded border border-secondary/30">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1"><HandCoins className="w-3 h-3" />Subsídio estimado</span>
                  <span className="font-heading font-bold text-foreground">{money(property.subsidy_estimate)}</span>
                </div>
              )}
            </div>

            {property.description && (
              <p className="text-sm text-muted-foreground leading-relaxed mt-4 whitespace-pre-line">
                {property.description}
              </p>
            )}

            {hasPdf && mode === "media" && (
              <button
                onClick={() => setMode("pdf")}
                className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                <FileText className="w-4 h-4" /> Ver material informativo em PDF ({pdfs.length})
              </button>
            )}

            <div className="mt-auto pt-6 space-y-2">
              <a
                href={waUrl(`Olá Vanessa, tenho interesse no imóvel "${property.title}" em ${property.city}.`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="whatsapp" size="lg" className="w-full">
                  <MessageCircle className="w-4 h-4" /> Tenho interesse — WhatsApp
                </Button>
              </a>
              <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
                <Sparkles className="w-3 h-3" /> Valores sujeitos a análise oficial da instituição financeira.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PropertyDetailDialog;
