type BrowserEnv = Record<string, string | boolean | undefined>;

export type GoogleMapsBrowserConfig = {
  browserKey: string | null;
  trackingId: string | null;
  source: "mkton" | "missing";
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Google Maps da MKTOn usa exclusivamente a browser key própria da plataforma.
 * O carregamento não depende do conector Google Maps gerenciado pela Lovable,
 * evitando o gate de domínio próprio da plataforma de hospedagem.
 *
 * Google Maps browser keys não são secrets: elas chegam ao navegador por design.
 * A proteção real deve ser feita no Google Cloud por HTTP referrer + API restrictions.
 */
export function resolveGoogleMapsBrowserConfig(
  env: BrowserEnv,
  _hostname?: string | null,
): GoogleMapsBrowserConfig {
  const mktonKey = clean(env.VITE_GOOGLE_MAPS_BROWSER_KEY);
  const mktonTrackingId = clean(env.VITE_GOOGLE_MAPS_TRACKING_ID);

  if (mktonKey) {
    return { browserKey: mktonKey, trackingId: mktonTrackingId, source: "mkton" };
  }

  return { browserKey: null, trackingId: null, source: "missing" };
}
