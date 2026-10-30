import { createStart } from "@tanstack/react-start";

// Vanessa Simoni usa Supabase Auth/RLS diretamente nas rotas migradas.
// Middleware global foi temporariamente desativado após o bundle SSR
// gerar "createMiddleware is not a function" e impedir todas as páginas.
// Funções server-side legadas ficam pendentes de validação/autorização.
export const startInstance = createStart(() => ({
  defaultSsr: false,
}));
