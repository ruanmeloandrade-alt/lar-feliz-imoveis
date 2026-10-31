import { useEffect, useState } from "react";
import {
  MapPin,
  BedDouble,
  Bath,
  Ruler,
  MessageCircle,
  ArrowRight,
  Building2,
  Play,
} from "lucide-react";
import { BRAND, waUrl } from "@/lib/brand";
import { apiClient } from "@/lib/api-client";
import { isVideoUrl } from "@/lib/media";
import type { Property } from "@/types/property";
import PropertyDetailDialog from "./PropertyDetailDialog";
import verticeVideoCover from "@/assets/vertice-video-cover.jpg";
import PropertySearchFilters from "./PropertySearchFilters";
import {
  emptyPropertyFilters,
  filterProperties,
  propertyFilterOptions,
  type PropertyFilters,
} from "@/lib/property-filters";
const money = (v: number | null) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      });

const formatLaunch = (iso: string | null) => {
  if (!iso) return null;
  const [y, m] = iso.split("-");
  const months = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  const mi = parseInt(m, 10) - 1;
  if (isNaN(mi) || mi < 0 || mi > 11) return null;
  return `${months[mi]}/${y}`;
};

const PropertiesSection = () => {
  const [all, setAll] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Property | null>(null);
  const [filters, setFilters] = useState<PropertyFilters>({
    ...emptyPropertyFilters,
  });
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    apiClient
      .from("properties")
      .select("*")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        setLoadError(
          error ? "Não foi possível carregar os imóveis. Tente novamente." : "",
        );
        setAll((data ?? []) as unknown as Property[]);
        setLoading(false);
      });
  }, [retry]);

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      const property = all.find((p) => p.id === id);
      if (property) setSelected(property);
    };
    window.addEventListener("vanessa:view-property", handler);
    return () => window.removeEventListener("vanessa:view-property", handler);
  }, [all]);
  const { cities, neighborhoods, bedrooms, bathrooms } = propertyFilterOptions(
    all,
    filters,
  );
  const list = filterProperties(all, filters);
  const INITIAL_LIMIT = 3;
  const visibleList = expanded ? list : list.slice(0, INITIAL_LIMIT);
  const hiddenCount = list.length - INITIAL_LIMIT;

  return (
    <section id="imoveis" className="vs-listings vs-section">
      <div className="container">
        <div className="vs-section-heading">
          <div>
            <p className="vs-eyebrow">Encontre o seu lugar</p>
            <h2>
              Imóveis em São Paulo.
              <br />
              <em>Possibilidades para sua vida.</em>
            </h2>
          </div>
          <p>
            Explore os empreendimentos em {BRAND.cities.join(", ")}. Veja fotos,
            plantas e detalhes antes de conversar com a Vanessa.
          </p>
        </div>
        <PropertySearchFilters
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setExpanded(false);
          }}
          cities={cities}
          neighborhoods={neighborhoods}
          bedrooms={bedrooms}
          bathrooms={bathrooms}
          resultCount={list.length}
        />
        {loadError ? (
          <div className="vs-listing-empty" role="alert">
            <p>{loadError}</p>
            <button
              className="vs-text-link"
              onClick={() => {
                setLoading(true);
                setRetry((n) => n + 1);
              }}
            >
              Recarregar imóveis
            </button>
          </div>
        ) : loading ? (
          <p role="status" className="vs-listing-empty">
            Carregando imóveis…
          </p>
        ) : list.length === 0 ? (
          <div className="vs-listing-empty">
            <Building2 size={32} />
            <h3>
              {all.length
                ? "Nenhum imóvel corresponde a estes filtros."
                : "Novas oportunidades em breve."}
            </h3>
            <p>
              Converse com a Vanessa para saber mais sobre os próximos
              empreendimentos.
            </p>
            <a
              className="vs-text-link"
              href={waUrl(
                "Olá Vanessa, quero conhecer os imóveis disponíveis.",
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              Conversar sobre imóveis <ArrowRight size={16} />
            </a>
          </div>
        ) : (
          <div className="vs-property-grid">
            {visibleList.map((p) => {
              const cover = p.images.find((m) => !isVideoUrl(m)) ?? p.images[0];
              return (
                <article key={p.id} className="vs-property-card">
                  <button
                    className="vs-property-cover"
                    onClick={() => setSelected(p)}
                    aria-label={"Ver fotos de " + p.title}
                  >
                    {cover ? (
                      isVideoUrl(cover) ? (
                        <>
                          {cover.includes(
                            "aed4b229a40d9030545337efa280569b5e9749139789031fc7029090ee0414f9.mp4",
                          ) ? (
                            <img
                              src={verticeVideoCover}
                              alt={"Imagem do vídeo de " + p.title}
                              loading="lazy"
                            />
                          ) : (
                            <span className="vs-property-noimage">
                              <Play size={30} />
                              Conheça o imóvel em vídeo
                            </span>
                          )}
                          <Play className="vs-property-play" size={26} />
                        </>
                      ) : (
                        <img
                          src={cover}
                          alt={"Capa do imóvel " + p.title}
                          loading="lazy"
                        />
                      )
                    ) : (
                      <span className="vs-property-noimage">
                        <Building2 size={34} />
                        Fotos em atualização
                      </span>
                    )}
                    <span className="vs-property-badge">
                      {p.construction_status === "na_planta"
                        ? "Lançamento"
                        : "Pronto para morar"}
                    </span>
                    {p.images.length > 1 && (
                      <span className="vs-property-media">
                        {p.images.length} mídias
                      </span>
                    )}
                  </button>
                  <div className="vs-property-body">
                    <p className="vs-property-city">
                      <MapPin size={12} />
                      {p.city}
                    </p>
                    <h3>
                      <button onClick={() => setSelected(p)}>{p.title}</button>
                    </h3>
                    <div className="vs-property-specs">
                      <span>
                        <BedDouble size={15} />
                        {p.bedrooms ?? "—"} dorm.
                      </span>
                      <span>
                        <Bath size={15} />
                        {p.bathrooms ?? "—"} banh.
                      </span>
                      <span>
                        <Ruler size={15} />
                        {p.area_m2
                          ? p.area_m2.toLocaleString("pt-BR") + " m²"
                          : "Área sob consulta"}
                      </span>
                    </div>
                    <p className="vs-property-description">
                      {p.description ??
                        "Conheça os detalhes deste empreendimento com a Vanessa."}
                    </p>
                    <div className="vs-property-price">
                      <span>Valor do imóvel</span>
                      <strong>
                        {p.price ? money(p.price) : "Sob consulta"}
                      </strong>
                    </div>
                    <dl className="vs-property-conditions">
                      {p.show_parcel && p.monthly_parcel ? (
                        <div>
                          <dt>Parcela estimada a partir de</dt>
                          <dd>{money(p.monthly_parcel)}/mês</dd>
                        </div>
                      ) : null}
                      {p.show_down_payment && p.down_payment ? (
                        <div>
                          <dt>Renda mínima informada</dt>
                          <dd>{money(p.down_payment)}</dd>
                        </div>
                      ) : null}
                      {p.subsidy_estimate ? (
                        <div>
                          <dt>Subsídio informado até</dt>
                          <dd>{money(p.subsidy_estimate)}</dd>
                        </div>
                      ) : null}
                      {p.launch_date &&
                      p.construction_status === "na_planta" ? (
                        <div>
                          <dt>Previsão de entrega</dt>
                          <dd>{formatLaunch(p.launch_date)}</dd>
                        </div>
                      ) : null}
                      {p.plans?.length ? (
                        <div>
                          <dt>Plantas</dt>
                          <dd>
                            {p.plans.length}{" "}
                            {p.plans.length === 1 ? "opção" : "opções"}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="vs-property-actions">
                      <button
                        className="vs-button"
                        onClick={() => setSelected(p)}
                      >
                        Conhecer imóvel <ArrowRight size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={()=>setSelected(p)}
                        aria-label={
                          "Conversar sobre " + p.title + " no WhatsApp"
                        }
                      >
                        <MessageCircle size={19} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {!loading && hiddenCount > 0 && (
          <div className="vs-listings-more">
            <button
              className="vs-text-link"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? "Mostrar menos"
                : "Ver mais " + hiddenCount + " imóveis"}{" "}
              <ArrowRight size={16} />
            </button>
          </div>
        )}
        <p className="vs-listings-disclaimer">
          Valores e disponibilidade sujeitos à confirmação da corretora. O
          financiamento depende da análise da instituição financeira.
        </p>
      </div>
      <PropertyDetailDialog
        property={selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </section>
  );
};
export default PropertiesSection;
