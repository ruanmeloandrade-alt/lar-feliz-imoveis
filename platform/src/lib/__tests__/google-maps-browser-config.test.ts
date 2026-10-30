import { describe, expect, it } from "vitest";
import { resolveGoogleMapsBrowserConfig } from "@/lib/google-maps-browser-config";

describe("resolveGoogleMapsBrowserConfig", () => {
  it("usa a chave própria da MKTOn no domínio mkton.io", () => {
    expect(resolveGoogleMapsBrowserConfig({
      VITE_GOOGLE_MAPS_BROWSER_KEY: "mkton-key",
    }, "mkton.io")).toEqual({
      browserKey: "mkton-key",
      trackingId: null,
      source: "mkton",
    });
  });

  it("usa a mesma chave própria em www.mkton.io", () => {
    expect(resolveGoogleMapsBrowserConfig({
      VITE_GOOGLE_MAPS_BROWSER_KEY: "mkton-key",
    }, "www.mkton.io")).toEqual({
      browserKey: "mkton-key",
      trackingId: null,
      source: "mkton",
    });
  });

  it("não depende de configuração de conector da plataforma de hospedagem", () => {
    expect(resolveGoogleMapsBrowserConfig({
      VITE_GOOGLE_MAPS_BROWSER_KEY: "mkton-key",
      VITE_GOOGLE_MAPS_TRACKING_ID: "mkton-channel",
    }, "code-to-lovely-ui.lovable.app")).toEqual({
      browserKey: "mkton-key",
      trackingId: "mkton-channel",
      source: "mkton",
    });
  });

  it("sinaliza ausência quando a chave própria não está configurada", () => {
    expect(resolveGoogleMapsBrowserConfig({}, "mkton.io")).toEqual({
      browserKey: null,
      trackingId: null,
      source: "missing",
    });
  });
});
