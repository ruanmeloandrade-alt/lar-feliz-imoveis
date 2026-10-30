/// <reference types="google.maps" />
import { useEffect, useRef, useState, useCallback } from "react";
import { Search, MapPin, Trash2, Plus, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { resolveGoogleMapsBrowserConfig } from "@/lib/google-maps-browser-config";

/**
 * Seletor de localização no mapa (estilo Meta Ads Manager).
 * - Adiciona pinos clicando no mapa ou buscando endereço via Places API (New)
 * - Raio ajustável 1-80 km por pino (limite Meta)
 * - Máx. 20 pinos totais (incluir + excluir)
 * - Alternar incluir/excluir por pino
 * - Envia { latitude, longitude, radius, distance_unit, name } → geo_locations.custom_locations
 */
export type MapPin = {
  id: string;
  latitude: number;
  longitude: number;
  radius: number; // km
  mode: "include" | "exclude";
  name?: string;
  address?: string;
};

const META_MAX_PINS = 20;

// Loader único da API do Google Maps
let mapsPromise: Promise<typeof google> | null = null;
function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if ((window as unknown as { google?: typeof google }).google?.maps) return Promise.resolve((window as unknown as { google: typeof google }).google);
  if (mapsPromise) return mapsPromise;

  const mapsConfig = resolveGoogleMapsBrowserConfig(
    import.meta.env as Record<string, string | boolean | undefined>,
    window.location.hostname,
  );
  if (!mapsConfig.browserKey) return Promise.reject(new Error("Google Maps browser key não configurada"));

  mapsPromise = new Promise((resolve, reject) => {
    const cbName = `__mktonInitGmaps_${Math.random().toString(36).slice(2, 8)}`;
    (window as unknown as Record<string, unknown>)[cbName] = () => {
      resolve((window as unknown as { google: typeof google }).google);
      delete (window as unknown as Record<string, unknown>)[cbName];
    };
    const s = document.createElement("script");
    const params = new URLSearchParams({
      key: mapsConfig.browserKey,
      libraries: "places",
      loading: "async",
      callback: cbName,
    });
    if (mapsConfig.trackingId) params.set("channel", mapsConfig.trackingId);
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.onerror = () => reject(new Error("Falha ao carregar Google Maps"));
    document.head.appendChild(s);
  });
  return mapsPromise;
}

