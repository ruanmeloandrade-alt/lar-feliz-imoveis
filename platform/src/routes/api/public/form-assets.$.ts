// Rota pública que streama qualquer arquivo do bucket privado `form-assets`.
// Usada como URL "pública" para logos de formulário e anexos de submissão.
// Tudo aqui é read-only, os uploads passam por server functions com validação.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/form-assets/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = (params as { _splat?: string })._splat ?? "";
        // Bloqueia path traversal
        if (!raw || raw.includes("..") || raw.startsWith("/")) {
          return new Response("Bad Request", { status: 400 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.storage
            .from("form-assets")
            .download(raw);

          if (error || !data) {
            return new Response("Not Found", { status: 404 });
          }

          const bytes = new Uint8Array(await data.arrayBuffer());
          const contentType = (data as Blob).type || "application/octet-stream";

          return new Response(bytes, {
            status: 200,
            headers: {
              "content-type": contentType,
              "cache-control": "public, max-age=31536000, immutable",
              "x-content-type-options": "nosniff",
            },
          });
        } catch (e) {
          return new Response(`Error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
        }
      },
    },
  },
});
