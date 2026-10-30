import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

const PIXEL_SRC =
  "https://saudeslim.com.br/api/public/track/px.js?w=pk_d16029edf0ee4a15be7c3fd1b104b84e";

/**
 * Caminhos públicos onde o pixel MKTOn pode rodar: página de vendas,
 * cadastro/login, checkout, planos e conteúdo institucional.
 * Nenhuma rota interna do app (CRM, inbox, módulos, configurações…) é
 * rastreada — dentro do painel não há nada de marketing a medir e rastrear
 * o uso do sistema seria invasão de privacidade do cliente.
 */
const PUBLIC_PREFIXES = [
  "/auth",
  "/admin",
  "/checkout",
  "/planos",
  "/blog",
  "/sobre",
  "/faculdade",
  "/afiliados",
  "/ajuda",
  "/termos",
  "/privacidade",
  "/l/",
  "/f/",
];

function isPublicMarketingPath(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/** Carrega o pixel apenas nas páginas públicas de marketing. */
export function MktonPixel() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!isPublicMarketingPath(pathname)) return;
    if (document.getElementById("mkton-pixel")) return;
    const s = document.createElement("script");
    s.id = "mkton-pixel";
    s.async = true;
    s.src = PIXEL_SRC;
    document.head.appendChild(s);
  }, [pathname]);

  return null;
}
