import {trackPublicEvent} from "@/lib/public-site";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MapPin, BedDouble, Bath, Ruler, MessageCircle, ImagePlus, Search, ArrowRight, HandCoins, Home as HomeIcon, Play, FileText, Building2, CheckCircle2, CalendarClock } from "lucide-react";
import { BRAND, waUrl } from "@/lib/brand";
import { apiClient } from "@/lib/api-client";
import { isVideoUrl } from "@/lib/media";
import type { Property } from "@/types/property";
import PropertyDetailDialog from "./PropertyDetailDialog";
import condominioBg from "@/assets/condominio-bg.jpg";

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

const PropertiesSection = () => {
  const [all, setAll] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Property | null>(null);
  const [cityFilter, setCityFilter] = useState<string>("Todas");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    apiClient
      .from("properties")
      .select("*")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setAll((data ?? []) as unknown as Property[]);
        setLoading(false);
      });
  }, []);

  useEffect(()=>{const handler=(e:Event)=>{const id=(e as CustomEvent<{id:string}>).detail?.id;const property=all.find(p=>p.id===id);if(property)setSelected(property);};window.addEventListener('vanessa:view-property',handler);return()=>window.removeEventListener('vanessa:view-property',handler);},[all]);
  const cities = ["Todas", ...Array.from(new Set(all.map((p) => p.city)))];
  const list = cityFilter === "Todas" ? all : all.filter((p) => p.city === cityFilter);
  const INITIAL_LIMIT = 3;
  const visibleList = expanded ? list : list.slice(0, INITIAL_LIMIT);
  const hiddenCount = list.length - INITIAL_LIMIT;

  return (
    <section id="imoveis" className="py-16 md:py-24 relative overflow-hidden isolate">
      {/* Background image */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${condominioBg})` }}
      />
      {/* Escurecimento */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-foreground/80" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-foreground/60 via-foreground/70 to-foreground/85" />
      <div className="absolute inset-x-0 top-0 divider-sp" />
      <div className="container relative">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8 max-w-2xl mx-auto"
        >
          <span className="text-xs uppercase tracking-widest text-primary-foreground/70 font-semibold">Oportunidades</span>
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-background mt-2 drop-shadow-lg">
            Imóveis em São Paulo
          </h2>
          <p className="text-background/80 mt-3">
            Empreendimentos em {BRAND.cities.join(", ")} enquadrados no Minha Casa Minha Vida.
          </p>
        </motion.div>

        {/* Filter chips */}
        {all.length > 0 && cities.length > 2 && (
          <div className="relative mb-10 max-w-3xl mx-auto">
            <div className="flex items-center justify-center gap-8 sm:gap-10 flex-wrap border-b border-background/15">
              {cities.map((c) => {
                const active = cityFilter === c;
                return (
                  <button
                    key={c}
                    onClick={() => setCityFilter(c)}
                    className={`relative pb-3 text-[13px] font-heading font-semibold tracking-wide transition-colors ${
                      active ? "text-background" : "text-background/50 hover:text-background/80"
                    }`}
                  >
                    {c}
                    <span
                      aria-hidden
                      className={`absolute left-0 right-0 -bottom-px h-[2px] bg-secondary transition-transform duration-300 origin-center ${
                        active ? "scale-x-100" : "scale-x-0"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-card rounded-xl h-96 animate-pulse" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="max-w-xl mx-auto bg-card rounded-xl p-12 text-center border border-dashed border-border">
            <HomeIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-heading text-lg font-bold text-foreground mb-1">Novos imóveis em breve</p>
            <p className="text-sm text-muted-foreground mb-5">
              Estamos preparando as próximas oportunidades. Fale conosco no WhatsApp e receba lançamentos em primeira mão.
            </p>
            <a href={waUrl("Olá Vanessa, quero receber imóveis MCMV assim que estiverem disponíveis.")} target="_blank" rel="noopener noreferrer">
              <Button variant="whatsapp"><MessageCircle className="w-4 h-4" /> Receber novidades</Button>
            </a>
          </div>
        ) : (
          <motion.div
            layout
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto"
          >
            {visibleList.map((p, i) => {
              const cover = p.images.find((m) => !isVideoUrl(m)) ?? p.images[0];
              const coverIsVideo = cover ? isVideoUrl(cover) : false;
              const extraMedia = p.images.length - 1;
              return (
              <motion.article
                layout
                key={p.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i * 0.06, 0.3), type: "spring", stiffness: 90 }}
                whileHover={{ y: -8 }}
                onClick={() => setSelected(p)}
                className="group relative bg-card rounded-3xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-500 cursor-pointer flex flex-col active:scale-[0.99]"
              >
                {/* Cover — primeira foto do imóvel */}
                <div className="relative aspect-[4/5] overflow-hidden bg-hero">
                  {cover ? (
                    coverIsVideo ? (
                      <>
                        <video
                          src={cover}
                          className="w-full h-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-105"
                          muted
                          preload="metadata"
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-14 h-14 rounded-full bg-background/90 flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110">
                            <Play className="w-6 h-6 text-primary" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <img
                        src={cover}
                        alt={`Capa do imóvel ${p.title}`}
                        className="w-full h-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-105"
                        loading="lazy"
                      />
                    )
                  ) : (
                    <div className="w-full h-full bg-sp-stripe opacity-20 flex items-center justify-center">
                      <ImagePlus className="w-12 h-12 text-primary-foreground/40" />
                    </div>
                  )}

                  {/* gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/85 via-foreground/20 to-transparent" />

                  {/* status construção — pill único e minimalista */}
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                    {p.construction_status === "na_planta" ? (
                      <span className="inline-flex items-center gap-1.5 bg-background/95 backdrop-blur-md text-foreground text-[10px] font-heading font-bold uppercase tracking-widest px-2.5 py-1 rounded-full shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        Lançamento
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 bg-background/95 backdrop-blur-md text-foreground text-[10px] font-heading font-bold uppercase tracking-widest px-2.5 py-1 rounded-full shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                        Pronto p/ morar
                      </span>
                    )}
                    {p.tag && (
                      <span className="bg-secondary text-secondary-foreground text-[10px] font-heading font-bold uppercase tracking-widest px-2.5 py-1 rounded-full shadow-sm">
                        {p.tag}
                      </span>
                    )}
                  </div>

                  {/* contador de mídia — minimal */}
                  {extraMedia > 0 && (
                    <span className="absolute top-4 right-4 bg-foreground/60 backdrop-blur-md text-background text-[10px] font-semibold px-2 py-1 rounded-full">
                      +{extraMedia}
                    </span>
                  )}

                  {/* Título editorial sobre a capa */}
                  <div className="absolute inset-x-0 bottom-0 p-5 transition-transform duration-500 group-hover:-translate-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-background/80 mb-1.5 font-medium uppercase tracking-widest">
                      <MapPin className="w-3 h-3" /> {p.city}
                    </div>
                    <h3 className="font-heading font-bold text-background text-xl leading-[1.1] tracking-tight">
                      {p.title}
                    </h3>
                    <div className="mt-3 h-[2px] w-8 bg-secondary rounded-full transition-all duration-500 group-hover:w-24" />
                  </div>
                </div>

                {/* Corpo do card */}
                <div className="p-5 flex-1 flex flex-col">
                  {/* Especificações */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
                    <span className="flex items-center gap-1.5"><BedDouble className="w-4 h-4 text-primary/70" /> {p.bedrooms} <span className="text-muted-foreground/70">dorm.</span></span>
                    <span className="flex items-center gap-1.5"><Bath className="w-4 h-4 text-primary/70" /> {p.bathrooms} <span className="text-muted-foreground/70">banh.</span></span>
                    {p.area_m2 && <span className="flex items-center gap-1.5"><Ruler className="w-4 h-4 text-primary/70" /> {p.area_m2}m²</span>}
                  </div>

                  {/* lançamento */}
                  {p.construction_status === "na_planta" && p.launch_date && (
                    <p className="mt-2 text-xs font-semibold text-primary flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5" /> Lançamento em {formatLaunch(p.launch_date)}
                    </p>
                  )}

                  {/* Plantas / variações */}
                  {p.plans && p.plans.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-primary/80 mb-1.5 flex items-center gap-1">
                        <Ruler className="w-3 h-3" /> {p.plans.length} {p.plans.length > 1 ? "opções de planta" : "opção de planta"}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {p.plans.map((plan, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 bg-primary/10 border border-primary/20 text-foreground text-[11px] font-semibold px-2 py-0.5 rounded-md"
                          >
                            {plan.name || `Planta ${i + 1}`}
                            {plan.area_m2 != null && (
                              <span className="text-primary font-bold">{plan.area_m2}m²</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Descrição do imóvel */}
                  {p.description && (
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">
                      {p.description}
                    </p>
                  )}

                  {/* DESTAQUES tipográficos — Parcela / Renda mínima + Subsídio */}
                  {(() => {
                    const showParcel = p.show_parcel && p.monthly_parcel;
                    const showDown = p.show_down_payment && p.down_payment;
                    const showSubsidy = !!p.subsidy_estimate;
                    const primary = showParcel
                      ? { label: "Parcela a partir de", value: p.monthly_parcel!, suffix: "/mês" as const }
                      : showDown
                      ? { label: "Renda mínima", value: p.down_payment!, suffix: "" as const }
                      : null;
                    const secondary = showParcel && showDown
                      ? { label: "Renda mínima", value: p.down_payment!, icon: HandCoins }
                      : null;
                    if (!primary && !showSubsidy) return null;
                    return (
                      <div className="mt-5 pt-5 border-t border-border/60 flex items-end justify-between gap-4">
                        {primary && (
                          <div className="flex-1 transition-transform duration-500 group-hover:-translate-y-0.5">
                            <p className="text-[10px] text-muted-foreground font-extrabold uppercase tracking-widest leading-none">
                              {primary.label}
                            </p>
                            <div className="flex items-baseline gap-0.5 mt-1.5">
                              <span className="text-sm font-bold text-primary">R$</span>
                              <span className="font-heading text-3xl font-black text-primary tracking-tighter leading-none">
                                {primary.value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                              </span>
                              {primary.suffix && (
                                <span className="text-[11px] font-semibold text-primary/70 ml-0.5">{primary.suffix}</span>
                              )}
                            </div>
                            <div className="h-[3px] w-10 bg-primary rounded-full mt-1.5 transition-all duration-500 group-hover:w-full" />
                          </div>
                        )}
                        {(secondary || showSubsidy) && (
                          <div className="flex-1 text-right transition-transform duration-500 group-hover:-translate-y-0.5">
                            <p className="text-[10px] text-muted-foreground font-extrabold uppercase tracking-widest leading-none flex items-center justify-end gap-1">
                              <HandCoins className="w-3 h-3" /> {secondary ? secondary.label : "Subsídio até"}
                            </p>
                            <div className="flex items-baseline gap-0.5 mt-1.5 justify-end">
                              <span className="text-sm font-bold text-accent">R$</span>
                              <span className="font-heading text-3xl font-black text-accent tracking-tighter leading-none">
                                {(secondary ? secondary.value : p.subsidy_estimate!).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                            <div className="h-[3px] w-10 bg-accent rounded-full mt-1.5 ml-auto transition-all duration-500 group-hover:w-full" />
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Extra: quando parcela e renda mínima estão visíveis, mostra o subsídio numa linha discreta */}
                  {p.show_parcel && p.monthly_parcel && p.show_down_payment && p.down_payment && p.subsidy_estimate && (
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1"><HandCoins className="w-3 h-3 text-accent" /> Subsídio até</span>
                      <span className="font-heading font-bold text-accent">R$ {p.subsidy_estimate.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>
                    </div>
                  )}


                  {/* Valor total do imóvel — discreto */}
                  {p.price && (
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Valor do imóvel</span>
                      <span className="font-semibold text-foreground/80">{money(p.price)}</span>
                    </div>
                  )}

                  {/* CTAs */}
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1 group/btn"
                      onClick={(e) => { e.stopPropagation(); setSelected(p); }}
                    >
                      Ver detalhes <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-0.5 transition-transform" />
                    </Button>
                    <a
                      href={waUrl(`Olá Vanessa, tenho interesse no imóvel "${p.title}" em ${p.city}.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button variant="whatsapp" size="sm" aria-label="WhatsApp" className="hover:rotate-6 transition-transform">
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                    </a>
                  </div>
                </div>
              </motion.article>
              );
            })}

          </motion.div>
        )}

        {!loading && hiddenCount > 0 && (
          <div className="flex justify-center mt-8">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setExpanded((v) => !v)}
              className="gap-2"
            >
              {expanded ? "Mostrar menos" : `Ver mais ${hiddenCount} ${hiddenCount > 1 ? "imóveis" : "imóvel"}`}
              <ArrowRight className={`w-4 h-4 transition-transform ${expanded ? "-rotate-90" : "rotate-90"}`} />
            </Button>
          </div>
        )}

        <p className="text-center text-xs text-background/60 mt-8 max-w-2xl mx-auto">
          Valores e disponibilidade sujeitos à confirmação da corretora. O financiamento depende da análise da instituição financeira.
        </p>
      </div>

      <PropertyDetailDialog property={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </section>
  );
};

export default PropertiesSection;