export function MapLocationSelector({
  pins,
  onChange,
}: {
  pins: MapPin[];
  onChange: (pins: MapPin[]) => void;
}) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, { marker: google.maps.Marker; circle: google.maps.Circle }>>(new Map());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ placeId: string; text: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const pinsRef = useRef(pins);
  useEffect(() => { pinsRef.current = pins; }, [pins]);

  // Inicializa mapa
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !mapDivRef.current) return;
        mapRef.current = new g.maps.Map(mapDivRef.current, {
          center: { lat: -14.235, lng: -51.925 }, // Brasil
          zoom: 4,
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: false,
          clickableIcons: false,
        });
        mapRef.current.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const total = pinsRef.current.length;
          if (total >= META_MAX_PINS) return;
          const newPin: MapPin = {
            id: crypto.randomUUID(),
            latitude: e.latLng.lat(),
            longitude: e.latLng.lng(),
            radius: 10,
            mode: "include",
          };
          onChange([...pinsRef.current, newPin]);
        });
        setReady(true);
      })
      .catch((e: Error) => setError(e.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza marcadores + círculos com os pinos
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as unknown as { google: typeof google }).google;
    const seen = new Set<string>();
    for (const p of pins) {
      seen.add(p.id);
      const color = p.mode === "exclude" ? "#dc2626" : "#7c3aed";
      const existing = markersRef.current.get(p.id);
      if (existing) {
        existing.marker.setPosition({ lat: p.latitude, lng: p.longitude });
        existing.circle.setCenter({ lat: p.latitude, lng: p.longitude });
        existing.circle.setRadius(p.radius * 1000);
        existing.circle.setOptions({ fillColor: color, strokeColor: color });
        existing.marker.setIcon({
          path: g.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        });
      } else {
        const marker = new g.maps.Marker({
          position: { lat: p.latitude, lng: p.longitude },
          map: mapRef.current,
          draggable: true,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        });
        const circle = new g.maps.Circle({
          map: mapRef.current,
          center: { lat: p.latitude, lng: p.longitude },
          radius: p.radius * 1000,
          fillColor: color,
          fillOpacity: 0.12,
          strokeColor: color,
          strokeOpacity: 0.6,
          strokeWeight: 1.5,
        });
        marker.addListener("dragend", () => {
          const pos = marker.getPosition();
          if (!pos) return;
          onChange(pinsRef.current.map((x) => x.id === p.id ? { ...x, latitude: pos.lat(), longitude: pos.lng() } : x));
        });
        markersRef.current.set(p.id, { marker, circle });
      }
    }
    // Remove pinos apagados
    for (const [id, { marker, circle }] of markersRef.current.entries()) {
      if (!seen.has(id)) {
        marker.setMap(null);
        circle.setMap(null);
        markersRef.current.delete(id);
      }
    }
  }, [pins, ready, onChange]);

  // Autocomplete Places API (New)
  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSuggestions([]); setSearchError(null); return; }
    setSearching(true);
    setSearchError(null);
    try {
      const g = await loadGoogleMaps();
      const { AutocompleteSuggestion, AutocompleteSessionToken } = await g.maps.importLibrary("places") as google.maps.PlacesLibrary;
      if (!sessionTokenRef.current) sessionTokenRef.current = new AutocompleteSessionToken();
      const { suggestions: sug } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q,
        sessionToken: sessionTokenRef.current,
        includedRegionCodes: ["br"],
        language: "pt-BR",
      });
      const items = sug.slice(0, 6).map((s) => ({
        placeId: s.placePrediction?.placeId ?? "",
        text: s.placePrediction?.text?.toString() ?? "",
      })).filter((s) => s.placeId);
      setSuggestions(items);
      if (items.length === 0) setSearchError("Nenhum endereço encontrado. Tente incluir cidade, estado ou CEP.");
    } catch (e) {
      setSuggestions([]);
      setSearchError(e instanceof Error ? `Busca de endereço indisponível: ${e.message}` : "Busca de endereço indisponível no momento.");
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(search), 250);
    return () => clearTimeout(t);
  }, [search, runSearch]);

  async function pickSuggestion(placeId: string, text: string) {
    setSearch("");
    setSuggestions([]);
    setSearchError(null);
    try {
      const g = await loadGoogleMaps();
      const { Place } = await g.maps.importLibrary("places") as google.maps.PlacesLibrary;
      const place = new Place({ id: placeId, requestedLanguage: "pt-BR" });
      await place.fetchFields({ fields: ["location", "formattedAddress", "displayName"] });
      if (!place.location) {
        setSearchError("O Google encontrou o endereço, mas não retornou coordenadas. Tente outra descrição.");
        return;
      }
      const lat = place.location.lat();
      const lng = place.location.lng();
      if (pinsRef.current.length >= META_MAX_PINS) return;
      const newPin: MapPin = {
        id: crypto.randomUUID(),
        latitude: lat,
        longitude: lng,
        radius: 10,
        mode: "include",
        name: place.displayName ?? text,
        address: place.formattedAddress ?? text,
      };
      onChange([...pinsRef.current, newPin]);
      sessionTokenRef.current = null; // encerra sessão
      if (mapRef.current) {
        mapRef.current.panTo({ lat, lng });
        mapRef.current.setZoom(12);
      }
    } catch (e) {
      console.warn("[MapLocationSelector] pickSuggestion falhou:", e);
      setSearchError(e instanceof Error ? `Não foi possível abrir este endereço: ${e.message}` : "Não foi possível abrir este endereço.");
    }
  }

  function updatePin(id: string, patch: Partial<MapPin>) {
    onChange(pins.map((p) => p.id === id ? { ...p, ...patch } : p));
  }
  function removePin(id: string) { onChange(pins.filter((p) => p.id !== id)); }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
        Não foi possível carregar o mapa: {error}. Confira a conexão do Google Maps.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSearchError(null); }}
          placeholder="Busque endereço, rua, bairro, cidade ou CEP…"
          className="pl-8"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">Buscando…</div>
        )}
        {suggestions.length > 0 && (
          <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-lg max-h-56 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s.placeId}
                type="button"
                onClick={() => pickSuggestion(s.placeId, s.text)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center gap-2"
              >
                <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="truncate">{s.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {searchError && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          {searchError}
        </div>
      )}

      <div
        ref={mapDivRef}
        className="w-full h-[360px] rounded-lg border border-border overflow-hidden bg-muted"
      />

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Clique no mapa para adicionar pino · arraste para mover · máx. {META_MAX_PINS} pinos (limite Meta)</span>
        <span>{pins.length}/{META_MAX_PINS}</span>
      </div>

      {pins.length > 0 && (
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {pins.map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${p.mode === "exclude" ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40"}`}
            >
              <MapPin className={`w-3.5 h-3.5 shrink-0 ${p.mode === "exclude" ? "text-destructive" : "text-primary"}`} />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">
                  {p.name || `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`}
                </div>
                {p.address && p.address !== p.name && (
                  <div className="truncate text-[10px] text-muted-foreground">{p.address}</div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updatePin(p.id, { radius: Math.max(1, p.radius - 1) })}
                  className="p-1 hover:bg-background rounded"
                  title="Reduzir raio"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={p.radius}
                  onChange={(e) => updatePin(p.id, { radius: Math.min(80, Math.max(1, Number(e.target.value) || 1)) })}
                  className="w-12 bg-transparent border border-border rounded px-1 py-0.5 text-center text-xs"
                />
                <button
                  type="button"
                  onClick={() => updatePin(p.id, { radius: Math.min(80, p.radius + 1) })}
                  className="p-1 hover:bg-background rounded"
                  title="Aumentar raio"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <span className="text-[10px] text-muted-foreground">km</span>
              </div>
              <button
                type="button"
                onClick={() => updatePin(p.id, { mode: p.mode === "include" ? "exclude" : "include" })}
                className={`px-2 py-0.5 rounded text-[10px] font-medium ${p.mode === "exclude" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}
                title="Alternar incluir/excluir"
              >
                {p.mode === "exclude" ? "excluir" : "incluir"}
              </button>
              <button
                type="button"
                onClick={() => removePin(p.id)}
                className="p-1 hover:bg-background rounded text-muted-foreground hover:text-destructive"
                title="Remover pino"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
